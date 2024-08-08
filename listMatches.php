<?php

require_once("connect.php");

// try {

    $db = connect();

    // Set the content type to application/json
    header('Content-Type: application/json');

    // Prepare and execute the SQL query
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

    $matches_json = json_encode(array_values($matches), JSON_PRETTY_PRINT);

    echo $matches_json;

// } catch (PDOException $e) {
//     // Handle any errors
//     $response = [
//         'status' => 'error',
//         'message' => $e->getMessage()
//     ];
//     echo json_encode($response);
// }

// // Close the database connection
// $db = null;