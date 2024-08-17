<?php
// listMatches.php
require_once("connect.php");

try {
    $db = connect();

    // Set the content type to application/json
    header('Content-Type: application/json');

    // Prepare and execute the SQL query to fetch match and bout data
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
            f2.fighterName AS fighter2Name,
            b.boutId,
            bs.contact, 
            bs.target, 
            bs.control, 
            bs.afterBlow, 
            bs.doubleHit, 
            bs.opponentSelfCall,
            bs.judgeName,
            bs.fighterId AS scoreFighterId
        FROM Matches m
        LEFT JOIN Fighters f1 ON m.fighter1Id = f1.fighterId
        LEFT JOIN Fighters f2 ON m.fighter2Id = f2.fighterId
        LEFT JOIN Bouts b ON m.matchId = b.matchId
        LEFT JOIN Bout_Score bs ON b.boutId = bs.boutId
        WHERE m.matchId IS NOT NULL
        ORDER BY m.matchId, b.boutId, bs.scoreId
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute();

    // Initialize an empty array to hold the data
    $matches = [];

    // Fetch the result set
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $matchId = (int)$row['matchId']; // Explicitly cast to integer
        $boutId = $row['boutId'] !== null ? (int)$row['boutId'] : null; // Handle null boutId

        // Initialize the match array if not already initialized
        if (!isset($matches[$matchId])) {
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
                'Bouts' => [] // Initialize an empty array for bouts
            ];
        }

        // Add bout data if boutId exists, otherwise add an empty bout placeholder
        if ($boutId) {
            // Check if this bout already exists in the Bouts array
            $boutIndex = array_search($boutId, array_column($matches[$matchId]['Bouts'], 'boutId'));

            if ($boutIndex === false) {
                // If bout doesn't exist, add it
                $matches[$matchId]['Bouts'][] = [
                    'boutId' => $boutId,
                    'fighterColor' => $row['fighter1Color'],
                    'fighterId' => (int)$row['fighter1Id'],
                    'fighterName' => $row['fighter1Name'],
                    'Scores' => []
                ];
                $matches[$matchId]['Bouts'][] = [
                    'boutId' => $boutId,
                    'fighterColor' => $row['fighter2Color'],
                    'fighterId' => (int)$row['fighter2Id'],
                    'fighterName' => $row['fighter2Name'],
                    'Scores' => []
                ];
            }

            // Add score data to the appropriate fighter in the bout
            foreach ($matches[$matchId]['Bouts'] as &$bout) {
                if ($bout['fighterId'] === (int)$row['scoreFighterId']) {
                    $bout['Scores'][] = [
                        'contact' => (int)$row['contact'],
                        'target' => (int)$row['target'],
                        'control' => (int)$row['control'],
                        'afterBlow' => (int)$row['afterBlow'],
                        'doubleHit' => (int)$row['doubleHit'],
                        'opponentSelfCall' => (int)$row['opponentSelfCall'],
                        'judgeName' => $row['judgeName']
                    ];
                }
            }
        } else {
            // If no boutId exists, add empty entries for fighters
            if (empty($matches[$matchId]['Bouts'])) {
                $matches[$matchId]['Bouts'][] = [
                    'boutId' => null,
                    'fighterColor' => $row['fighter1Color'],
                    'fighterId' => (int)$row['fighter1Id'],
                    'fighterName' => $row['fighter1Name'],
                    'Scores' => []
                ];
                $matches[$matchId]['Bouts'][] = [
                    'boutId' => null,
                    'fighterColor' => $row['fighter2Color'],
                    'fighterId' => (int)$row['fighter2Id'],
                    'fighterName' => $row['fighter2Name'],
                    'Scores' => []
                ];
            }
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
