<?php
/**
 * requestJudgementSSE.php
 * 
 * Opens an SSE stream that monitors the `Matches` table and looks
 * for changes to the `lastJudgement` timestamp for the most recent match in a ring. 
 * Returns the latest match and bout details when an update is detected.
 * 
 * Expects a GET request with a query parameter:
 *   https://yoururl/requestJudgementSSE.php?ringNumber=1
 * 
 * On initial connection:
 *   Sends a null event to signal connection established
 * 
 * On update:
 * {
 *   "matchId": 42,
 *   "matchRing": 1,
 *   "fighter1Id": 11,
 *   "fighter1Name": "Fighter1",
 *   "fighter1Color": "Red",
 *   "fighter2Id": 12,
 *   "fighter2Name": "Bob",
 *   "fighter2Color": "Blue",
 *   "boutId": 83,
 *   "lastJudgement": "2025-04-13 12:34:56"
 * }
 * 
 * On error:
 * {
 *   "status": "error",
 *   "message": "error message"
 * }
 */
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Include the database connection script
require_once("connect.php");

// Get the ring number from the URL parameters (from the React component)
$ringNumber = isset($_GET['ringNumber']) ? intval($_GET['ringNumber']) : null;

if ($ringNumber === null) {
    sendSSEData(['status' => 'error', 'message' => 'Ring number not provided.']);
    exit;
}

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

// Prepare the main query, filtering by the ring number passed in
try {
    $stmt = $db->prepare("SELECT matchId, lastJudgement FROM Matches WHERE matchRing = :ringNumber ORDER BY lastJudgement DESC LIMIT 1");
    $stmt->bindParam(':ringNumber', $ringNumber, PDO::PARAM_INT); // Bind the ring number
} catch (PDOException $e) {
    error_log("Query preparation failed: " . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Query preparation failed.']);
    exit;
}

// Main loop to check for updates
while (true) {
    try {
        $stmt->execute(); // Execute the prepared statement
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $currentLastJudgement = $result['lastJudgement'];
            $matchId = $result['matchId'];

            // Only send data if the current lastJudgement timestamp is different from the last known timestamp
            if ($lastJudgement !== null && $currentLastJudgement !== $lastJudgement) {
                // Fetch match details only when the timestamp changes
                $stmtDetails = $db->prepare("
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
                ");

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
                        'boutId' => $row['boutId'] ?? null, // Ensure boutId is correctly assigned even if null
                        'lastJudgement' => $currentLastJudgement // Include lastJudgement in the response
                    ];

                    // Send the JSON data for the updated match
                    sendSSEData($matchData);

                    // Update the last known lastJudgement timestamp
                    $lastJudgement = $currentLastJudgement;
                }
            }

            // If this is the first connection, send `null` to indicate waiting
            if ($lastJudgement === null) {
                sendSSEData(null);
                $lastJudgement = $currentLastJudgement; // Set the initial timestamp without sending data yet
            }
        }
    } catch (PDOException $e) {
        error_log("Query failed during loop: " . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Query failed during loop.']);
    }

    // Sleep for 5 seconds before checking again
    sleep(5);
}
