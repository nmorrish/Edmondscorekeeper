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

        // Increment the strikes for the specified fighter
        $stmt = $db->prepare("UPDATE Fighters SET strikes = strikes + 1 WHERE fighterId = :fighterId");
        $stmt->bindParam(':fighterId', $fighterId, PDO::PARAM_INT);
        $stmt->execute();

        // Check if the update was successful
        if ($stmt->rowCount() > 0) {
            echo json_encode(['status' => 'success', 'message' => 'Fighter strikes incremented successfully']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Fighter not found or no changes made']);
        }

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or fighterId not provided']);
}
?>
