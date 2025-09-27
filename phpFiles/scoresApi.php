<?php
/**
 * phpFiles/scoresApi.php
 *
 * === Match Scores API ===
 * Returns all Exchanges + ExchangeScores for a given matchId, grouped by fighter.
 * Structure:
 * {
 *   status: "success",
 *   matches: [
 *     {
 *       matchId,
 *       matchRing,
 *       pendingActiveDone,
 *       fighters: [
 *         {
 *           fighterId,
 *           fighterName,
 *           fighterColor,
 *           strikes,
 *           exchanges: [
 *             {
 *               exchangeId,
 *               exchangeTimeStamp,
 *               scores: [
 *                 { scoreId, judgeName, contact, target, control, afterBlow, doubleHit, opponentSelfCall, scoreTimeStamp }
 *               ]
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/connect.php';
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];
$matchId = isset($_GET['matchId']) ? (int)$_GET['matchId'] : null;

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    if ($method !== 'GET' || !$matchId) {
        throw new Exception("GET with matchId required");
    }

    // --- Get match metadata ---
    $stmt = $db->prepare("
        SELECT MatchId, MatchRingNo, PendingActiveDone
        FROM Matches
        WHERE MatchId = ?
    ");
    $stmt->execute([$matchId]);
    $match = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$match) {
        throw new Exception("Match not found");
    }

    // --- Get fighters in this match ---
    $stmt = $db->prepare("
        SELECT 
            mf.MatchFighterId,
            mf.FighterId,
            f.FighterName,
            mf.FighterColor,
            mf.FinalScore AS Strikes
        FROM MatchFighters mf
        JOIN Fighters f ON mf.FighterId = f.FighterId
        WHERE mf.MatchId = ?
        ORDER BY mf.MatchFighterId ASC
    ");
    $stmt->execute([$matchId]);
    $fighters = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- For each fighter, attach exchanges + scores ---
    foreach ($fighters as &$fighter) {
        $stmtEx = $db->prepare("
            SELECT 
                e.ExchangeId,
                e.ExchangeTimeStamp
            FROM Exchanges e
            WHERE e.MatchFighterId = ?
            ORDER BY e.ExchangeId ASC
        ");
        $stmtEx->execute([$fighter['MatchFighterId']]);
        $exchanges = $stmtEx->fetchAll(PDO::FETCH_ASSOC);

        foreach ($exchanges as &$exchange) {
            $stmtScores = $db->prepare("
                SELECT 
                    es.ExchangeScoresId,
                    es.JudgeName,
                    es.Contact,
                    es.Target,
                    es.Control,
                    es.AfterBlow,
                    es.DoubleHit,
                    es.OpponentSelfCall,
                    es.ScoreTimeStamp
                FROM ExchangeScores es
                WHERE es.ExchangeId = ?
                ORDER BY es.ExchangeScoresId ASC
            ");
            $stmtScores->execute([$exchange['ExchangeId']]);
            $scores = $stmtScores->fetchAll(PDO::FETCH_ASSOC);

            // Normalize scores
            $exchange['scores'] = array_map(function($s) {
                return [
                    'scoreId' => (int)$s['ExchangeScoresId'],
                    'judgeName' => $s['JudgeName'],
                    'contact' => (int)$s['Contact'],
                    'target' => (int)$s['Target'],
                    'control' => (int)$s['Control'],
                    'afterBlow' => (int)$s['AfterBlow'],
                    'doubleHit' => (int)$s['DoubleHit'],
                    'opponentSelfCall' => (int)$s['OpponentSelfCall'],
                    'scoreTimeStamp' => $s['ScoreTimeStamp'],
                ];
            }, $scores);

            unset($exchange['Scores']); // remove old casing if present
        }

        $fighter = [
            'fighterId' => (int)$fighter['FighterId'],
            'fighterName' => $fighter['FighterName'],
            'fighterColor' => $fighter['FighterColor'],
            'strikes' => (int)$fighter['Strikes'],
            'exchanges' => array_map(function($ex) {
                return [
                    'exchangeId' => (int)$ex['ExchangeId'],
                    'exchangeTimeStamp' => $ex['ExchangeTimeStamp'],
                    'scores' => $ex['scores']
                ];
            }, $exchanges)
        ];
    }

    echo json_encode([
        'status' => 'success',
        'matches' => [[
            'matchId' => (int)$match['MatchId'],
            'matchRing' => (int)$match['MatchRingNo'],
            'pendingActiveDone' => $match['PendingActiveDone'],
            'fighters' => $fighters
        ]]
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} finally {
    $db = null;
}
