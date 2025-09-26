<?php
/**
 * judgementSubmit.php 
 *
 * Records scoring data submitted by judges for a specific match.
 * Each fighter's exchange is stored independently, linked through MatchExchanges.
 * Ensures a judge cannot submit more than two scores per match (one per fighter).
 *
 * Expected POST body:
 * {
 *   "matchId": 15,
 *   "scores": {
 *     "13": { "contact": true, "target": true, "control": false, ... , "judgeName": "Dredd" },
 *     "12": { "contact": false, "target": true, "control": true, ... , "judgeName": "Dredd" }
 *   }
 * }
 */

require_once("connect.php");
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$response = [];

try {
    $db = connect();
    $db->beginTransaction();

    foreach ($data['scores'] as $fighterId => $scoreData) {
        // Check judge submissions for this match
        $checkStmt = $db->prepare("
            SELECT COUNT(*) 
            FROM Exchanges e
            JOIN MatchExchanges me ON me.ExchangeId = e.ExchangeId
            WHERE me.MatchId = :matchId AND e.JudgeName = :judgeName
        ");
        $checkStmt->execute([
            ':matchId'   => $data['matchId'],
            ':judgeName' => $scoreData['judgeName']
        ]);
        $alreadySubmitted = $checkStmt->fetchColumn();

        if ($alreadySubmitted >= 2) {
            $response[] = [
                'status' => 'error',
                'message' => "Judge {$scoreData['judgeName']} has already submitted two scores for match {$data['matchId']}."
            ];
            continue;
        }

        // Insert into Exchanges
        $stmt = $db->prepare("
            INSERT INTO Exchanges 
            (FighterId, JudgeName, Contact, Target, Control, DoubleHit, AfterBlow, OpponentSelfCall) 
            VALUES (:fighterId, :judgeName, :contact, :target, :control, :doubleHit, :afterBlow, :opponentSelfCall)
        ");
        $stmt->execute([
            ':fighterId'        => $fighterId,
            ':judgeName'        => $scoreData['judgeName'],
            ':contact'          => (bool)$scoreData['contact'],
            ':target'           => (bool)$scoreData['target'],
            ':control'          => (bool)$scoreData['control'],
            ':doubleHit'        => (bool)$scoreData['doubleHit'],
            ':afterBlow'        => (bool)$scoreData['afterBlow'],
            ':opponentSelfCall' => (bool)$scoreData['opponentSelfCall']
        ]);
        $exchangeId = $db->lastInsertId();

        // Link exchange to match
        $stmt2 = $db->prepare("INSERT INTO MatchExchanges (MatchId, ExchangeId) VALUES (:mid, :eid)");
        $stmt2->execute([
            ':mid' => $data['matchId'],
            ':eid' => $exchangeId
        ]);
    }

    // Update match timestamp
    $upd = $db->prepare("UPDATE Matches SET lastMatchJudgement = CURRENT_TIMESTAMP WHERE MatchId = :mid");
    $upd->execute([':mid' => $data['matchId']]);

    $db->commit();

    if (empty($response)) {
        $response = [
            'status'  => 'success',
            'message' => 'Scores recorded successfully',
            'data'    => $data
        ];
    }
} catch (PDOException $e) {
    if ($db->inTransaction()) $db->rollBack();
    $response = ['status' => 'error', 'message' => $e->getMessage()];
} finally {
    $db = null;
}

echo json_encode($response);
