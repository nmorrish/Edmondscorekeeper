<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

require_once("connect.php");

try {
    $db = connect();
} catch (PDOException $e) {
    error_log('Database connection failed: ' . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection error']);
    exit;
}

function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    ob_flush();
    flush();
}

sendSSEData(null);
$lastUpdateTime = null;

while (true) {
    try {
        $stmt = $db->prepare("SELECT MAX(lastJudgement) AS lastUpdateTime FROM Matches");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentUpdateTime = $result['lastUpdateTime'] ?? null;

        // Check if there's an update since the last check
        if ($lastUpdateTime !== $currentUpdateTime && $currentUpdateTime !== null) {
            // Fetch the matchId associated with the latest update
            $stmt = $db->prepare("
                SELECT m.matchId
                FROM Matches m
                WHERE m.lastJudgement = :timestamp
                LIMIT 1
            ");
            $stmt->bindParam(':timestamp', $currentUpdateTime, PDO::PARAM_STR);
            $stmt->execute();
            $matchId = $stmt->fetchColumn();

            if ($matchId) {
                sendSSEData(['status' => 'Match updated', 'matchId' => $matchId]);
                $lastUpdateTime = $currentUpdateTime;
            } else {
                sendSSEData(['status' => 'error', 'message' => 'No match found for the given timestamp']);
            }
        }
    } catch (PDOException $e) {
        error_log('Database error: ' . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }

    sleep(5);
}
