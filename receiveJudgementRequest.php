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
        // Prepare and execute the query to increment the pendingJudges count for the given matchId
        $stmt = $db->prepare("UPDATE Matches SET pendingJudges = pendingJudges + 1 WHERE matchId = :matchId");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode(['status' => 'success', 'message' => 'Pending judges incremented successfully', 'receivedData' => $data]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId']);
}
