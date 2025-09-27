<?php
/**
 * phpFiles/judgementScoreSubmit.php
 *
 * Records scoring data submitted by judges for a specific match.
 * - Reuses the current Exchange row per fighter (creates one if none exists)
 * - Adds one ExchangeScores row per judge
 * - Prevents duplicate judge submissions per Exchange
 * - Does NOT bump Matches.lastMatchJudgement
 */

require_once("connect.php");
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);
$response = [];

if (!$data || !isset($data['matchId'], $data['scores'])) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid payload.']);
    exit;
}

try {
    $db = connect();
    $db->beginTransaction();

    $matchId = (int)$data['matchId'];

    foreach ($data['scores'] as $fighterId => $scoreData) {
        $judgeName = $scoreData['judgeName'];

        // 1. Find MatchFighterId
        $mfStmt = $db->prepare("
            SELECT MatchFighterId
            FROM MatchFighters
            WHERE MatchId = :mid AND FighterId = :fid
        ");
        $mfStmt->execute([':mid' => $matchId, ':fid' => $fighterId]);
        $matchFighterId = $mfStmt->fetchColumn();

        if (!$matchFighterId) {
            $response[] = [
                'status' => 'error',
                'message' => "No MatchFighter found for fighter $fighterId in match $matchId"
            ];
            continue;
        }

        // 2. Find the latest Exchange for this fighter
        $exStmt = $db->prepare("
            SELECT ExchangeId 
            FROM Exchanges
            WHERE MatchFighterId = :mfid
            ORDER BY ExchangeTimeStamp DESC
            LIMIT 1
        ");
        $exStmt->execute([':mfid' => $matchFighterId]);
        $exchangeId = $exStmt->fetchColumn();

        // If no exchange yet, create one
        if (!$exchangeId) {
            $stmt = $db->prepare("
                INSERT INTO Exchanges (MatchFighterId, ExchangeTimeStamp)
                VALUES (:mfid, CURRENT_TIMESTAMP)
            ");
            $stmt->execute([':mfid' => $matchFighterId]);
            $exchangeId = $db->lastInsertId();
        }

        // 3. Check if this judge already submitted a score for this Exchange
        $checkStmt = $db->prepare("
            SELECT COUNT(*) 
            FROM ExchangeScores
            WHERE ExchangeId = :eid AND JudgeName = :jname
        ");
        $checkStmt->execute([':eid' => $exchangeId, ':jname' => $judgeName]);
        $alreadySubmitted = (int)$checkStmt->fetchColumn();

        if ($alreadySubmitted > 0) {
            $response[] = [
                'status' => 'error',
                'message' => "Judge {$judgeName} has already submitted a score for this exchange."
            ];
            continue;
        }

        // 4. Insert this judge’s score
        $ins = $db->prepare("
            INSERT INTO ExchangeScores 
            (ExchangeId, JudgeName, Contact, Target, Control, DoubleHit, AfterBlow, OpponentSelfCall)
            VALUES (:eid, :jname, :contact, :target, :control, :doubleHit, :afterBlow, :opponentSelfCall)
        ");
        $ins->execute([
            ':eid'              => $exchangeId,
            ':jname'            => $judgeName,
            ':contact'          => (int)!empty($scoreData['contact']),
            ':target'           => (int)!empty($scoreData['target']),
            ':control'          => (int)!empty($scoreData['control']),
            ':doubleHit'        => (int)!empty($scoreData['doubleHit']),
            ':afterBlow'        => (int)!empty($scoreData['afterBlow']),
            ':opponentSelfCall' => (int)!empty($scoreData['opponentSelfCall'])
        ]);
    }

    $db->commit();

    if (empty($response)) {
        $response = [
            'status'  => 'success',
            'message' => 'Scores recorded successfully',
            'matchId' => $matchId
        ];
    }
} catch (PDOException $e) {
    if ($db->inTransaction()) $db->rollBack();
    $response = ['status' => 'error', 'message' => $e->getMessage()];
} finally {
    $db = null;
}

echo json_encode($response);
