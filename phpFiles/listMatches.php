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
            m.fighter1Id, 
            m.fighter2Id, 
            m.fighter1Color,
            m.fighter2Color,
            m.lastJudgement,
            f1.fighterName AS fighter1Name,
            f2.fighterName AS fighter2Name
        FROM Matches m
        LEFT JOIN Fighters f1 ON m.fighter1Id = f1.fighterId
        LEFT JOIN Fighters f2 ON m.fighter2Id = f2.fighterId
        ORDER BY m.matchId
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute();

    // Initialize an empty array to hold the data
    $matches = [];

    // Fetch the result set
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $matchId = (int)$row['matchId']; // Explicitly cast to integer

        // Initialize the match array
        $matches[$matchId] = [
            'matchId' => $matchId, // Explicitly integer
            'matchRing' => (int)$row['matchRing'], // Explicitly integer
            'fighter1Id' => (int)$row['fighter1Id'], // Explicitly integer
            'fighter1Name' => $row['fighter1Name'],
            'fighter1Color' => $row['fighter1Color'],
            'fighter2Id' => (int)$row['fighter2Id'], // Explicitly integer
            'fighter2Name' => $row['fighter2Name'],
            'fighter2Color' => $row['fighter2Color'],
            'lastJudgement' => $row['lastJudgement'],
            'Bouts' => [
                [
                    'boutId' => null, // Placeholder for when Bouts are added
                    'fighterColor' => $row['fighter1Color'],
                    'fighterId' => (int)$row['fighter1Id'],
                    'fighterName' => $row['fighter1Name'],
                    'Scores' => [] // Placeholder for scores
                ],
                [
                    'boutId' => null, // Placeholder for when Bouts are added
                    'fighterColor' => $row['fighter2Color'],
                    'fighterId' => (int)$row['fighter2Id'],
                    'fighterName' => $row['fighter2Name'],
                    'Scores' => [] // Placeholder for scores
                ]
            ]
        ];
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
