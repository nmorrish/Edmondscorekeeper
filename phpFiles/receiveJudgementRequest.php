<?php
/**
 * receiveJudgementRequest.php
 *
 * Responsibilities:
 *  - Activate the given match (set PendingActiveDone = 'A') if not already active.
 *    DB trigger ensures exclusivity (other matches in same ring auto-deactivated).
 *  - Update lastJudgement timestamp on MatchFighters (SSE signaling).
 *  - Insert SYSTEM placeholder Exchange rows for each fighter in the match.
 *
 * Input (POST JSON):
 * { "matchId": 42 }
 *
 * Success:
 * {
 *   "status": "success",
 *   "message": "Match activated, timestamps updated, and placeholder exchanges created",
 *   "receivedData": { "matchId": 42 }
 * }
 *
 * Error:
 * { "status": "error", "message": "error message" }
 */

header('Content-Type: application/json');
require_once("connect.php");

$jsonData = file_get_contents('php://input');
$data = json_decode($jsonData, true);

// --- Input validation ---
if (!$data || !isset($data['matchId']) || !is_numeric($data['matchId'])) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId']);
    exit;
}

$matchId = (int)$data['matchId'];

try {
    $db = connect();
    $db->beginTransaction();

    // --- Verify match exists ---
    $stmt = $db->prepare("SELECT MatchId, PendingActiveDone FROM Matches WHERE MatchId = :matchId");
    $stmt->execute([':matchId' => $matchId]);
    $match = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$match) {
        throw new Exception("Match not found (id={$matchId})");
    }

    // --- Activate if not already active ---
    if ($match['PendingActiveDone'] !== 'A') {
        $stmt = $db->prepare("
            UPDATE Matches
            SET PendingActiveDone = 'A'
            WHERE MatchId = :matchId
        ");
        $stmt->execute([':matchId' => $matchId]);
        // Trigger handles exclusivity
    }

    // --- Get all fighters in the match ---
    $stmt = $db->prepare("SELECT MatchFighterId FROM MatchFighters WHERE MatchId = :matchId");
    $stmt->execute([':matchId' => $matchId]);
    $fighters = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($fighters)) {
        throw new Exception("No fighters assigned to match {$matchId}");
    }

    // --- Insert SYSTEM placeholder exchange for each fighter ---
    $stmt = $db->prepare("
        INSERT INTO Exchanges (MatchFighterId, JudgeName)
        VALUES (:matchFighterId, 'SYSTEM')
    ");
    foreach ($fighters as $mfId) {
        $stmt->execute([':matchFighterId' => $mfId]);
    }

    // --- Update lastJudgement timestamp for all fighters in the match ---
    $stmt = $db->prepare("
        UPDATE MatchFighters
        SET lastJudgement = CURRENT_TIMESTAMP
        WHERE MatchId = :matchId
    ");
    $stmt->execute([':matchId' => $matchId]);

    $db->commit();

    echo json_encode([
        'status' => 'success',
        'message' => 'Match activated, timestamps updated, and placeholder exchanges created',
        'receivedData' => $data
    ]);

} catch (Exception $e) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);

} finally {
    $db = null;
}
