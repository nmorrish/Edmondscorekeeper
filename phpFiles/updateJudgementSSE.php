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
        $stmt = $db->prepare("SELECT MAX(timestamp) AS lastUpdateTime FROM Bout_Score");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentUpdateTime = $result['lastUpdateTime'] ?? null;

        if ($lastUpdateTime !== $currentUpdateTime && $currentUpdateTime !== null) {
            $stmt = $db->prepare("
                SELECT b.matchId 
                FROM Bout_Score bs
                JOIN Bouts b ON bs.boutId = b.boutId
                WHERE bs.timestamp = :timestamp
                LIMIT 1
            ");
            $stmt->bindParam(':timestamp', $currentUpdateTime, PDO::PARAM_STR);
            $stmt->execute();
            $matchId = $stmt->fetchColumn();

            if ($matchId) {
                sendSSEData(['status' => 'Bout_Score updated', 'matchId' => $matchId]);
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
