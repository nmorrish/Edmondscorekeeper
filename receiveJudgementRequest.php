<?php
header('Content-Type: application/json');

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// Check if JSON data was received
if ($data && isset($data['matchId']) && isset($data['judgeCount'])) {
    require_once("connect.php");
    $db = connect();

    // Extract the matchId and judgeCount from the received data
    $matchId = $data['matchId'];
    $judgeCount = $data['judgeCount'];

    try {
        // Prepare and execute the query to update the pendingJudges with the received judgeCount for the given matchId
        $stmt = $db->prepare("UPDATE Matches SET pendingJudges = :judgeCount WHERE matchId = :matchId");
        $stmt->bindParam(':judgeCount', $judgeCount, PDO::PARAM_INT);
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode(['status' => 'success', 'message' => 'Match updated successfully', 'receivedData' => $data]);
    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId/judgeCount']);
}
