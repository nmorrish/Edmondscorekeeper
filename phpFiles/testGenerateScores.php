<?php
/**
 * phpFiles/testGenerateScores.php
 *
 * === Test Script (with debug) ===
 * POST { tournamentId, eventId }
 * - Finds first pending match in the event
 * - Sets it active
 * - Inserts 6–8 random exchanges with random scores
 * - Creates exactly 5 ExchangeScores per fighter per exchange with judges "Test 1"…"Test 5"
 * - Ensures no match ends in a tie
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

    // Helpers to compute totals and to fetch/adjust last judge row
    $mfA = (int)$fighters[0]['MatchFighterId'];
    $mfB = (int)$fighters[1]['MatchFighterId'];

    $computeTotals = function(PDO $db, int $matchId) {
        // Totals mirror UI-style aggregation:
        // grand_total = (SUM(Contact) + SUM(Target) + SUM(Control)) / 5
        // (5 judges per exchange)
        $sql = "
            SELECT ex.MatchFighterId AS MFId,
                   COALESCE(SUM(es.Contact),0)   AS sum_contact,
                   COALESCE(SUM(es.Target),0)    AS sum_target,
                   COALESCE(SUM(es.Control),0)   AS sum_control
            FROM Exchanges ex
            JOIN ExchangeScores es ON es.ExchangeId = ex.ExchangeId
            JOIN MatchFighters mf ON mf.MatchFighterId = ex.MatchFighterId
            WHERE mf.MatchId = ?
            GROUP BY ex.MatchFighterId
        ";
        $st = $db->prepare($sql);
        $st->execute([$matchId]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);

        $totals = [];
        foreach ($rows as $r) {
            $mfId = (int)$r['MFId'];
            $contact = ((float)$r['sum_contact']) / 5.0;
            $target  = ((float)$r['sum_target'])  / 5.0;
            $control = ((float)$r['sum_control']) / 5.0;
            $grand   = $contact + $target + $control; // A/B, Calls, Doubles are 0 for testing
            $totals[$mfId] = [
                'contact' => $contact,
                'target'  => $target,
                'control' => $control,
                'grand'   => $grand,
            ];
        }
        return $totals;
    };

    $getLastJudgeRow = function(PDO $db, int $matchId) {
        // Last judge row inserted for this match (both fighters)
        $sql = "
            SELECT es.ExchangeId, es.Contact, es.Target, es.Control, ex.ExchangeId, ex.MatchFighterId
            FROM ExchangeScores es
            JOIN Exchanges ex ON ex.ExchangeId = es.ExchangeId
            JOIN MatchFighters mf ON mf.MatchFighterId = ex.MatchFighterId
            WHERE mf.MatchId = ?
            ORDER BY es.ExchangeId DESC
            LIMIT 1
        ";
        $st = $db->prepare($sql);
        $st->execute([$matchId]);
        return $st->fetch(PDO::FETCH_ASSOC) ?: null;
    };

    $adjustJudgeRowMinimal = function(PDO $db, array $row) {
        // Minimal adjustment to last assigned scoring criteria:
        // Preference to ADD a point (0->1). If fully saturated, REMOVE one point (1->0) on Control.
        $id = (int)$row['ExchangeId'];
        $c  = (int)$row['Contact'];
        $t  = (int)$row['Target'];
        $k  = (int)$row['Control'];

        if ($c === 0) {
            $c = 1; // ensure gating contributes if UI/logic gates on contact
        } elseif ($t === 0) {
            $t = 1;
        } elseif ($k === 0) {
            $k = 1;
        } else {
            // All are 1 -> remove one point from the last criterion (Control) to break tie
            $k = 0;
        }

        $upd = $db->prepare("UPDATE ExchangeScores SET Contact=?, Target=?, Control=? WHERE ExchangeId=?");
        $upd->execute([$c, $t, $k, $id]);
    };

    // 4. Generate 6–8 random exchanges
    $numExchanges = rand(6, 8);
    $exchangeIds  = [];
    $lastScorerExchangeId = null; // tracks last non-zero (scorer) exchange id

    // Use a transaction so the tie-breaker sees a consistent set
    $db->beginTransaction();

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
        $exchangeId = (int)$db->lastInsertId();
        $exchangeIds[] = $exchangeId;
        $lastScorerExchangeId = $exchangeId;

        // Insert 5 judge scores for scorer 
        $stmtSc = $db->prepare("
            INSERT INTO ExchangeScores 
                (ExchangeId, JudgeName, Contact, Target, Control, DoubleHit, AfterBlow, OpponentSelfCall, ScoreTimeStamp)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP)
        ");
        for ($j = 1; $j <= 5; $j++) {
            $contact = 1;          //must have contact if scoring
            $target  = rand(0, 1); // random
            $control = rand(0, 1); // random
            $stmtSc->execute([$exchangeId, "Test $j", $contact, $target, $control]);
        }

        // Two score exchanges are submetted per fighter per exchange. Ideally, if one fighter wins an exchange, thier opponent has a score of zero. Opponent score of zero is applied here/
        if ($opponent) {
            $stmtEx2 = $db->prepare("INSERT INTO Exchanges (MatchFighterId, ExchangeTimeStamp) VALUES (?, CURRENT_TIMESTAMP)");
            $stmtEx2->execute([$opponent["MatchFighterId"]]);
            $oppExchangeId = (int)$db->lastInsertId();
            $exchangeIds[] = $oppExchangeId;

            $stmtSc2 = $db->prepare("
                INSERT INTO ExchangeScores 
                    (ExchangeId, JudgeName, Contact, Target, Control, DoubleHit, AfterBlow, OpponentSelfCall, ScoreTimeStamp)
                VALUES (?, ?, 0, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP)
            ");
            for ($j = 1; $j <= 5; $j++) {
                $stmtSc2->execute([$oppExchangeId, "Test $j"]);
            }
        }
    }

    // === Tie breaker ===
    // Compute grand totals exactly as UI does (sum of judge flags / 5)
    $totals = $computeTotals($db, $matchId);
    $grandA = isset($totals[$mfA]) ? $totals[$mfA]['grand'] : 0.0;
    $grandB = isset($totals[$mfB]) ? $totals[$mfB]['grand'] : 0.0;

    // Use epsilon for float equality
    $epsilon = 1e-9;
    if (abs($grandA - $grandB) < $epsilon) {
        // Adjust the **last assigned judge row** across the match
        $lastRow = $getLastJudgeRow($db, $matchId);

        if ($lastRow) {
            // First attempt: add a point on the last judge row if possible,
            // otherwise remove one (on Control) to ensure a non-tie outcome.
            $adjustJudgeRowMinimal($db, $lastRow);

            //re-check to be absolutely sure
            $totalsAfter = $computeTotals($db, $matchId);
            $grandA2 = isset($totalsAfter[$mfA]) ? $totalsAfter[$mfA]['grand'] : 0.0;
            $grandB2 = isset($totalsAfter[$mfB]) ? $totalsAfter[$mfB]['grand'] : 0.0;
            if (abs($grandA2 - $grandB2) < $epsilon) {
                // As a final fallback (extremely unlikely), flip Control on the same last row again
                $lastRow2 = $getLastJudgeRow($db, $matchId);
                if ($lastRow2) {
                    $upd = $db->prepare("UPDATE ExchangeScores SET Control = CASE WHEN Control=1 THEN 0 ELSE 1 END WHERE ExchangeId = ?");
                    $upd->execute([(int)$lastRow2['ExchangeId']]);
                }
            }
        }
    }

    $db->commit();

    // Set match to Done after initial scores have been committed to the DB
    $db->prepare("UPDATE Matches SET PendingActiveDone = 'D' WHERE MatchId = ?")
       ->execute([$matchId]);

    echo json_encode([
        "status"      => "success",
        "message"     => "Match $matchId filled with $numExchanges exchanges scored randomly by 5 judges."
    ]);

} catch (Exception $e) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => $e->getMessage()
    ]);
} finally {
    $db = null;
}
