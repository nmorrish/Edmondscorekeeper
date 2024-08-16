<?php
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Include the database connection script
require_once("connect.php");

try {
    $db = connect();
} catch (PDOException $e) {
    // Log and send error if the connection fails
    error_log("Database connection failed: " . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

// Function to send SSE data
function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    ob_flush();
    flush();
}

// Initialize the last known lastJudgement timestamp
$lastJudgement = null;

try {
    // Query the database to get the current lastJudgement timestamp and matchId
    $stmt = $db->prepare("SELECT matchId, lastJudgement FROM Matches ORDER BY lastJudgement DESC LIMIT 1");
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($result) {
        $lastJudgement = $result['lastJudgement'];
        $matchId = $result['matchId'];
    }
} catch (PDOException $e) {
    // Log and send error if the initial query fails
    error_log("Initial query failed: " . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Initial query failed.']);
    exit;
}

// Send `null` on initial connection if needed
if (isset($_SERVER['HTTP_LAST_EVENT_ID']) && intval($_SERVER['HTTP_LAST_EVENT_ID']) === 0) {
    sendSSEData(null);
}

// Main loop to check for updates
while (true) {
    try {
        // Reuse the prepared statement to check for updates
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $currentLastJudgement = $result['lastJudgement'];
            $matchId = $result['matchId'];

            // Check if the current lastJudgement timestamp is different from the last known timestamp
            if ($currentLastJudgement !== $lastJudgement) {
                // Fetch detailed data for the updated match
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

                $stmtDetails = $db->prepare($sql);
                $stmtDetails->bindParam(':matchId', $matchId, PDO::PARAM_INT);
                $stmtDetails->execute();

                $matchData = [
                    'matchId' => $matchId,
                    'matchRing' => '',
                    'Bouts' => []
                ];

                while ($row = $stmtDetails->fetch(PDO::FETCH_ASSOC)) {
                    $boutId = $row['boutId'];

                    if (empty($matchData['matchRing'])) {
                        $matchData['matchRing'] = $row['matchRing'];
                    }

                    $matchData['Bouts'][$boutId] = [
                        'boutId' => $boutId,
                        'fighterColor' => $row['fighterColor'],
                        'fighterId' => $row['fighterId'],
                        'fighterName' => $row['fighterName'],
                    ];
                }

                // Send the JSON data for the updated match
                sendSSEData($matchData);

                // Update the last known lastJudgement timestamp
                $lastJudgement = $currentLastJudgement;
            }
        }
    } catch (PDOException $e) {
        // Log and send error if a query fails in the loop
        error_log("Query failed during loop: " . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Query failed during loop.']);
    }

    // Sleep for a few seconds before checking again
    sleep(5);
}
