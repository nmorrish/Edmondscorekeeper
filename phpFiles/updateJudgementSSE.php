<?php
/**
 * updateJudgementSSE.php
 * 
 * SSE stream that monitors Matches within a ring for changes 
 * to the MatchFighters.lastJudgement timestamp. When a change is detected, 
 * it fetches the associated MatchId + FighterId and pushes it to the client.
 * 
 * Intended to keep scorekeepers updated without manual refresh.
 * 
 * Expects a persistent SSE connection with a query param:
 *   /updateJudgementSSE.php?ringNumber=1
 * 
 * On initial connection:
 *   Sends a null event to acknowledge the stream.
 * 
 * On update:
 * {
 *   "status": "Match updated",
 *   "matchId": 42,
 *   "matchFighterId": 101,
 *   "lastJudgement": "2025-04-13 12:34:56"
 * }
 * 
 * On error:
 * {
 *   "status": "error",
 *   "message": "error message"
 * }
 */

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

require_once("connect.php");

/**
 * Utility: Send data to the SSE stream
 */
function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    ob_flush();
    flush();
}

// Validate ring number
$ringNumber = isset($_GET['ringNumber']) ? intval($_GET['ringNumber']) : null;
if ($ringNumber === null || $ringNumber <= 0) {
    sendSSEData(['status' => 'error', 'message' => 'Invalid or missing ringNumber parameter']);
    exit;
}

try {
    $db = connect();
    error_log("SSE Script: Connected to DB for updateJudgementSSE (ring {$ringNumber}).");
} catch (PDOException $e) {
    error_log("Database connection failed: " . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection failed']);
    exit;
}

// Initial null event to acknowledge the connection
sendSSEData(null);

$lastUpdateTime = null;

while (true) {
    try {
        // Find the most recent fighter judgement in this ring
        $stmt = $db->prepare("
            SELECT MAX(mf.lastJudgement) AS lastUpdateTime
            FROM MatchFighters mf
            INNER JOIN Matches m ON mf.MatchId = m.MatchId
            WHERE m.MatchRingNo = :ring
        ");
        $stmt->execute([':ring' => $ringNumber]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentUpdateTime = $result['lastUpdateTime'] ?? null;

        if ($currentUpdateTime !== null && $lastUpdateTime !== $currentUpdateTime) {
            // Find the fighter + match tied to that timestamp
            $stmt = $db->prepare("
                SELECT m.MatchId, mf.MatchFighterId, mf.lastJudgement
                FROM MatchFighters mf
                INNER JOIN Matches m ON mf.MatchId = m.MatchId
                WHERE m.MatchRingNo = :ring
                  AND mf.lastJudgement = :ts
                ORDER BY mf.MatchFighterId DESC
                LIMIT 1
            ");
            $stmt->execute([
                ':ring' => $ringNumber,
                ':ts'   => $currentUpdateTime
            ]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($row) {
                sendSSEData([
                    'status' => 'Match updated',
                    'matchId' => (int)$row['MatchId'],
                    'matchFighterId' => (int)$row['MatchFighterId'],
                    'lastJudgement' => $row['lastJudgement']
                ]);
                $lastUpdateTime = $currentUpdateTime;
            } else {
                sendSSEData(['status' => 'error', 'message' => 'No fighter found for updated timestamp']);
            }
        }
    } catch (PDOException $e) {
        error_log("Query error in SSE loop: " . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Database query error']);
    }

    // Poll every 5 seconds
    sleep(5);
}
