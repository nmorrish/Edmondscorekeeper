<?php
/**
 * refreshJudgement.php
 *
 * Refreshes the lastJudgement timestamp for all fighters in a match.
 * Finds the most recent ExchangeId linked to that match (acts like highestBoutId).
 *
 * Input (POST JSON):
 * { "matchId": 42 }
 *
 * Success:
 * {
 *   "status": "success",
 *   "message": "Last judgement timestamp updated successfully",
 *   "highestExchangeId": 123,
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

if (!$data || !isset($data['matchId']) || !is_numeric($data['matchId'])) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON or missing matchId']);
    exit;
}

$matchId = (int)$data['matchId'];

try {
    $db = connect();

    // --- Check if match exists ---
    $chk = $db->prepare("SELECT MatchId FROM Matches WHERE MatchId = :mid");
    $chk->execute([':mid' => $matchId]);
    if (!$chk->fetch()) {
        throw new Exception("Match not found (id={$matchId})");
    }

    // --- Get the highest ExchangeId tied to fighters in this match ---
    $stmt = $db->prepare("
        SELECT MAX(e.ExchangeId) AS highestExchangeId
        FROM Exchanges e
        INNER JOIN MatchFighters mf ON e.MatchFighterId = mf.MatchFighterId
        WHERE mf.MatchId = :mid
    ");
    $stmt->execute([':mid' => $matchId]);
    $highestExchangeId = $stmt->fetchColumn();

    if (!$highestExchangeId) {
        echo json_encode([
            'status' => 'error',
            'message' => 'No exchanges found for the given matchId, no action taken'
        ]);
        exit;
    }

    // --- Update lastJudgement for all fighters in this match ---
    $update = $db->prepare("
        UPDATE MatchFighters
        SET lastJudgement = CURRENT_TIMESTAMP
        WHERE MatchId = :mid
    ");
    $update->execute([':mid' => $matchId]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Last judgement timestamp updated successfully',
        'highestExchangeId' => (int)$highestExchangeId,
        'receivedData' => $data
    ]);

} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);

} finally {
    $db = null;
}
