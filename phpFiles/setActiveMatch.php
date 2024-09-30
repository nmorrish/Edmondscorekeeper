<?php
header('Content-Type: application/json');

// Get the input JSON data
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if ($data && isset($data['matchId'])) {
    require_once("connect.php");
    $db = connect();
    
    try {
        $matchId = $data['matchId']; // The match to be set as active

        // Start transaction
        $db->beginTransaction();

        // Deactivate all matches except the one being activated
        $stmt1 = $db->prepare("UPDATE Matches SET Active = 0 WHERE Active = 1 AND matchId != :matchId");
        $stmt1->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt1->execute();

        // Activate the specified match
        $stmt2 = $db->prepare("UPDATE Matches SET Active = 1 WHERE matchId = :matchId");
        $stmt2->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt2->execute();

        // Commit the transaction
        $db->commit();

        echo json_encode(['status' => 'success', 'message' => 'Active match set successfully']);
    } catch (PDOException $e) {
        // Rollback in case of an error
        $db->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or matchId not provided']);
}
