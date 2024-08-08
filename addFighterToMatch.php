<?php
header('Content-Type: application/json');

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// Simply echo back the JSON received for demonstration
if ($data) {
    require_once("connect.php");
    $db = connect();

    // Extract the variables
    $fighter1Id = $data['fighter1'];
    $colorFighter1 = $data['colorFighter1'];
    $fighter2Id = $data['fighter2'];
    $colorFighter2 = $data['colorFighter2'];
    $ring = $data['ring'];

    // Prepare and execute the query to insert the match
    $stmt = $db->prepare("INSERT INTO Matches (matchRing) VALUES (:ring)");
    $stmt->bindParam(':ring', $ring, PDO::PARAM_INT);
    $stmt->execute();

    // Get the ID of the newly inserted match
    $matchId = $db->lastInsertId();

    $stmt = $db->prepare("INSERT INTO Bouts (matchId, fighterId, fighterColor) VALUES (:matchId, :fighterId, :fighterColor)");

    // Insert fighter1
    $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
    $stmt->bindParam(':fighterId', $fighter1Id, PDO::PARAM_INT);
    $stmt->bindParam(':fighterColor', $colorFighter1, PDO::PARAM_STR);
    $stmt->execute();

    // Insert fighter2
    $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
    $stmt->bindParam(':fighterId', $fighter2Id, PDO::PARAM_INT);
    $stmt->bindParam(':fighterColor', $colorFighter2, PDO::PARAM_STR);
    $stmt->execute();

    echo json_encode(['status' => 'success', 'receivedData' => $data]);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
}
