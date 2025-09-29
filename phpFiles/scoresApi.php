<?php
/**
 * phpFiles/scoresApi.php
 *
 * === Match Scores API ===
 * Returns all matches for a given eventId + ringNo (or a single matchId),
 * with fighters, exchanges, and scores embedded.
 *
 * Structure:
 * {
 *   status: "success",
 *   matches: [
 *     {
 *       matchId,
 *       matchRing,
 *       queueNo,
 *       poolNo,
 *       pendingActiveDone,
 *       fighters: [
 *         {
 *           fighterId,
 *           fighterName,
 *           fighterColor,
 *           finalScore,
 *           winLossDraw,
 *           strikes,       <-- pulled from TournamentFighters, separate from score
 *           exchanges: [
 *             {
 *               exchangeId,
 *               exchangeTimeStamp,
 *               scores: [...]
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

$method   = $_SERVER['REQUEST_METHOD'];
$matchId  = isset($_GET['matchId']) ? (int)$_GET['matchId'] : null;
$eventId  = isset($_GET['eventId']) ? (int)$_GET['eventId'] : null;
$ringNo   = isset($_GET['ringNo']) ? (int)$_GET['ringNo'] : null;

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---- helper: build full match structure ----
function buildMatch($db, $matchId) {
    // fetch match metadata including queue number + pool number
    $stmt = $db->prepare("
        SELECT m.MatchId, m.MatchRingNo, m.PendingActiveDone, m.MatchQueueNumber,
               p.PoolNo
        FROM Matches m
        LEFT JOIN PoolMatches pm ON m.MatchId = pm.MatchId
        LEFT JOIN Pools p ON pm.PoolId = p.PoolId
        WHERE m.MatchId=?
        LIMIT 1
    ");
    $stmt->execute([$matchId]);
    $match = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$match) return null;

    // fighters in this match
    $stmt = $db->prepare("
        SELECT 
            mf.MatchFighterId,
            mf.FighterId,
            f.FighterName,
            mf.FighterColor,
            mf.FinalScore,
            mf.WinLossDraw,
            tf.Strikes
        FROM MatchFighters mf
        JOIN Fighters f ON mf.FighterId = f.FighterId
        LEFT JOIN TournamentFighters tf 
            ON tf.FighterId = f.FighterId AND tf.TournamentId = (
                SELECT e.TournamentId 
                FROM Matches m 
                JOIN Events e ON m.EventId = e.EventId 
                WHERE m.MatchId = mf.MatchId
            )
        WHERE mf.MatchId = ?
        ORDER BY mf.MatchFighterId ASC
    ");
    $stmt->execute([$matchId]);
    $fighters = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($fighters as &$f) {
        // exchanges for this fighter
        $stmtEx = $db->prepare("
            SELECT ExchangeId, ExchangeTimeStamp
            FROM Exchanges 
            WHERE MatchFighterId=? 
            ORDER BY ExchangeId ASC
        ");
        $stmtEx->execute([$f['MatchFighterId']]);
        $exchanges = $stmtEx->fetchAll(PDO::FETCH_ASSOC);

        foreach ($exchanges as &$ex) {
            // scores for each exchange
            $stmtScores = $db->prepare("
                SELECT ExchangeScoresId, JudgeName, Contact, Target, Control,
                       AfterBlow, DoubleHit, OpponentSelfCall, ScoreTimeStamp
                FROM ExchangeScores
                WHERE ExchangeId=?
                ORDER BY ExchangeScoresId ASC
            ");
            $stmtScores->execute([$ex['ExchangeId']]);
            $scores = $stmtScores->fetchAll(PDO::FETCH_ASSOC);

            $ex['scores'] = array_map(fn($s) => [
                'scoreId'          => (int)$s['ExchangeScoresId'],
                'judgeName'        => $s['JudgeName'],
                'contact'          => (int)$s['Contact'],
                'target'           => (int)$s['Target'],
                'control'          => (int)$s['Control'],
                'afterBlow'        => (int)$s['AfterBlow'],
                'doubleHit'        => (int)$s['DoubleHit'],
                'opponentSelfCall' => (int)$s['OpponentSelfCall'],
                'scoreTimeStamp'   => $s['ScoreTimeStamp'],
            ], $scores);
        }

        // normalize fighter output
        $f = [
            'fighterId'   => (int)$f['FighterId'],
            'fighterName' => $f['FighterName'],
            'fighterColor'=> $f['FighterColor'],
            'finalScore'  => $f['FinalScore'] !== null ? (float)$f['FinalScore'] : 0,
            'winLossDraw' => $f['WinLossDraw'],
            'strikes'     => $f['Strikes'] !== null ? (int)$f['Strikes'] : 0,
            'exchanges'   => $exchanges
        ];
    }

    return [
        'matchId'          => (int)$match['MatchId'],
        'matchRing'        => (int)$match['MatchRingNo'],
        'queueNo'          => $match['MatchQueueNumber'] !== null ? (int)$match['MatchQueueNumber'] : null,
        'poolNo'           => $match['PoolNo'] !== null ? (int)$match['PoolNo'] : null,
        'pendingActiveDone'=> $match['PendingActiveDone'],
        'fighters'         => $fighters
    ];
}

try {
    if ($method !== 'GET') {
        throw new Exception("GET required");
    }

    $matches = [];

    if ($matchId) {
        $m = buildMatch($db, $matchId);
        if ($m) $matches[] = $m;
    } elseif ($eventId && $ringNo) {
        $stmt = $db->prepare("
            SELECT MatchId 
            FROM Matches 
            WHERE EventId=? AND MatchRingNo=? 
            ORDER BY MatchQueueNumber ASC, MatchId ASC
        ");
        $stmt->execute([$eventId, $ringNo]);
        $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($ids as $id) {
            $m = buildMatch($db, $id);
            if ($m) $matches[] = $m;
        }
    } else {
        throw new Exception("matchId OR (eventId+ringNo) required");
    }

    echo json_encode(['status'=>'success','matches'=>$matches]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} finally {
    $db = null;
}
