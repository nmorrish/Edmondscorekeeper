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
                // Fetch detailed data for the updated match including the highest boutId
                $sql = "
                    SELECT 
                        m.matchId, 
                        m.matchRing, 
                        m.fighter1Id,
                        m.fighter2Id,
                        m.fighter1Color,
                        m.fighter2Color,
                        f1.fighterName AS fighter1Name,
                        f2.fighterName AS fighter2Name,
                        b.boutId
                    FROM Matches m
                    LEFT JOIN Fighters f1 ON m.fighter1Id = f1.fighterId
                    LEFT JOIN Fighters f2 ON m.fighter2Id = f2.fighterId
                    LEFT JOIN Bouts b ON m.matchId = b.matchId
                    WHERE m.matchId = :matchId
                    AND b.boutId = (SELECT MAX(boutId) FROM Bouts WHERE matchId = :matchId)
                ";

                $stmtDetails = $db->prepare($sql);
                $stmtDetails->bindParam(':matchId', $matchId, PDO::PARAM_INT);
                $stmtDetails->execute();

                if ($row = $stmtDetails->fetch(PDO::FETCH_ASSOC)) {
                    $matchData = [
                        'matchId' => $row['matchId'],
                        'matchRing' => $row['matchRing'],
                        'fighter1Id' => $row['fighter1Id'],
                        'fighter1Name' => $row['fighter1Name'],
                        'fighter1Color' => $row['fighter1Color'],
                        'fighter2Id' => $row['fighter2Id'],
                        'fighter2Name' => $row['fighter2Name'],
                        'fighter2Color' => $row['fighter2Color'],
                        'boutId' => $row['boutId'] ?? null // Ensure boutId is correctly assigned even if null
                    ];

                    // Send the JSON data for the updated match
                    sendSSEData($matchData);

                    // Update the last known lastJudgement timestamp
                    $lastJudgement = $currentLastJudgement;
                }
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
