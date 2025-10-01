<?php
/**
 * phpFiles/testGenerateScores.php
 *
 * === Test Script (with debug) ===
 * POST { tournamentId, eventId }
 * - Finds first pending match in the event
 * - Sets it active
 * - Inserts 6–8 random exchanges with random scores
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

// Short-circuit OPTIONS preflight
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    $raw = file_get_contents("php://input");
    $data = json_decode($raw, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception("JSON parse error: " . json_last_error_msg() . " | Raw: $raw");
    }

    $tournamentId = (int)($data["tournamentId"] ?? 0);
    $eventId      = (int)($data["eventId"] ?? 0);

    if (!$tournamentId || !$eventId) {
        throw new Exception("Missing tournamentId or eventId. Decoded=" . json_encode($data));
    }

    // 1. Find first pending match
    $stmt = $db->prepare("
        SELECT m.MatchId
        FROM Matches m
        JOIN Events e ON e.EventId = m.EventId
        WHERE e.EventId = ? 
          AND e.TournamentId = ?
          AND m.PendingActiveDone = 'P'
        ORDER BY m.MatchQueueNumber ASC, m.MatchId ASC
        LIMIT 1
    ");
    $stmt->execute([$eventId, $tournamentId]);
    $matchId = $stmt->fetchColumn();

    if (!$matchId) {
        throw new Exception("No pending matches for eventId=$eventId, tournamentId=$tournamentId");
    }

    // 2. Set match to Active
    $db->prepare("UPDATE Matches SET PendingActiveDone = 'A' WHERE MatchId = ?")
       ->execute([$matchId]);

    // 3. Get fighters
    $fightersStmt = $db->prepare("SELECT MatchFighterId, FighterId FROM MatchFighters WHERE MatchId = ?");
    $fightersStmt->execute([$matchId]);
    $fighters = $fightersStmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($fighters) < 2) {
        throw new Exception("Match $matchId has fewer than 2 fighters: " . json_encode($fighters));
    }

    // 4. Generate 6–8 random exchanges
    $numExchanges = rand(6, 8);
    $exchangeIds = [];

    for ($i = 0; $i < $numExchanges; $i++) {
        // Pick random fighter as the scorer
        $scorer = $fighters[array_rand($fighters)];
        $opponent = null;
        foreach ($fighters as $f) {
            if ($f['MatchFighterId'] != $scorer['MatchFighterId']) {
                $opponent = $f;
                break;
            }
        }

        // --- Scorer exchange ---
        $stmtEx = $db->prepare("INSERT INTO Exchanges (MatchFighterId, ExchangeTimeStamp) VALUES (?, CURRENT_TIMESTAMP)");
        $stmtEx->execute([$scorer["MatchFighterId"]]);
        $exchangeId = $db->lastInsertId();
        $exchangeIds[] = $exchangeId;

        $contact = 1;
        $target  = rand(0, 1);
        $control = rand(0, 1);
        $doubleHit = 0;
        $afterBlow = 0;
        $opponentSelfCall = 0;

        $stmtSc = $db->prepare("
            INSERT INTO ExchangeScores 
                (ExchangeId, JudgeName, Contact, Target, Control, DoubleHit, AfterBlow, OpponentSelfCall, ScoreTimeStamp)
            VALUES (?, 'TestJudge', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");
        $stmtSc->execute([$exchangeId, $contact, $target, $control, $doubleHit, $afterBlow, $opponentSelfCall]);

        // --- Opponent exchange (zero score) ---
        if ($opponent) {
            $stmtEx2 = $db->prepare("INSERT INTO Exchanges (MatchFighterId, ExchangeTimeStamp) VALUES (?, CURRENT_TIMESTAMP)");
            $stmtEx2->execute([$opponent["MatchFighterId"]]);
            $oppExchangeId = $db->lastInsertId();
            $exchangeIds[] = $oppExchangeId;

            $stmtSc2 = $db->prepare("
                INSERT INTO ExchangeScores 
                    (ExchangeId, JudgeName, Contact, Target, Control, DoubleHit, AfterBlow, OpponentSelfCall, ScoreTimeStamp)
                VALUES (?, 'TestJudge', 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP)
            ");
            $stmtSc2->execute([$oppExchangeId]);
        }
    }

    echo json_encode([
        "status"      => "success",
        "message"     => "Match $matchId set active with $numExchanges random exchanges.",
        "exchangeIds" => $exchangeIds
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => $e->getMessage()
    ]);
} finally {
    $db = null;
}
