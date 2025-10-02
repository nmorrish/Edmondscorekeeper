<?php
/**
 * phpFiles/eliminationBrackets.php
 *
 * === Elimination Brackets API (Round-by-Round, BYEs in own columns) ===
 * - POST { action:"create", eventId, fighters:[ids], withBronze?:bool, maxRings?:int }
 *   → builds bracket round-by-round, adds BYE columns when needed, wires NextMatchWin/Loss
 * - POST { action:"fetch", eventId }
 *   → returns structured JSON of bracket
 *
 * Notes:
 *  - Bronze is created before Final to ensure MatchId/Queue order and BracketNo display order are correct.
 *  - True Bronze only created if last pairs column = 1 match (Final) and penultimate pairs column = 2 matches (Semis).
 */

require_once("connect.php");
header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data["eventId"], $data["action"])) {
    echo json_encode(["status" => "error", "message" => "Invalid payload"]);
    exit;
}

$eventId = (int)$data["eventId"];
$action  = $data["action"];

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) $pdo = connect();
    return $pdo;
}

try {
    $pdo = db();

    if ($action === "create") {
        if (!isset($data["fighters"]) || !is_array($data["fighters"])) {
            echo json_encode(["status" => "error", "message" => "fighters[] required"]);
            exit;
        }

        $fighters    = array_values(array_filter($data["fighters"], fn($f) => $f !== null));
        $withBronze  = isset($data["withBronze"]) ? (bool)$data["withBronze"] : true;
        $maxRings    = isset($data["maxRings"]) && (int)$data["maxRings"] > 0 ? (int)$data["maxRings"] : 1;
        $numFighters = count($fighters);

        if ($numFighters < 2) {
            echo json_encode(["status" => "error", "message" => "Need at least 2 fighters"]);
            exit;
        }

        $expectedTotalMatches = ($numFighters - 1) + ($withBronze ? 1 : 0);

        $pdo->beginTransaction();

        // Cleanup
        $pdo->prepare("DELETE bm FROM BracketMatches bm JOIN Brackets b ON bm.BracketId = b.BracketId WHERE b.EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE pm FROM PoolMatches pm JOIN Pools p ON pm.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE pf FROM PoolFighters pf JOIN Pools p ON pf.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);

        $stmt = $pdo->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (?, ?)");
        $stmt->execute([$eventId, 'S']);
        $bracketId = (int)$pdo->lastInsertId();

        $insMatch = $pdo->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRingNo) VALUES (?, ?, ?)");
        $insBM    = $pdo->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, ?)");
        $insMF    = $pdo->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (?, ?, ?)");
        $updNextWin  = $pdo->prepare("UPDATE BracketMatches SET NextMatchWin = ? WHERE BracketId = ? AND MatchId = ?");
        $updNextLoss = $pdo->prepare("UPDATE BracketMatches SET NextMatchLoss = ? WHERE BracketId = ? AND MatchId = ?");

        $tokens = array_map(fn($fid) => ['kind'=>'fighter','fighterId'=>(int)$fid], $fighters);

        $queueCounter = 1;
        $colNo        = 1;
        $pairsColumns = [];
        $bronzeCreated = false; // PATCH: track Bronze creation

        /* ROUND LOOP */
        while (count($tokens) > 1) {
            $nextTokens = [];
            $pairMatchIds = [];

            while (count($tokens) >= 2) {
                $t1 = array_shift($tokens);
                $t2 = array_shift($tokens);

                // PATCH: insert Bronze BEFORE creating Final
                if (
                    !$bronzeCreated &&
                    $withBronze &&
                    count($tokens) === 0 && // last pair
                    count($pairsColumns) >= 1 &&
                    count($pairsColumns[count($pairsColumns)-1]['matches']) === 2
                ) {
                    $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                    $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                    $bronzeId = (int)$pdo->lastInsertId();
                    $queueCounter++;

                    $insBM->execute([$bracketId, $bronzeId, $colNo, 'W']);

                    $semiCol = $pairsColumns[count($pairsColumns)-1];
                    foreach ($semiCol['matches'] as $sfMatchId) {
                        $updNextLoss->execute([$bronzeId, $bracketId, $sfMatchId]);
                    }

                    $bronzeCreated = true;
                    $colNo++; // bump Final to the next column
                }

                // Create match (Final if above block ran)
                $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                $matchId = (int)$pdo->lastInsertId();
                $queueCounter++;

                $insBM->execute([$bracketId, $matchId, $colNo, 'W']);
                $pairMatchIds[] = $matchId;

                // Seat fighters or wire prior winners
                if ($t1['kind'] === 'fighter') {
                    $insMF->execute([$matchId, $t1['fighterId'], 'Red']);
                } else {
                    $updNextWin->execute([$matchId, $bracketId, $t1['fromMatch']]);
                }
                if ($t2['kind'] === 'fighter') {
                    $insMF->execute([$matchId, $t2['fighterId'], 'Blue']);
                } else {
                    $updNextWin->execute([$matchId, $bracketId, $t2['fromMatch']]);
                }

                $nextTokens[] = ['kind'=>'winner','fromMatch'=>$matchId];
            }

            if (!empty($pairMatchIds)) {
                $pairsColumns[] = ['col'=>$colNo,'matches'=>$pairMatchIds];
                $colNo++;
            }

            if (count($tokens) === 1) {
                $left = array_shift($tokens);

                $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                $byeMatchId = (int)$pdo->lastInsertId();
                $queueCounter++;

                $insBM->execute([$bracketId, $byeMatchId, $colNo, 'W']);

                if ($left['kind'] === 'fighter') {
                    $insMF->execute([$byeMatchId, $left['fighterId'], 'Red']);
                } else {
                    $updNextWin->execute([$byeMatchId, $bracketId, $left['fromMatch']]);
                }

                if (!empty($pairMatchIds)) {
                    $donorMatchId = $pairMatchIds[0];
                    $updNextWin->execute([$byeMatchId, $bracketId, $donorMatchId]);
                    foreach ($nextTokens as $i=>$tok) {
                        if ($tok['kind']==='winner' && $tok['fromMatch']===$donorMatchId) {
                            unset($nextTokens[$i]);
                            break;
                        }
                    }
                    $nextTokens = array_values($nextTokens);
                }

                $nextTokens[] = ['kind'=>'winner','fromMatch'=>$byeMatchId];
                $colNo++;
            }

            $tokens = $nextTokens;
        }

        /* Fallback Bronze creation if missed */
        if ($withBronze && count($pairsColumns) >= 2 && !$bronzeCreated) {
            $finalCol = $pairsColumns[count($pairsColumns)-1];
            $semiCol  = $pairsColumns[count($pairsColumns)-2];

            if (count($finalCol['matches'])===1 && count($semiCol['matches'])===2) {
                $finalColNo   = (int)$finalCol['col'];
                $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                $bronzeId = (int)$pdo->lastInsertId();
                $queueCounter++;

                $insBM->execute([$bracketId, $bronzeId, $finalColNo, 'W']);
                foreach ($semiCol['matches'] as $sfMatchId) {
                    $updNextLoss->execute([$bronzeId, $bracketId, $sfMatchId]);
                }

                $bronzeCreated = true;
            }
        }

        // Sanity pass
        $stmtCount = $pdo->prepare("SELECT COUNT(*) FROM Matches WHERE EventId=?");
        $stmtCount->execute([$eventId]);
        $actualCount = (int)$stmtCount->fetchColumn();
        if ($actualCount > $expectedTotalMatches) {
            $surplus = $actualCount - $expectedTotalMatches;
            if ($surplus > 0) {
                $stmtTail = $pdo->prepare("
                    SELECT bm.MatchId
                      FROM BracketMatches bm
                      JOIN Matches m ON m.MatchId=bm.MatchId
                     WHERE m.EventId=?
                     ORDER BY bm.BracketNo DESC, bm.MatchId DESC
                     LIMIT $surplus
                ");
                $stmtTail->execute([$eventId]);
                $toDelete = $stmtTail->fetchAll(PDO::FETCH_COLUMN);
                if (!empty($toDelete)) {
                    $in = implode(',', array_fill(0,count($toDelete),'?'));
                    $params = $toDelete; array_unshift($params,$bracketId);
                    $pdo->prepare("UPDATE BracketMatches SET NextMatchWin=NULL WHERE BracketId=? AND NextMatchWin IN ($in)")->execute($params);
                    $params = $toDelete; array_unshift($params,$bracketId);
                    $pdo->prepare("UPDATE BracketMatches SET NextMatchLoss=NULL WHERE BracketId=? AND NextMatchLoss IN ($in)")->execute($params);
                    $in = implode(',', array_fill(0,count($toDelete),'?'));
                    $pdo->prepare("DELETE FROM BracketMatches WHERE MatchId IN ($in)")->execute($toDelete);
                    $pdo->prepare("DELETE FROM MatchFighters WHERE MatchId IN ($in)")->execute($toDelete);
                    $pdo->prepare("DELETE FROM Matches WHERE MatchId IN ($in)")->execute($toDelete);
                }
            }
        }

        $pdo->commit();

        // Build response
        $stmtFetch = $pdo->prepare("
            SELECT bm.BracketId, bm.MatchId, bm.BracketNo, bm.NextMatchWin, bm.NextMatchLoss,
                   bm.BracketSection, m.MatchQueueNumber, m.MatchRingNo,
                   mf.FighterId, f.FighterName, f.ClubId
              FROM BracketMatches bm
              JOIN Matches m ON bm.MatchId=m.MatchId
              LEFT JOIN MatchFighters mf ON m.MatchId=mf.MatchId
              LEFT JOIN Fighters f ON mf.FighterId=f.FighterId
             WHERE bm.BracketId=?
             ORDER BY bm.BracketNo, m.MatchId
        ");
        $stmtFetch->execute([$bracketId]);
        $rows = $stmtFetch->fetchAll(PDO::FETCH_ASSOC);

        $rounds = [];
        foreach ($rows as $row) {
            $bno=(int)$row['BracketNo']; $mid=(int)$row['MatchId'];
            if (!isset($rounds[$bno])) $rounds[$bno]=[];
            if (!isset($rounds[$bno][$mid])) {
                $rounds[$bno][$mid]=[
                    "matchId"=>$mid,"bracketNo"=>$bno,"bracketSection"=>$row['BracketSection'],
                    "matchRing"=>$row['MatchRingNo']?(int)$row['MatchRingNo']:null,
                    "matchQueue"=>$row['MatchQueueNumber']?(int)$row['MatchQueueNumber']:null,
                    "nextMatchWin"=>$row['NextMatchWin']?(int)$row['NextMatchWin']:null,
                    "nextMatchLoss"=>$row['NextMatchLoss']?(int)$row['NextMatchLoss']:null,
                    "fighters"=>[]
                ];
            }
            if (!is_null($row['FighterId'])) {
                $rounds[$bno][$mid]["fighters"][]=[
                    "fighterId"=>(int)$row['FighterId'],
                    "fighterName"=>$row['FighterName'],
                    "clubId"=>$row['ClubId']?(int)$row['ClubId']:null
                ];
            }
        }
        foreach ($rounds as $bno=>$map) {
            $rounds[$bno]=array_values($map);
        }

        echo json_encode([
            "status"=>"success","message"=>"Bracket created",
            "bracketId"=>$bracketId,"format"=>"S","hasBronze"=>(bool)$withBronze,"rounds"=>$rounds
        ]);
        exit;
    }

    if ($action==="fetch") {
        $stmt=$pdo->prepare("
            SELECT bm.BracketId,bm.MatchId,bm.BracketNo,bm.NextMatchWin,bm.NextMatchLoss,
                   bm.BracketSection,m.MatchQueueNumber,m.MatchRingNo,
                   mf.FighterId,f.FighterName,f.ClubId,b.BracketFormat
              FROM BracketMatches bm
              JOIN Brackets b ON bm.BracketId=b.BracketId
              JOIN Matches m ON bm.MatchId=m.MatchId
              LEFT JOIN MatchFighters mf ON m.MatchId=mf.MatchId
              LEFT JOIN Fighters f ON mf.FighterId=f.FighterId
             WHERE b.EventId=? ORDER BY bm.BracketNo,m.MatchId
        ");
        $stmt->execute([$eventId]); $rows=$stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) {
            echo json_encode(["status"=>"success","message"=>"No bracket found for event.","rounds"=>[]]);
            exit;
        }
        $rounds=[]; $bracketId=null; $format='S';
        foreach ($rows as $row) {
            $bracketId=(int)$row['BracketId']; $format=$row['BracketFormat']; $bno=(int)$row['BracketNo']; $mid=(int)$row['MatchId'];
            if (!isset($rounds[$bno])) $rounds[$bno]=[];
            if (!isset($rounds[$bno][$mid])) {
                $rounds[$bno][$mid]=[
                    "matchId"=>$mid,"bracketNo"=>$bno,"bracketSection"=>$row['BracketSection'],
                    "matchRing"=>$row['MatchRingNo']?(int)$row['MatchRingNo']:null,
                    "matchQueue"=>$row['MatchQueueNumber']?(int)$row['MatchQueueNumber']:null,
                    "nextMatchWin"=>$row['NextMatchWin']?(int)$row['NextMatchWin']:null,
                    "nextMatchLoss"=>$row['NextMatchLoss']?(int)$row['NextMatchLoss']:null,
                    "fighters"=>[]
                ];
            }
            if (!is_null($row['FighterId'])) {
                $rounds[$bno][$mid]["fighters"][]=[
                    "fighterId"=>(int)$row['FighterId'],
                    "fighterName"=>$row['FighterName'],
                    "clubId"=>$row['ClubId']?(int)$row['ClubId']:null
                ];
            }
        }
        foreach ($rounds as $bno=>$map) {
            $rounds[$bno]=array_values($map);
        }
        echo json_encode(["status"=>"success","bracketId"=>$bracketId,"format"=>$format,"rounds"=>$rounds]);
        exit;
    }

    echo json_encode(["status"=>"error","message"=>"Unknown action"]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(["status"=>"error","message"=>$e->getMessage()]);
}