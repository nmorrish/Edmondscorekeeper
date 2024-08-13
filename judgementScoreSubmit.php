<?php
//judgementSubmit.php
require_once("connect.php");
$db = connect();

// Set the content type to application/json
header('Content-Type: application/json');

// Get the raw POST data
$jsonData = file_get_contents('php://input');

// Decode the JSON data into a PHP array
$data = json_decode($jsonData, true);

$response = [];

try {
    // Begin transaction
    $db->beginTransaction();

    // Loop through each bout and insert the score data into the Bout_Score table
    foreach ($data['Bouts'] as $bout) {
        $stmt = $db->prepare("
            INSERT INTO Bout_Score (contact, target, control, afterBlow, doubleHit, opponentSelfCall, boutId) 
            VALUES (:contact, :target, :control, :afterBlow, :doubleHit, :opponentSelfCall, :boutId)
        ");
        $stmt->bindParam(':contact', $bout['scores']['contact'], PDO::PARAM_BOOL);
        $stmt->bindParam(':target', $bout['scores']['quality'], PDO::PARAM_BOOL); // Assuming quality is mapped to target
        $stmt->bindParam(':control', $bout['scores']['control'], PDO::PARAM_BOOL);
        $stmt->bindParam(':afterBlow', $bout['scores']['afterBlow'], PDO::PARAM_BOOL);
        $stmt->bindParam(':doubleHit', $bout['scores']['doubleHit'], PDO::PARAM_BOOL);
        $stmt->bindParam(':opponentSelfCall', $bout['scores']['opponentSelfCall'], PDO::PARAM_BOOL);
        $stmt->bindParam(':boutId', $bout['boutId'], PDO::PARAM_INT);
        $stmt->execute();
    }

    // Commit the transaction
    $db->commit();

    // Prepare the response
    $response = [
        'status' => 'success',
        'message' => 'Scores recorded successfully',
        'data' => $data // Include the received data in the response
    ];
} catch (PDOException $e) {
    // Rollback the transaction if something failed
    $db->rollBack();

    // Prepare the error response
    $response = [
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ];
}

// Close the database connection
$db = null;

// Encode the response as JSON and output it
echo json_encode($response);
