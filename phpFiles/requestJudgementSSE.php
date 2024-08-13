<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Include the database connection script
require_once("connect.php");
$db = connect();

// Get the Last-Event-ID sent by the client (if any)
$lastEventId = isset($_SERVER['HTTP_LAST_EVENT_ID']) ? intval($_SERVER['HTTP_LAST_EVENT_ID']) : 0;

// Query the database to get the current lastJudgement timestamp and matchId
$stmt = $db->prepare("SELECT matchId, lastJudgement FROM Matches ORDER BY lastJudgement DESC LIMIT 1");
$stmt->execute();
$result = $stmt->fetch(PDO::FETCH_ASSOC);
$currentLastJudgement = $result['lastJudgement'];
$matchId = $result['matchId'];

// Initialize the last known lastJudgement timestamp
$lastJudgement = $currentLastJudgement; // Initialize with the current value from the database

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
if ($lastEventId === 0) {
    sendSSEData(null);
}

// Main loop to check for updates
while (true) {
    try {
        // Query the database to get the current lastJudgement timestamp and matchId
        $stmt = $db->prepare("SELECT matchId, lastJudgement FROM Matches ORDER BY lastJudgement DESC LIMIT 1");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $currentLastJudgement = $result['lastJudgement'];
        $matchId = $result['matchId'];

        // Check if the current lastJudgement timestamp is different from the last known timestamp
        if ($currentLastJudgement != $lastJudgement) {
            // If changed, perform the detailed query for that specific match
            $sql = "
                SELECT 
                    m.matchId, 
                    m.matchRing, 
                    b.boutId,
                    b.fighterColor,
                    b.fighterId,
                    f.fighterName
                FROM Matches m
                LEFT JOIN Bouts b ON m.matchId = b.matchId
                LEFT JOIN Fighters f ON b.fighterId = f.fighterId
                WHERE m.matchId = :matchId
                ORDER BY b.boutId
            ";

            $stmt = $db->prepare($sql);
            $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
            $stmt->execute();

            // Initialize an array to hold the match data
            $matchData = [
                'matchId' => $matchId,
                'matchRing' => '',
                'Bouts' => []
            ];

            // Fetch the result set
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $boutId = $row['boutId'];

                // Set the matchRing only once (assuming all rows have the same matchRing)
                if (empty($matchData['matchRing'])) {
                    $matchData['matchRing'] = $row['matchRing'];
                }

                // Initialize the bout if not already present
                if (!isset($matchData['Bouts'][$boutId])) {
                    $matchData['Bouts'][$boutId] = [
                        'boutId' => $boutId,
                        'fighterColor' => $row['fighterColor'],
                        'fighterId' => $row['fighterId'],
                        'fighterName' => $row['fighterName'],
                    ];
                }
            }

            // Send the JSON data for the specific match
            sendSSEData($matchData);

            // Update the last known lastJudgement timestamp to the current value
            $lastJudgement = $currentLastJudgement;
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
