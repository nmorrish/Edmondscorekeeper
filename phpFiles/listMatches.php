<?php

require_once("connect.php");

try {

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
        $matchId = (int)$row['matchId']; // Explicitly cast to integer
        $boutId = (int)$row['boutId'];   // Explicitly cast to integer

        // Initialize the match if not already present
        if (!isset($matches[$matchId])) {
            $matches[$matchId] = [
                'matchId' => $matchId, // Explicitly integer
                'matchRing' => (int)$row['matchRing'], // Explicitly integer
                'Bouts' => []
            ];
        }

        // Initialize the bout if not already present
        if (!isset($matches[$matchId]['Bouts'][$boutId])) {
            $matches[$matchId]['Bouts'][$boutId] = [
                'boutId' => $boutId, // Explicitly integer
                'fighterColor' => $row['fighterColor'],
                'fighterId' => (int)$row['fighterId'], // Explicitly integer
                'fighterName' => $row['fighterName'],
                'Scores' => []
            ];
        }

        // Add the score to the current bout
        if (!is_null($row['scoreId'])) {
            $matches[$matchId]['Bouts'][$boutId]['Scores'][] = [
                'scoreId' => (int)$row['scoreId'], // Explicitly integer
                'target' => ord($row['target']), // Convert BIT to integer (1 or 0)
                'contact' => ord($row['contact']), // Convert BIT to integer (1 or 0)
                'control' => ord($row['control']) // Convert BIT to integer (1 or 0)
            ];
        }
    }

    // Encode the matches array to JSON with pretty print
    $matches_json = json_encode(array_values($matches), JSON_PRETTY_PRINT);

    // Output the JSON
    echo $matches_json;

} catch (PDOException $e) {
    // Handle any errors
    $response = [
        'status' => 'error',
        'message' => $e->getMessage()
    ];
    echo json_encode($response);
}

// Close the database connection
$db = null;
