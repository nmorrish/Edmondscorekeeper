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

        // Return the match data as JSON
        echo json_encode($matchData);
    } else {
        echo json_encode(['status' => 'no_update', 'message' => 'No updates found.']);
    }
} catch (PDOException $e) {
    // Log and send error if the query fails
    error_log("Query failed: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Query failed.']);
}
