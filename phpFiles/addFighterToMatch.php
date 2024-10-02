<?php
header('Content-Type: application/json');

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if ($data) {
    require_once("connect.php");

    try {
        $db = connect();

        // Extract the variables
        $fighter1Id = $data['fighter1'];
        $colorFighter1 = $data['colorFighter1'];
        $fighter2Id = $data['fighter2'];
        $colorFighter2 = $data['colorFighter2'];
        $ring = $data['ring'];

        // Prepare and execute the query to insert the match with fighter details and update lastJudgement to the current timestamp
        $stmt = $db->prepare("
            INSERT INTO Matches (matchRing, fighter1Id, fighter2Id, fighter1Color, fighter2Color, lastJudgement) 
            VALUES (:ring, :fighter1Id, :fighter2Id, :fighter1Color, :fighter2Color, CURRENT_TIMESTAMP)
        ");

        // Bind the parameters
        $stmt->bindParam(':ring', $ring, PDO::PARAM_INT);
        $stmt->bindParam(':fighter1Id', $fighter1Id, PDO::PARAM_INT);
        $stmt->bindParam(':fighter2Id', $fighter2Id, PDO::PARAM_INT);
        $stmt->bindParam(':fighter1Color', $colorFighter1, PDO::PARAM_STR);
        $stmt->bindParam(':fighter2Color', $colorFighter2, PDO::PARAM_STR);

        // Execute the statement
        $stmt->execute();

        echo json_encode(['status' => 'success', 'receivedData' => $data]);
    } catch (PDOException $e) {
        // Handle any errors during execution
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    } finally {
        // Ensure the database connection is closed
        $db = null;
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
}
