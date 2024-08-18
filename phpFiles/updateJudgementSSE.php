<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

require_once("connect.php");

function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    ob_end_flush(); // Ensure the output is not buffered
    flush(); // Send the output to the browser
}

try {
    $db = connect();
    error_log("SSE Script: Connected to the database.");
} catch (PDOException $e) {
    error_log('Database connection failed: ' . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection error']);
    exit;
}

sendSSEData(null); // Initial connection message
$lastUpdateTime = null;

while (true) {
    try {
        // Log the start of the update check
        error_log("SSE Script: Checking for updates...");

        // Fetch the latest lastJudgement timestamp from the Bouts table
        $stmt = $db->prepare("SELECT MAX(lastJudgement) AS lastUpdateTime FROM Bouts");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentUpdateTime = $result['lastUpdateTime'] ?? null;

        // Log the fetched timestamp
        error_log("SSE Script: Current Update Time - " . $currentUpdateTime);

        // Check if there's an update since the last check
        if ($lastUpdateTime !== $currentUpdateTime && $currentUpdateTime !== null) {
            // Fetch the matchId associated with the latest bout update
            $stmt = $db->prepare("
                SELECT b.matchId
                FROM Bouts b
                WHERE b.lastJudgement = :timestamp
                LIMIT 1
            ");
            $stmt->bindParam(':timestamp', $currentUpdateTime, PDO::PARAM_STR);
            $stmt->execute();
            $matchId = $stmt->fetchColumn();

            if ($matchId) {
                error_log("SSE Script: Match found with ID - " . $matchId);
                sendSSEData(['status' => 'Match updated', 'matchId' => $matchId]);
                $lastUpdateTime = $currentUpdateTime; // Update the last known timestamp
            } else {
                error_log("SSE Script: No match found for the given timestamp");
                sendSSEData(['status' => 'error', 'message' => 'No match found for the given timestamp']);
            }
        }
    } catch (PDOException $e) {
        error_log('Database error: ' . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }

    sleep(5); // Wait for 5 seconds before checking again
}
