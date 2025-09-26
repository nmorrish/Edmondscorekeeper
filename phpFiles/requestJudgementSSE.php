<?php
/**
 * phpFiles/requestJudgementSSE.php
 *
 * SSE endpoint that watches for updates to `Matches.lastMatchJudgement`
 * for matches in a specific ring. When updated, sends:
 *   - matchId
 *   - ring number
 *   - fighters (id, name, color)
 *   - latestExchangeId
 *   - lastJudgement timestamp
 *
 * GET parameter:
 *   ?ringNumber=1
 *
 * Initial connection:
 *   Sends `null` (signals ready but no update yet).
 *
 * On update:
 * {
 *   "matchId": 42,
 *   "matchRing": 1,
 *   "fighters": [
 *     { "fighterId": 11, "fighterName": "Alice", "fighterColor": "Red" },
 *     { "fighterId": 12, "fighterName": "Bob",   "fighterColor": "Blue" }
 *   ],
 *   "latestExchangeId": 123,
 *   "lastJudgement": "2025-04-13 12:34:56"
 * }
 *
 * On error:
 * {
 *   "status": "error",
 *   "message": "..."
 * }
 */

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

require_once("connect.php");

// --- util: send SSE packet ---
function sendSSEData($data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $json . "\n\n";
    ob_flush();
    flush();
}

// --- validate input ---
$ringNumber = isset($_GET['ringNumber']) ? intval($_GET['ringNumber']) : null;
if ($ringNumber === null || $ringNumber <= 0) {
    sendSSEData(['status' => 'error', 'message' => 'Ring number not provided']);
    exit;
}

try {
    $db = connect();
} catch (PDOException $e) {
    error_log("DB connect failed: " . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection failed']);
    exit;
}

$lastJudgement = null;

// --- prepared query: get most recent judgement in this ring ---
$stmtLatest = $db->prepare("
    SELECT m.MatchId, m.lastMatchJudgement
    FROM Matches m
    WHERE m.MatchRingNo = :ring
    ORDER BY m.lastMatchJudgement DESC
    LIMIT 1
");
$stmtLatest->bindParam(':ring', $ringNumber, PDO::PARAM_INT);

while (true) {
    try {
        $stmtLatest->execute();
        $result = $stmtLatest->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $matchId = (int)$result['MatchId'];
            $currentJudgement = $result['lastMatchJudgement'];

            if ($lastJudgement !== null && $currentJudgement !== $lastJudgement) {
                // --- fetch fighters for this match ---
                $stmtDetails = $db->prepare("
                    SELECT mf.FighterId, f.FighterName, mf.FighterColor
                    FROM MatchFighters mf
                    JOIN Fighters f ON mf.FighterId = f.FighterId
                    WHERE mf.MatchId = :mid
                ");
                $stmtDetails->execute([':mid' => $matchId]);
                $fighters = $stmtDetails->fetchAll(PDO::FETCH_ASSOC);

                // --- fetch latest exchange tied to this match ---
                $stmtExchange = $db->prepare("
                    SELECT MAX(e.ExchangeId) AS latestExchangeId
                    FROM Exchanges e
                    INNER JOIN MatchFighters mf ON e.MatchFighterId = mf.MatchFighterId
                    WHERE mf.MatchId = :mid
                ");
                $stmtExchange->execute([':mid' => $matchId]);
                $latestExchangeId = $stmtExchange->fetchColumn();

                $payload = [
                    'matchId' => $matchId,
                    'matchRing' => $ringNumber,
                    'fighters' => $fighters,
                    'latestExchangeId' => $latestExchangeId ? (int)$latestExchangeId : null,
                    'lastJudgement' => $currentJudgement
                ];
                sendSSEData($payload);
                $lastJudgement = $currentJudgement;
            }

            if ($lastJudgement === null) {
                // first connect: send null so frontend knows stream is live
                sendSSEData(null);
                $lastJudgement = $currentJudgement;
            }
        }

    } catch (PDOException $e) {
        error_log("Loop query failed: " . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Query failed in loop']);
    }

    sleep(5); // poll interval
}
