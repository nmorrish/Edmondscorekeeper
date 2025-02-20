<?php
header('Content-Type: application/json');
header('Cache-Control: no-cache');

// Include the database connection script
require_once("connect.php");

try {
    $db = connect();
} catch (PDOException $e) {
    // Log and send error if the connection fails
    error_log("Database connection failed: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

try {
    // Query the database to get the current lastJudgement timestamp and matchId
    $stmt = $db->prepare("SELECT matchId, lastJudgement FROM Matches ORDER BY lastJudgement DESC LIMIT 1");
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($result) {
        $matchId = $result['matchId'];

        // Fetch detailed data for the updated match
        $sql = "
            SELECT 
                m.matchId, 
                m.matchRing, 
                m.fighter1Id,
                m.fighter2Id,
                m.fighter1Color,
                m.fighter2Color,
                f1.fighterName AS fighter1Name,
                f2.fighterName AS fighter2Name
            FROM Matches m
            LEFT JOIN Fighters f1 ON m.fighter1Id = f1.fighterId
            LEFT JOIN Fighters f2 ON m.fighter2Id = f2.fighterId
            WHERE m.matchId = :matchId
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
            ];

            // Return the match data as JSON
            echo json_encode($matchData);
        } else {
            echo json_encode(['status' => 'no_update', 'message' => 'No updates found.']);
        }
    } else {
        echo json_encode(['status' => 'no_update', 'message' => 'No updates found.']);
    }
} catch (PDOException $e) {
    // Log and send error if the query fails
    error_log("Query failed: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Query failed.']);
} finally {
    // Ensure the database connection is closed
    $db = null;
}
