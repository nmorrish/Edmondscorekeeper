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
        $matchId = (int)$row['matchId'];
        $boutId = $row['boutId'] !== null ? (int)$row['boutId'] : null;

        // Initialize the match if not already in the array
        if (!isset($matches[$matchId])) {
            $matches[$matchId] = [
                'matchId' => $matchId,
                'matchRing' => (int)$row['matchRing'],
                'fighter1Id' => (int)$row['fighter1Id'],
                'fighter1Name' => $row['fighter1Name'],
                'fighter1Color' => $row['fighter1Color'],
                'fighter2Id' => (int)$row['fighter2Id'],
                'fighter2Name' => $row['fighter2Name'],
                'fighter2Color' => $row['fighter2Color'],
                'lastJudgement' => $row['lastJudgement'],
                'Bouts' => [] // Initialize an empty array for Bouts
            ];
        }

        // Add bout data if boutId exists
        if ($boutId !== null) {
            // Check if this bout already exists
            if (!isset($matches[$matchId]['Bouts'][$boutId])) {
                // Add bout structure for both fighters, even if there are no scores
                $matches[$matchId]['Bouts'][$boutId] = [
                    'boutId' => $boutId,
                    'fighter1' => [
                        'fighterColor' => $row['fighter1Color'],
                        'fighterId' => (int)$row['fighter1Id'],
                        'fighterName' => $row['fighter1Name'],
                        'Scores' => [] // Initialize an empty Scores array for fighter1
                    ],
                    'fighter2' => [
                        'fighterColor' => $row['fighter2Color'],
                        'fighterId' => (int)$row['fighter2Id'],
                        'fighterName' => $row['fighter2Name'],
                        'Scores' => [] // Initialize an empty Scores array for fighter2
                    ]
                ];
            }

            // Add score data to the appropriate fighter in the bout
            if ((int)$row['scoreFighterId'] === (int)$row['fighter1Id']) {
                $matches[$matchId]['Bouts'][$boutId]['fighter1']['Scores'][] = [
                    'contact' => $row['contact'],
                    'target' => $row['target'],
                    'control' => $row['control'],
                    'afterBlow' => $row['afterBlow'],
                    'doubleHit' => $row['doubleHit'],
                    'opponentSelfCall' => $row['opponentSelfCall'],
                    'judgeName' => $row['judgeName']
                ];
            } elseif ((int)$row['scoreFighterId'] === (int)$row['fighter2Id']) {
                $matches[$matchId]['Bouts'][$boutId]['fighter2']['Scores'][] = [
                    'contact' => $row['contact'],
                    'target' => $row['target'],
                    'control' => $row['control'],
                    'afterBlow' => $row['afterBlow'],
                    'doubleHit' => $row['doubleHit'],
                    'opponentSelfCall' => $row['opponentSelfCall'],
                    'judgeName' => $row['judgeName']
                ];
            }
        }
    }

    // Ensure that each match contains an array of bouts, even if no bout or score data is found
    foreach ($matches as $matchId => &$match) {
        // If no boutId was found, create an empty bout structure
        if (empty($match['Bouts'])) {
            $match['Bouts'][] = [
                'boutId' => null,
                'fighter1' => [
                    'fighterColor' => $match['fighter1Color'],
                    'fighterId' => $match['fighter1Id'],
                    'fighterName' => $match['fighter1Name'],
                    'Scores' => []
                ],
                'fighter2' => [
                    'fighterColor' => $match['fighter2Color'],
                    'fighterId' => $match['fighter2Id'],
                    'fighterName' => $match['fighter2Name'],
                    'Scores' => []
                ]
            ];
        } else {
            // If there are valid bouts, convert the bout structure to an array
            $match['Bouts'] = array_values($match['Bouts']);
        }
    }

    // Encode the matches array to JSON
    echo json_encode(array_values($matches), JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    $response = [
        'status' => 'error',
        'message' => $e->getMessage()
    ];
    echo json_encode($response);
}

// Close the database connection
$db = null;
