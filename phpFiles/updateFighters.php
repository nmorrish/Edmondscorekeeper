<?php
header('Content-Type: application/json');

// Get the input JSON data
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if ($data) {
    require_once("connect.php");
    $db = connect();

    $matchId = $data['matchId'];

    // Get existing fighter data from DB for this match
    $stmtExisting = $db->prepare("SELECT fighter1Id, fighter1Color, fighter2Id, fighter2Color FROM Matches WHERE matchId = :matchId");
    $stmtExisting->bindParam(':matchId', $matchId, PDO::PARAM_INT);
    $stmtExisting->execute();
    $existingFighterData = $stmtExisting->fetch(PDO::FETCH_ASSOC);

    // Retain existing values if not passed in request
    $fighter1Id = $data['fighter1']['id'] ?? $existingFighterData['fighter1Id'];
    $fighter1Color = $data['fighter1']['color'] ?? $existingFighterData['fighter1Color'];
    $fighter2Id = $data['fighter2']['id'] ?? $existingFighterData['fighter2Id'];
    $fighter2Color = $data['fighter2']['color'] ?? $existingFighterData['fighter2Color'];

    try {
        $db->beginTransaction();

        // Update fighter1 and fighter2 in the Matches table
        $updateMatchQuery = "
            UPDATE Matches 
            SET fighter1Id = :fighter1Id, fighter1Color = :fighter1Color, 
                fighter2Id = :fighter2Id, fighter2Color = :fighter2Color 
            WHERE matchId = :matchId";

        $stmt = $db->prepare($updateMatchQuery);
        $stmt->bindParam(':fighter1Id', $fighter1Id, PDO::PARAM_INT);
        $stmt->bindParam(':fighter1Color', $fighter1Color, PDO::PARAM_STR);
        $stmt->bindParam(':fighter2Id', $fighter2Id, PDO::PARAM_INT);
        $stmt->bindParam(':fighter2Color', $fighter2Color, PDO::PARAM_STR);
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        // Commit the transaction
        $db->commit();

        // Fetch updated match data
        $stmt2 = $db->prepare("
            SELECT matchId, fighter1Id, fighter1Color, fighter2Id, fighter2Color 
            FROM Matches WHERE matchId = :matchId");
        $stmt2->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt2->execute();
        $updatedMatch = $stmt2->fetch(PDO::FETCH_ASSOC);

        // Return the updated match data as JSON
        echo json_encode(['status' => 'success', 'updatedMatch' => $updatedMatch]);

    } catch (PDOException $e) {
        $db->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
}
