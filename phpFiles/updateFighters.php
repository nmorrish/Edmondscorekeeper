<?php
/**
 * updateFighters.php
 * 
 * Updates the fighter IDs and colors for a specific match in the Matches table.
 * If a value is not provided in the request, the existing value in the database is retained.
 * Very handy if someone needs to swap out.
 * 
 * Expects a POST with a JSON body as follows:
 * {
 *   "matchId": 42,
 *   "fighter1": { "id": 11, "color": "Red" },
 *   "fighter2": { "id": 12, "color": "Blue" }
 * }
 * 
 * Partial updates are allowed — any missing fields will retain their current database values.
 * 
 * On success returns:
 * {
 *   "status": "success",
 *   "updatedMatch": {
 *     "matchId": 42,
 *     "fighter1Id": 11,
 *     "fighter1Color": "Red",
 *     "fighter2Id": 12,
 *     "fighter2Color": "Blue"
 *   }
 * }
 * 
 * On error returns:
 * {
 *   "status": "error",
 *   "message": "error message"
 * }
 */
header('Content-Type: application/json');

// Get the input JSON data
$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

if ($data) {
    require_once("connect.php");

    try {
        $db = connect();
        $matchId = $data['matchId'];

        // Get existing fighter data from DB for this match
        $stmtExisting = $db->prepare("SELECT fighter1Id, fighter1Color, fighter2Id, fighter2Color FROM Matches WHERE matchId = :matchId");
        $stmtExisting->bindParam(':matchId', $matchId, PDO::PARAM_INT);
        $stmtExisting->execute();
        $existingFighterData = $stmtExisting->fetch(PDO::FETCH_ASSOC);

        if (!$existingFighterData) {
            throw new Exception('Match not found');
        }

        // Retain existing values if not passed in request
        $fighter1Id = $data['fighter1']['id'] ?? $existingFighterData['fighter1Id'];
        $fighter1Color = $data['fighter1']['color'] ?? $existingFighterData['fighter1Color'];
        $fighter2Id = $data['fighter2']['id'] ?? $existingFighterData['fighter2Id'];
        $fighter2Color = $data['fighter2']['color'] ?? $existingFighterData['fighter2Color'];

        // Start transaction
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
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    } finally {
        // Ensure the database connection is closed
        $db = null;
    }

} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
}
