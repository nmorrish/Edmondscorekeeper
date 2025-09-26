<?php
/**
 * listMatches.php (refactored for new schema)
 *
 * Returns matches for a ring/event, with nested fighters and their exchanges (scores).
 */

require_once("connect.php");

try {
    $db = connect();
    header('Content-Type: application/json');

    if (!isset($_GET['matchRing']) || !is_numeric($_GET['matchRing'])) {
        throw new Exception('matchRing parameter is required and must be an integer.');
    }
    if (!isset($_GET['eventId']) || !is_numeric($_GET['eventId'])) {
        throw new Exception('eventId parameter is required and must be an integer.');
    }
    $matchRing = (int)$_GET['matchRing'];
    $eventId   = (int)$_GET['eventId'];

    // Step 1: Fetch matches
    $mStmt = $db->prepare("
        SELECT m.MatchId, m.EventId, m.MatchRingNo, m.PendingActiveDone,
               m.lastMatchJudgement
        FROM Matches m
        WHERE m.MatchRingNo = :ring AND m.EventId = :eid
        ORDER BY m.MatchId
    ");
    $mStmt->execute([':ring' => $matchRing, ':eid' => $eventId]);
    $matches = [];
    while ($m = $mStmt->fetch(PDO::FETCH_ASSOC)) {
        $matches[$m['MatchId']] = [
            'matchId'          => (int)$m['MatchId'],
            'eventId'          => (int)$m['EventId'],
            'matchRing'        => (int)$m['MatchRingNo'],
            'status'           => $m['PendingActiveDone'], // 'P','A','D'
            'lastJudgement'    => $m['lastMatchJudgement'],
            'fighters'         => [],
            'Exchanges'        => []
        ];
    }

    if (empty($matches)) {
        echo json_encode([], JSON_PRETTY_PRINT);
        exit;
    }

    $matchIds = array_keys($matches);

    // Step 2: Fetch fighters per match
    $mfStmt = $db->prepare("
        SELECT mf.MatchId, mf.FighterId, mf.FighterColor,
               f.FighterName, f.ClubId
        FROM MatchFighters mf
        JOIN Fighters f ON f.FighterId = mf.FighterId
        WHERE mf.MatchId IN (" . implode(",", $matchIds) . ")
        ORDER BY mf.MatchId, mf.FighterColor
    ");
    $mfStmt->execute();
    while ($row = $mfStmt->fetch(PDO::FETCH_ASSOC)) {
        $matches[$row['MatchId']]['fighters'][] = [
            'fighterId'   => (int)$row['FighterId'],
            'fighterName' => $row['FighterName'],
            'fighterColor'=> $row['FighterColor'],
            'clubId'      => $row['ClubId']
        ];
    }

    // Step 3: Fetch exchanges (scores)
    $exStmt = $db->prepare("
        SELECT me.MatchId, e.ExchangeId, e.FighterId, e.JudgeName,
               e.Contact, e.Target, e.Control, e.DoubleHit, e.AfterBlow, e.OpponentSelfCall,
               me.lastJudgement
        FROM MatchExchanges me
        JOIN Exchanges e ON e.ExchangeId = me.ExchangeId
        WHERE me.MatchId IN (" . implode(",", $matchIds) . ")
        ORDER BY me.MatchId, e.ExchangeId
    ");
    $exStmt->execute();
    while ($row = $exStmt->fetch(PDO::FETCH_ASSOC)) {
        $matches[$row['MatchId']]['Exchanges'][] = [
            'exchangeId'       => (int)$row['ExchangeId'],
            'fighterId'        => (int)$row['FighterId'],
            'judgeName'        => $row['JudgeName'],
            'contact'          => (bool)$row['Contact'],
            'target'           => (bool)$row['Target'],
            'control'          => (bool)$row['Control'],
            'doubleHit'        => (bool)$row['DoubleHit'],
            'afterBlow'        => (bool)$row['AfterBlow'],
            'opponentSelfCall' => (bool)$row['OpponentSelfCall'],
            'lastJudgement'    => $row['lastJudgement']
        ];
    }

    echo json_encode(array_values($matches), JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} finally {
    $db = null;
}
