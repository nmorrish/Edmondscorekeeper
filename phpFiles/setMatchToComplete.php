<?php
header('Content-Type: application/json');

// Get the input JSON data
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if ($data && isset($data['matchId'])) {
    require_once("connect.php");
    $db = connect();
    
    try {
        $matchId = $data['matchId']; // The match to be set as complete

        // Start transaction
        $db->beginTransaction();

        // Mark the specified match as complete
        $stmt = $db->prepare("UPDATE Matches SET matchComplete = 1 WHERE matchId = :matchId");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        // Commit the transaction
        $db->commit();

        echo json_encode(['status' => 'success', 'message' => 'Match marked as complete successfully']);
    } catch (PDOException $e) {
        // Rollback in case of an error
        $db->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or matchId not provided']);
}
