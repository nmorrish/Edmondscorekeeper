<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Include the database connection script
require_once("connect.php");
$db = connect();

// Initialize the last known pendingJudges count
$lastPendingJudges = 0;

while (true) {
    try {
        // Query the database to get the current pendingJudges count
        $stmt = $db->prepare("SELECT MAX(pendingJudges) AS maxPendingJudges FROM Matches");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentPendingJudges = $result['maxPendingJudges'];

        // Check if the current pendingJudges count is greater than the last known count
        if ($currentPendingJudges > $lastPendingJudges) {
            // If increased, send the JSON data
            $jsonData = json_encode([
                'status' => 'update',
                'pendingJudges' => $currentPendingJudges,
            ]);
            echo "data: {$jsonData}\n\n";
            ob_flush();
            flush();

            // Update the last known pendingJudges count
            $lastPendingJudges = $currentPendingJudges;
        }
    } catch (PDOException $e) {
        // Send an error message if there is a database error
        $jsonData = json_encode([
            'status' => 'error',
            'message' => 'Database error: ' . $e->getMessage(),
        ]);
        echo "data: {$jsonData}\n\n";
        ob_flush();
        flush();
    }

    // Sleep for a few seconds before checking again
    sleep(5);
}
