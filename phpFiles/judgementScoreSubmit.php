<?php
/**
 * judgementSubmit.php 
 * 
 * Records scoring data submitted by judges for a specific bout.
 * Each fighter's score is stored independently, and the script ensures that
 * a judge cannot submit more than two scores per bout (one for each fighter).
 * The score data received include data for both fighters in one JSON.
 * 
 * Expects a POST request with JSON structured as follows:
 * {
 *   "boutId": 15,
 *   "scores": {
 *     "13": {
 *       "contact": true|false,
 *       "target": true|false,
 *       "control": true|false,
 *       "afterBlow": true|false,
 *       "doubleHit": true|false,
 *       "opponentSelfCall": true|false,
 *       "judgeName": "Dredd"
 *     },
 *     "12": {
 *       "contact": true|false,
 *       "target": true|false,
 *       "control": true|false,
 *       "afterBlow": true|false,
 *       "doubleHit": true|false,
 *       "opponentSelfCall": true|false,
 *       "judgeName": "Dredd"
 *     }
 *   }
 * }
 * 
 * Outputs data in the following JSON format
 * {
 *   "status": "success",
 *   "message": "Scores recorded successfully",
 *   "boutId": 15,
 *   "scores": {
 *     "13": {
 *       "contact": true|false,
 *       "target": true|false,
 *       "control": true|false,
 *       "afterBlow": true|false,
 *       "doubleHit": true|false,
 *       "opponentSelfCall": true|false,
 *       "judgeName": "Dredd"
 *     },
 *     "12": {
 *       "contact": true|false,
 *       "target": true|false,
 *       "control": true|false,
 *       "afterBlow": true|false,
 *       "doubleHit": true|false,
 *       "opponentSelfCall": true|false,
 *       "judgeName": "Dredd"
 *     }
 *   }
 * }
 * 
 * Or, on failure:
 * {
 *   "status": "error",
 *   "message": "error message"
 * }
 */
require_once("connect.php");

// Set the content type to application/json
header('Content-Type: application/json');

// Get the raw POST data
$jsonData = file_get_contents('php://input');

// Decode the JSON data into a PHP array
$data = json_decode($jsonData, true);

$response = [];

try {
    $db = connect();

    // Begin transaction
    $db->beginTransaction();

    // Loop through each fighter's scores and insert the score data into the Bout_Score table
    foreach ($data['scores'] as $fighterId => $scoreData) {
        // Check how many scores the judge has already submitted for this bout
        $checkStmt = $db->prepare("
            SELECT COUNT(*) FROM Bout_Score 
            WHERE boutId = :boutId AND judgeName = :judgeName
        ");
        $checkStmt->bindParam(':boutId', $data['boutId'], PDO::PARAM_INT);
        $checkStmt->bindParam(':judgeName', $scoreData['judgeName'], PDO::PARAM_STR);
        $checkStmt->execute();
        $alreadySubmitted = $checkStmt->fetchColumn();

        if ($alreadySubmitted >= 2) {
            // If the judge has already submitted two scores for this bout, return an error
            $response[] = [
                'status' => 'error',
                'message' => "Judge {$scoreData['judgeName']} has already submitted two scores for bout {$data['boutId']}.",
            ];
            continue; // Skip this score and move to the next one
        }

        // Prepare the SQL statement to insert the score
        $stmt = $db->prepare("
            INSERT INTO Bout_Score (contact, target, control, afterBlow, doubleHit, opponentSelfCall, boutId, judgeName, fighterId) 
            VALUES (:contact, :target, :control, :afterBlow, :doubleHit, :opponentSelfCall, :boutId, :judgeName, :fighterId)
        ");

        // Bind the parameters
        $stmt->bindParam(':contact', $scoreData['contact'], PDO::PARAM_BOOL);
        $stmt->bindParam(':target', $scoreData['target'], PDO::PARAM_BOOL);
        $stmt->bindParam(':control', $scoreData['control'], PDO::PARAM_BOOL);
        $stmt->bindParam(':afterBlow', $scoreData['afterBlow'], PDO::PARAM_BOOL);
        $stmt->bindParam(':doubleHit', $scoreData['doubleHit'], PDO::PARAM_BOOL);
        $stmt->bindParam(':opponentSelfCall', $scoreData['opponentSelfCall'], PDO::PARAM_BOOL);
        $stmt->bindParam(':judgeName', $scoreData['judgeName'], PDO::PARAM_STR);
        $stmt->bindParam(':boutId', $data['boutId'], PDO::PARAM_INT);
        $stmt->bindParam(':fighterId', $fighterId, PDO::PARAM_INT);

        // Execute the statement
        $stmt->execute();
    }

    // Update the lastJudgement timestamp in the Bouts table
    $updateStmt = $db->prepare("
        UPDATE Bouts 
        SET lastJudgement = CURRENT_TIMESTAMP 
        WHERE boutId = :boutId
    ");
    $updateStmt->bindParam(':boutId', $data['boutId'], PDO::PARAM_INT);
    $updateStmt->execute();

    // Commit the transaction
    $db->commit();

    // If no errors occurred, prepare the success response
    if (empty($response)) {
        $response = [
            'status' => 'success',
            'message' => 'Scores recorded successfully',
            'data' => $data // Include the received data in the response
        ];
    }
} catch (PDOException $e) {
    // Rollback the transaction if something failed
    $db->rollBack();

    // Prepare the error response
    $response = [
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ];
} finally {
    // Close the database connection
    $db = null;
}

// Encode the response as JSON and output it
echo json_encode($response);
