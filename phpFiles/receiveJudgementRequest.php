<?php
header('Content-Type: application/json');

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// Check if JSON data was received
if ($data && isset($data['matchId'])) {
    require_once("connect.php");
    $db = connect();

    // Extract the matchId from the received data
    $matchId = $data['matchId'];

    try {
        // Begin a transaction to ensure both queries are executed together
        $db->beginTransaction();

        // Prepare and execute the query to update the lastJudgement timestamp for the given matchId
        $stmt = $db->prepare("UPDATE Matches SET lastJudgement = CURRENT_TIMESTAMP WHERE matchId = :matchId");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        // Prepare and execute the query to insert a new bout with the matchId
        $stmt = $db->prepare("INSERT INTO Bouts (matchId) VALUES (:matchId)");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        // Commit the transaction
        $db->commit();

        echo json_encode(['status' => 'success', 'message' => 'Last judgement timestamp updated and new bout created successfully', 'receivedData' => $data]);
    } catch (PDOException $e) {
        // Roll back the transaction if something failed
        $db->rollBack();
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId']);
}
