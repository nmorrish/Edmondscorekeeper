<?php
header('Content-Type: application/json');

// Get the input JSON data
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if ($data && isset($data['fighterId'])) {
    require_once("connect.php");
    $db = connect();
    
    try {
        $fighterId = $data['fighterId']; // The fighter whose strikes are to be incremented

        // Start a transaction
        $db->beginTransaction();

        // Increment the strikes for the specified fighter
        $stmt = $db->prepare("UPDATE Fighters SET strikes = strikes + 1 WHERE fighterId = :fighterId");
        $stmt->bindParam(':fighterId', $fighterId, PDO::PARAM_INT);
        $stmt->execute();

        // Check if the update was successful
        if ($stmt->rowCount() > 0) {
            // Fetch the updated fighter's name and current strikes
            $stmt2 = $db->prepare("SELECT fighterName, strikes FROM Fighters WHERE fighterId = :fighterId");
            $stmt2->bindParam(':fighterId', $fighterId, PDO::PARAM_INT);
            $stmt2->execute();
            $fighter = $stmt2->fetch(PDO::FETCH_ASSOC);

            if ($fighter) {
                // Commit the transaction
                $db->commit();

                // Return success response with fighter's name and updated strikes
                echo json_encode([
                    'status' => 'success', 
                    'message' => 'Fighter strikes incremented successfully', 
                    'fighterName' => $fighter['fighterName'], 
                    'strikes' => (int)$fighter['strikes']
                ]);
            } else {
                // Rollback in case the fighter details are not found
                $db->rollBack();
                echo json_encode(['status' => 'error', 'message' => 'Fighter not found after update']);
            }
        } else {
            // Rollback if no rows were affected by the update
            $db->rollBack();
            echo json_encode(['status' => 'error', 'message' => 'Fighter not found or no changes made']);
        }

    } catch (PDOException $e) {
        // Rollback transaction in case of an error
        $db->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or fighterId not provided']);
}
?>
