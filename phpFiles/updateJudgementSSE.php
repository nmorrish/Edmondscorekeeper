<?php
/**
 * phpFiles/updateJudgementSSE.php
 *
 * SSE stream that monitors ExchangeScores for new rows.
 * When a new score row is detected, it fetches the associated MatchId
 * and notifies connected clients.
 *
 * {
 *   "status": "Match updated",
 *   "matchId": 42
 * }
 */

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Let this script run indefinitely, but exit when client disconnects
set_time_limit(0);
ignore_user_abort(false);

require_once("connect.php");

function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    @ob_flush();
    @flush();
}

try {
    $db = connect();
    error_log("SSE Script: Connected to DB.");
} catch (PDOException $e) {
    error_log('DB connect failed: ' . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection error']);
    exit;
}

// Suggest a retry interval if the connection drops
echo "retry: 5000\n\n";

sendSSEData(null); // handshake
$lastSeenId = null;
$counter = 0;

while (true) {
    // Stop if client closed the connection
    if (connection_aborted()) {
        break;
    }

    try {
        $stmt = $db->query("SELECT MAX(ExchangeScoresId) AS lastId FROM ExchangeScores");
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentId = $result['lastId'] ?? null;

        if ($currentId && $currentId !== $lastSeenId) {
            $stmt = $db->prepare("
                SELECT m.MatchId
                FROM ExchangeScores s
                JOIN Exchanges e ON s.ExchangeId = e.ExchangeId
                JOIN MatchFighters mf ON e.MatchFighterId = mf.MatchFighterId
                JOIN Matches m ON mf.MatchId = m.MatchId
                WHERE s.ExchangeScoresId = :id
                LIMIT 1
            ");
            $stmt->bindValue(':id', $currentId, PDO::PARAM_INT);
            $stmt->execute();
            $matchId = $stmt->fetchColumn();

            if ($matchId) {
                sendSSEData(['status' => 'Match updated', 'matchId' => (int)$matchId]);
                $lastSeenId = $currentId;
            }
        } else {
            // heartbeat every ~30 seconds
            if ($counter % 6 === 0) {
                echo "event: ping\n";
                echo "data: {}\n\n";
                @ob_flush();
                @flush();
            }
        }
    } catch (PDOException $e) {
        sendSSEData(['status' => 'error', 'message' => 'Database error']);
    }

    $counter++;
    sleep(5);
}
