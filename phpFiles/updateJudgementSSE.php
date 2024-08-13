<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Include the database connection script
require_once("connect.php");
$db = connect();

// Function to send SSE data
function sendSSEData($data) {
    // Ensuring the data is fully encoded before sending
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    ob_flush();
    flush();
}

// Send `null` on initial connection
sendSSEData(null);

// Track the last known update time
$lastUpdateTime = null;

// Main loop to check for updates
while (true) {
    try {
        // Query the database to check for the most recent update in the Bout_Score table
        $stmt = $db->prepare("SELECT MAX(timestamp) AS lastUpdateTime FROM Bout_Score");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentUpdateTime = $result['lastUpdateTime'];

        // Check if there has been an update since the last known update time
        if ($lastUpdateTime !== $currentUpdateTime) {
            // If updated, fetch the matchId related to the most recent Bout_Score entry
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

            // Send the JSON data with the matchId and a status message
            sendSSEData([
                'status' => 'Bout_Score updated',
                'matchId' => $matchId
            ]);

            // Update the last known update time
            $lastUpdateTime = $currentUpdateTime;
        }
    } catch (PDOException $e) {
        // Send an error message if there is a database error
        $jsonData = [
            'status' => 'error',
            'message' => 'Database error: ' . $e->getMessage(),
        ];
        sendSSEData($jsonData);
    }

    // Sleep for a few seconds before checking again
    sleep(5);
}
