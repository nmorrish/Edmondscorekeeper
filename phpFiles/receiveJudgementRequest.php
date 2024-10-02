<?php
header('Content-Type: application/json');

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// Check if JSON data was received
if ($data && isset($data['matchId'])) {
    require_once("connect.php");

    try {
        $db = connect();

        // Extract the matchId from the received data
        $matchId = $data['matchId'];

        // Begin a transaction to ensure all queries are executed together
        $db->beginTransaction();

        // Get the matchRing of the match to be activated
        $stmt = $db->prepare("SELECT matchRing, Active FROM Matches WHERE matchId = :matchId");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$result) {
            throw new Exception('Match not found');
        }

        $matchRing = $result['matchRing']; // Get the ring of the match
        $isActive = $result['Active']; // Check if the match is already active

        // If the match is not already active, proceed with activating it
        if ($isActive == 0) {
            // Deactivate all other active matches within the same matchRing
            $stmt = $db->prepare("UPDATE Matches SET Active = 0 WHERE Active = 1 AND matchRing = :matchRing");
            $stmt->bindParam(':matchRing', $matchRing, PDO::PARAM_INT);
            $stmt->execute();

            // Set the current match as active
            $stmt = $db->prepare("UPDATE Matches SET Active = 1 WHERE matchId = :matchId");
            $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
            $stmt->execute();
        }

        // Update the lastJudgement timestamp for the given matchId
        $stmt = $db->prepare("UPDATE Matches SET lastJudgement = CURRENT_TIMESTAMP WHERE matchId = :matchId");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        // Insert a new bout with the matchId
        $stmt = $db->prepare("INSERT INTO Bouts (matchId) VALUES (:matchId)");
        $stmt->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmt->execute();

        // Commit the transaction
        $db->commit();

        echo json_encode(['status' => 'success', 'message' => 'Match set as active, last judgement timestamp updated, and new bout created successfully', 'receivedData' => $data]);

    } catch (PDOException $e) {
        // Roll back the transaction if something failed
        $db->rollBack();
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);

    } finally {
        // Ensure the database connection is closed
        $db = null;
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId']);
}
