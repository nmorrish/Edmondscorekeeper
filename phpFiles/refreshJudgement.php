<?php
header('Content-Type: application/json');

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// Check if JSON data was received and contains matchId
if ($data && isset($data['matchId'])) {
    require_once("connect.php");

    try {
        $db = connect();

        // Extract the matchId from the received data
        $matchId = $data['matchId'];

        // Check if any bouts exist for the given matchId
        $checkStmt = $db->prepare("SELECT COUNT(*) FROM Bouts WHERE matchId = :matchId");
        $checkStmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $checkStmt->execute();
        $boutCount = $checkStmt->fetchColumn();

        if ($boutCount > 0) {
            // Fetch the highest boutId for the given matchId
            $stmt = $db->prepare("SELECT MAX(boutId) AS highestBoutId FROM Bouts WHERE matchId = :matchId");
            $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
            $stmt->execute();
            $highestBoutId = $stmt->fetchColumn();

            // Update the lastJudgement timestamp for the given matchId
            $updateStmt = $db->prepare("UPDATE Matches SET lastJudgement = CURRENT_TIMESTAMP WHERE matchId = :matchId");
            $updateStmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
            $updateStmt->execute();

            echo json_encode([
                'status' => 'success',
                'message' => 'Last judgement timestamp updated successfully',
                'highestBoutId' => $highestBoutId,
                'receivedData' => $data
            ]);
        } else {
            // No bouts found, do nothing
            echo json_encode(['status' => 'error', 'message' => 'No bouts found for the given matchId, no action taken']);
        }

    } catch (PDOException $e) {
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);

    } finally {
        // Ensure the database connection is closed
        $db = null;
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId']);
}
