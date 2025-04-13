<?php
/**
 * listMatches.php
 * 
 * Retrieves match and scoring data for a given ring and event, including fighter details,
 * bout history, and scores submitted by judges.
 * 
 * Accessed via GET request with the following query string parameters:
 *   ?matchRing=1&eventId=5
 * 
 * On success returns a JSON array of matches with the following structure:
 * [
 *   {
 *     "matchId": 10,
 *     "matchRing": 1,
 *     "eventId": 5,
 *     "fighter1Id": 11,
 *     "fighter1Name": "Fighter1",
 *     "fighter1Color": "Red",
 *     "fighter1Adjustment": 0.0,
 *     "fighter2Id": 12,
 *     "fighter2Name": "Fighter2",
 *     "fighter2Color": "Blue",
 *     "fighter2Adjustment": 0.0,
 *     "lastJudgement": "2024-01-01 12:34:56",
 *     "Active": true,
 *     "matchComplete": false,
 *     "Bouts": [
 *       {
 *         "boutId": 2,
 *         "fighter1": {
 *           "fighterColor": "Red",
 *           "fighterId": 11,
 *           "fighterName": "Fighter1",
 *           "Scores": [
 *             {
 *               "judgeName": "Dredd",
 *               "contact": true,
 *               "target": true,
 *               "control": false,
 *               "afterBlow": false,
 *               "doubleHit": false,
 *               "opponentSelfCall": false
 *             }
 *           ]
 *         },
 *         "fighter2": {
 *           "fighterColor": "Blue",
 *           "fighterId": 12,
 *           "fighterName": "Fighter2",
 *           "Scores": [
 *             {
 *               "judgeName": "Dredd",
 *               "contact": false,
 *               "target": true,
 *               "control": true,
 *               "afterBlow": false,
 *               "doubleHit": true,
 *               "opponentSelfCall": false
 *             }
 *           ]
 *         }
 *       }
 *     ]
 *   }
 * ]
 * 
 * Notes:
 * - If no bouts exist for a match, a placeholder bout is included with `boutId: null` and empty score arrays.
 * - If no matches are found for the given ring/event, an empty array is returned.
 * 
 * On error returns:
 * {
 *   "status": "error",
 *   "message": "Descriptive error message"
 * }
 */


require_once("connect.php");

try {
    $db = connect();

    // Set the content type to application/json
    header('Content-Type: application/json');

    // Get the matchRing and eventId parameters from the request
    if (!isset($_GET['matchRing']) || !is_numeric($_GET['matchRing'])) {
        throw new Exception('matchRing parameter is required and must be an integer.');
    }
    if (!isset($_GET['eventId']) || !is_numeric($_GET['eventId'])) {
        throw new Exception('eventId parameter is required and must be an integer.');
    }
    $matchRing = (int)$_GET['matchRing'];
    $eventId = (int)$_GET['eventId']; // Added eventId filtering

    // Prepare and execute the SQL query to fetch match and bout data for the specific ring and event
    $sql = "
        SELECT 
            m.matchId, 
            m.matchRing, 
            m.eventId, 
            m.fighter1Id, 
            m.fighter2Id, 
            m.fighter1Color,
            m.fighter2Color,
            m.fighter1Adjustment,
            m.fighter2Adjustment,
            m.Active,
            m.matchComplete,
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
        WHERE m.matchRing = :matchRing
        AND m.eventId = :eventId
        ORDER BY m.matchId, b.boutId, bs.scoreId
    ";

    $stmt = $db->prepare($sql);
    $stmt->bindParam(':matchRing', $matchRing, PDO::PARAM_INT);
    $stmt->bindParam(':eventId', $eventId, PDO::PARAM_INT); // Bind eventId
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
                'eventId' => (int)$row['eventId'], // Ensure eventId is included
                'fighter1Id' => (int)$row['fighter1Id'],
                'fighter1Name' => $row['fighter1Name'],
                'fighter1Color' => $row['fighter1Color'],
                'fighter1Adjustment' => (float)$row['fighter1Adjustment'],
                'fighter2Id' => (int)$row['fighter2Id'],
                'fighter2Name' => $row['fighter2Name'],
                'fighter2Color' => $row['fighter2Color'],
                'fighter2Adjustment' => (float)$row['fighter2Adjustment'],
                'lastJudgement' => $row['lastJudgement'],
                'Bouts' => [],

                // Uncomment the following for web host:
                // ord($row['Active']),
                // ord($row['matchComplete']),

                // Uncomment the following for localhost:
                'Active' => (bool)$row['Active'], 
                'matchComplete' => (bool)$row['matchComplete'], 
            ];
        }

        // Add bout data if boutId exists
        if ($boutId !== null) {
            if (!isset($matches[$matchId]['Bouts'][$boutId])) {
                $matches[$matchId]['Bouts'][$boutId] = [
                    'boutId' => $boutId,
                    'fighter1' => [
                        'fighterColor' => $row['fighter1Color'],
                        'fighterId' => (int)$row['fighter1Id'],
                        'fighterName' => $row['fighter1Name'],
                        'Scores' => []
                    ],
                    'fighter2' => [
                        'fighterColor' => $row['fighter2Color'],
                        'fighterId' => (int)$row['fighter2Id'],
                        'fighterName' => $row['fighter2Name'],
                        'Scores' => []
                    ]
                ];
            }

            // Add score data to the appropriate fighter in the bout
            if ((int)$row['scoreFighterId'] === (int)$row['fighter1Id']) {
                $matches[$matchId]['Bouts'][$boutId]['fighter1']['Scores'][] = [
                    'judgeName' => $row['judgeName'],

                    //Uncomment the following for web host:
                    // 'contact' => ord($row['contact']),
                    // 'target' => ord($row['target']),
                    // 'control' => ord($row['control']),
                    // 'afterBlow' => ord($row['afterBlow']),
                    // 'doubleHit' => ord($row['doubleHit']),
                    // 'opponentSelfCall' => ord($row['opponentSelfCall']),

                    // Uncomment the following for localhost:
                    'contact' => $row['contact'],
                    'target' => $row['target'],
                    'control' => $row['control'],
                    'afterBlow' => $row['afterBlow'],
                    'doubleHit' => $row['doubleHit'],
                    'opponentSelfCall' => $row['opponentSelfCall']
                ];
            } elseif ((int)$row['scoreFighterId'] === (int)$row['fighter2Id']) {
                $matches[$matchId]['Bouts'][$boutId]['fighter2']['Scores'][] = [
                    'judgeName' => $row['judgeName'],

                    //Uncomment the following for web host:
                    // 'contact' => ord($row['contact']),
                    // 'target' => ord($row['target']),
                    // 'control' => ord($row['control']),
                    // 'afterBlow' => ord($row['afterBlow']),
                    // 'doubleHit' => ord($row['doubleHit']),
                    // 'opponentSelfCall' => ord($row['opponentSelfCall']),

                    // Uncomment the following for localhost:
                    'contact' => $row['contact'],
                    'target' => $row['target'],
                    'control' => $row['control'],
                    'afterBlow' => $row['afterBlow'],
                    'doubleHit' => $row['doubleHit'],
                    'opponentSelfCall' => $row['opponentSelfCall']
                ];
            }
        }
    }

    foreach ($matches as $matchId => &$match) {
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
            $match['Bouts'] = array_values($match['Bouts']);
        }
    }

    echo json_encode(array_values($matches), JSON_PRETTY_PRINT);

} catch (Exception $e) {
    $response = [
        'status' => 'error',
        'message' => $e->getMessage()
    ];
    echo json_encode($response);

} finally {
    // Ensure the database connection is closed
    $db = null;
}
