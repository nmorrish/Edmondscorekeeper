<?php
/**
 * phpFiles/matchesApi.php
 *
 * === Matches CRUD (with fighters + scores) ===
 * Returns Matches with an embedded fighters array:
 *   fighters: [
 *     { FighterId, FighterName, ClubAcronym, FighterColor, FinalScore, Scores: [...] }
 *   ]
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method     = $_SERVER['REQUEST_METHOD'];
$id         = isset($_GET['id']) ? (int)$_GET['id'] : null;
$eventId    = isset($_GET['eventId']) ? (int)$_GET['eventId'] : null;
$tournament = isset($_GET['tournamentId']) ? (int)$_GET['tournamentId'] : null;
$ringNo     = isset($_GET['matchRing']) ? (int)$_GET['matchRing'] : null;

// Short-circuit OPTIONS preflight
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// helper: attach fighters and their scores
function attachFightersAndScores($db, $match) {
    $stmt = $db->prepare("
        SELECT 
            mf.MatchFighterId,
            mf.FighterId,
            f.FighterName,
            c.ClubAcronym,
            mf.FighterColor,
            mf.FinalScore
        FROM MatchFighters mf
        JOIN Fighters f ON mf.FighterId = f.FighterId
        LEFT JOIN Clubs c ON f.ClubId = c.ClubId
        WHERE mf.MatchId = ?
        ORDER BY mf.MatchFighterId ASC
    ");
    $stmt->execute([$match['MatchId']]);
    $fighters = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($fighters as &$f) {
        $scoresStmt = $db->prepare("
            SELECT 
                es.ExchangeScoresId AS scoreId,
                e.ExchangeId,
                e.ExchangeTimeStamp,
                es.JudgeName,
                es.Contact,
                es.Target,
                es.Control,
                es.DoubleHit,
                es.AfterBlow,
                es.OpponentSelfCall,
                es.ScoreTimeStamp
            FROM Exchanges e
            JOIN ExchangeScores es ON es.ExchangeId = e.ExchangeId
            WHERE e.MatchFighterId = ?
            ORDER BY es.ExchangeScoresId ASC
        ");
        $scoresStmt->execute([$f['MatchFighterId']]);
        $f['Scores'] = $scoresStmt->fetchAll(PDO::FETCH_ASSOC);
    }

    $match['fighters'] = $fighters;
    return $match;
}

try {
    switch ($method) {
        case 'GET':
            if ($id) {
                $stmt = $db->prepare("
                    SELECT m.*, e.EventName
                    FROM Matches m
                    JOIN Events e ON m.EventId = e.EventId
                    WHERE m.MatchId = ?
                ");
                $stmt->execute([$id]);
                $match = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($match) {
                    $match = attachFightersAndScores($db, $match);
                    echo json_encode(['status' => 'success', 'match' => $match]);
                } else {
                    echo json_encode(['status' => 'error', 'message' => 'Match not found']);
                }
            } elseif ($eventId) {
                $query = "
                    SELECT m.*, e.EventName
                    FROM Matches m
                    JOIN Events e ON m.EventId = e.EventId
                    WHERE m.EventId = :eventId
                ";
                $params = [':eventId' => $eventId];

                if ($ringNo) {
                    $query .= " AND m.MatchRingNo = :ringNo";
                    $params[':ringNo'] = $ringNo;
                }

                $query .= " ORDER BY m.MatchId DESC";

                $stmt = $db->prepare($query);
                $stmt->execute($params);
                $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $withFighters = [];
                foreach ($matches as $m) {
                    $withFighters[] = attachFightersAndScores($db, $m);
                }

                echo json_encode(['status' => 'success', 'matches' => $withFighters]);

            } elseif (isset($_GET['eventId']) && isset($_GET['rings'])) {
                $eventId = (int)$_GET['eventId'];
                $stmt = $db->prepare("
                    SELECT DISTINCT MatchRingNo
                    FROM Matches
                    WHERE EventId = ?
                    ORDER BY MatchRingNo ASC
                ");
                $stmt->execute([$eventId]);
                $rings = $stmt->fetchAll(PDO::FETCH_COLUMN);

                echo json_encode(['status' => 'success', 'rings' => array_map('intval', $rings)]);
                break;

            } else {
                $stmt = $db->query("
                    SELECT m.*, e.EventName
                    FROM Matches m
                    JOIN Events e ON m.EventId = e.EventId
                    ORDER BY m.MatchId DESC
                ");
                $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $withFighters = [];
                foreach ($matches as $m) {
                    $withFighters[] = attachFightersAndScores($db, $m);
                }

                echo json_encode(['status' => 'success', 'matches' => $withFighters]);
            }
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) throw new Exception("Invalid JSON");

            $eventId = $input['eventId'] ?? null;
            $ring    = $input['ring'] ?? null;
            $status  = $input['status'] ?? 'P';

            if (!$eventId || !$ring) {
                throw new Exception("eventId and ring are required");
            }

            $stmt = $db->prepare("
                INSERT INTO Matches (EventId, MatchRingNo, PendingActiveDone, lastMatchJudgement)
                VALUES (:eventId, :ring, :status, CURRENT_TIMESTAMP)
            ");
            $stmt->execute([
                ':eventId' => $eventId,
                ':ring'    => $ring,
                ':status'  => $status
            ]);

            echo json_encode([
                'status'  => 'success',
                'matchId' => (int)$db->lastInsertId()
            ]);
            break;

        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) throw new Exception("Invalid JSON");

            // Fighter update
            if (isset($input['fighterId'], $input['fighterColor'])) {
                if (!$id) throw new Exception("matchId is required for fighter update");

                $stmt = $db->prepare("
                    UPDATE MatchFighters
                    SET FighterId = :fighterId
                    WHERE MatchId = :matchId AND FighterColor = :fighterColor
                ");
                $stmt->execute([
                    ':fighterId'    => (int)$input['fighterId'],
                    ':matchId'      => $id,
                    ':fighterColor' => $input['fighterColor']
                ]);

                echo json_encode([
                    'status' => 'success',
                    'updated' => 'fighter',
                    'matchId' => $id
                ]);
                break;
            }

            // === Activate match, set PendingActiveDone = 'A' if not already ===
            if (($input['action'] ?? null) === 'activate') {
                if (!$id) throw new Exception("matchId required");

                try {
                    $db->beginTransaction();

                    // Find the ring for this match
                    $stmt = $db->prepare("SELECT MatchRingNo FROM Matches WHERE MatchId = ?");
                    $stmt->execute([$id]);
                    $ringNo = $stmt->fetchColumn();

                    if (!$ringNo) {
                        throw new Exception("Ring not found for this match");
                    }

                    // Mark other active matches in the same ring as Done
                    $stmt = $db->prepare("
                        UPDATE Matches
                        SET PendingActiveDone = 'D'
                        WHERE MatchRingNo = ? AND MatchId <> ? AND PendingActiveDone = 'A'
                    ");
                    $stmt->execute([$ringNo, $id]);

                    // Activate this match (if not already active)
                    $stmt = $db->prepare("
                        UPDATE Matches
                        SET PendingActiveDone = 'A'
                        WHERE MatchId = ? AND PendingActiveDone <> 'A'
                    ");
                    $stmt->execute([$id]);

                    $db->commit();

                    echo json_encode([
                        'status'  => 'success',
                        'updated' => 'activate',
                        'matchId' => $id
                    ]);
                } catch (Exception $e) {
                    if ($db->inTransaction()) $db->rollBack();
                    throw $e;
                }
                break;
            }

            // === Stop timer, update timestamp + insert Exchanges ===
            if (($input['action'] ?? null) === 'judgement') {
                if (!$id) throw new Exception("matchId required");

                try {
                    $db->beginTransaction();

                    // Update Matches
                    $db->prepare("
                        UPDATE Matches 
                        SET lastMatchJudgement = CURRENT_TIMESTAMP 
                        WHERE MatchId = ?
                    ")->execute([$id]);

                    // Insert one exchange per fighter
                    $stmt = $db->prepare("SELECT MatchFighterId FROM MatchFighters WHERE MatchId = ?");
                    $stmt->execute([$id]);
                    $fighters = $stmt->fetchAll(PDO::FETCH_COLUMN);

                    $ins = $db->prepare("INSERT INTO Exchanges (MatchFighterId, ExchangeTimeStamp) VALUES (?, CURRENT_TIMESTAMP)");
                    foreach ($fighters as $mfid) {
                        $ins->execute([$mfid]);
                    }

                    $db->commit();
                    echo json_encode([
                        'status'  => 'success',
                        'updated' => 'judgement',
                        'matchId' => $id,
                        'exchangesCreated' => count($fighters)
                    ]);
                } catch (Exception $e) {
                    if ($db->inTransaction()) $db->rollBack();
                    throw $e;
                }
                break;
            }

            // === Refresh judgement → only update timestamp ===
            if (($input['action'] ?? null) === 'refreshJudgement') {
                if (!$id) throw new Exception("matchId required");
                $db->prepare("
                    UPDATE Matches 
                    SET lastMatchJudgement = CURRENT_TIMESTAMP 
                    WHERE MatchId = ?
                ")->execute([$id]);

                echo json_encode([
                    'status'  => 'success',
                    'updated' => 'refreshJudgement',
                    'matchId' => $id
                ]);
                break;
            }

            // Complete
            if (($input['action'] ?? null) === 'complete') {
                if (!$id) throw new Exception("matchId required");
                $db->prepare("UPDATE Matches SET PendingActiveDone='D' WHERE MatchId=?")
                   ->execute([$id]);
                echo json_encode(['status' => 'success','updated'=>'complete','matchId'=>$id]);
                break;
            }

            // Pending
            if (($input['action'] ?? null) === 'pending') {
                if (!$id) throw new Exception("matchId required");
                $db->prepare("UPDATE Matches SET PendingActiveDone='P' WHERE MatchId=?")
                   ->execute([$id]);
                echo json_encode(['status' => 'success','updated'=>'pending','matchId'=>$id]);
                break;
            }

            // Swap
            if (($input['action'] ?? null) === 'swap') {
                if (!$id) throw new Exception("matchId required for swap");

                $db->beginTransaction();
                $fighters = $db->prepare("SELECT FighterId,FighterColor FROM MatchFighters WHERE MatchId=?");
                $fighters->execute([$id]);
                $rows = $fighters->fetchAll(PDO::FETCH_ASSOC);

                if (count($rows) !== 2) throw new Exception("Swap requires 2 fighters");

                $red = null; $blue = null;
                foreach ($rows as $r) {
                    if ($r['FighterColor']==='Red') $red=$r['FighterId'];
                    if ($r['FighterColor']==='Blue') $blue=$r['FighterId'];
                }
                if (!$red || !$blue) throw new Exception("Missing Red/Blue fighter");

                $stmt = $db->prepare("UPDATE MatchFighters SET FighterId=? WHERE MatchId=? AND FighterColor=?");
                $stmt->execute([$blue,$id,'Red']);
                $stmt->execute([$red,$id,'Blue']);

                $db->commit();
                echo json_encode(['status'=>'success','updated'=>'swap','matchId'=>$id]);
                break;
            }

            // Ring change
            if (isset($input['ringNo'])) {
                $db->prepare("UPDATE Matches SET MatchRingNo=? WHERE MatchId=?")
                   ->execute([(int)$input['ringNo'],$id]);
                echo json_encode(['status'=>'success','updated'=>'ring','matchId'=>$id,'ring'=>(int)$input['ringNo']]);
                break;
            }

            // Default: full match update
            if (!$id) throw new Exception("id required");
            $stmt = $db->prepare("
                UPDATE Matches
                SET EventId=:eventId, MatchRingNo=:ring, PendingActiveDone=:status
                WHERE MatchId=:id
            ");
            $stmt->execute([
                ':eventId'=>$input['eventId']??null,
                ':ring'=>$input['ring']??null,
                ':status'=>$input['status']??'P',
                ':id'=>$id
            ]);
            echo json_encode(['status'=>'success','updated'=>'match','id'=>$id]);
            break;

        case 'DELETE':
            if (!$id) throw new Exception("id required for delete");
            $db->prepare("DELETE FROM Matches WHERE MatchId=?")->execute([$id]);
            echo json_encode(['status'=>'success','deletedId'=>$id]);
            break;

        default:
            echo json_encode(['status'=>'error','message'=>'Unsupported method']);
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} finally {
    $db = null;
}
