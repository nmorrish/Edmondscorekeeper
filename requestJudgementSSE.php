<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Include the database connection script
require_once("connect.php");
$db = connect();

// Get the Last-Event-ID sent by the client (if any)
$lastEventId = isset($_SERVER['HTTP_LAST_EVENT_ID']) ? intval($_SERVER['HTTP_LAST_EVENT_ID']) : 0;

// Initialize the last known pendingJudges count
$lastPendingJudges = $lastEventId;

// Function to send SSE data
function sendSSEData($data) {
    // Ensuring the data is fully encoded before sending
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    ob_flush();
    flush();
}

while (true) {
    try {
        // Query the database to get the current pendingJudges count
        $stmt = $db->prepare("SELECT MAX(pendingJudges) AS maxPendingJudges FROM Matches");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentPendingJudges = $result['maxPendingJudges'];

        // Check if the current pendingJudges count is greater than the last known count
        if ($currentPendingJudges > $lastPendingJudges) {
            // If increased, perform the detailed query
            $sql = "
                SELECT 
                    m.matchId, 
                    m.matchRing, 
                    b.boutId,
                    b.fighterColor,
                    b.fighterId,
                    s.scoreId,
                    s.target,
                    s.contact,
                    s.control,
                    f.fighterName
                FROM Matches m
                LEFT JOIN Bouts b ON m.matchId = b.matchId
                LEFT JOIN Bout_Score s ON b.boutId = s.boutId
                LEFT JOIN Fighters f ON b.fighterId = f.fighterId
                ORDER BY m.matchId, b.boutId, s.scoreId
            ";

            $stmt = $db->prepare($sql);
            $stmt->execute();

            // Initialize an empty array to hold the data
            $matches = [];

            // Fetch the result set
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $matchId = $row['matchId'];
                $boutId = $row['boutId'];

                // Initialize the match if not already present
                if (!isset($matches[$matchId])) {
                    $matches[$matchId] = [
                        'matchId' => $matchId,
                        'matchRing' => $row['matchRing'],
                        'Bouts' => []
                    ];
                }

                // Initialize the bout if not already present
                if (!isset($matches[$matchId]['Bouts'][$boutId])) {
                    $matches[$matchId]['Bouts'][$boutId] = [
                        'boutId' => $boutId,
                        'fighterColor' => $row['fighterColor'],
                        'fighterId' => $row['fighterId'],
                        'fighterName' => $row['fighterName'],
                        'Scores' => []
                    ];
                }

                // Add the score to the current bout
                if (!is_null($row['scoreId'])) {
                    $matches[$matchId]['Bouts'][$boutId]['Scores'][] = [
                        'scoreId' => $row['scoreId'],
                        'target' => $row['target'],
                        'contact' => $row['contact'],
                        'control' => $row['control']
                    ];
                }
            }

            // Send the JSON data
            sendSSEData($matches);

            // Update the last known pendingJudges count
            $lastPendingJudges = $currentPendingJudges;
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
