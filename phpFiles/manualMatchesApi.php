<?php
/**
 * manualMatchesApi.php
 *
 * REST API for manually matching fighters.
 * Tables involved: Matches + MatchFighters
 *
 * Supported routes:
 *  - GET    /manualMatchesApi.php?eventId=5
 *        → { status:"success", matches:[...] }
 *
 *  - POST   /manualMatchesApi.php
 *        body: { "eventId":5, "ring":1,
 *                "fighter1":11,"colorFighter1":"Red",
 *                "fighter2":12,"colorFighter2":"Blue" }
 *
 *  - DELETE /manualMatchesApi.php?id=123
 *        → Deletes match + attached MatchFighters
 *
 *  - PUT    /manualMatchesApi.php?id=123
 *        body: { "status":"A" } // or update fighters/colors
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : null;

// Preflight CORS
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    switch ($method) {
        case 'GET':
            // Get all matches for an event
            if (!$eventId) {
                throw new Exception("eventId is required for GET");
            }

            $stmt = $db->prepare("
                SELECT m.MatchId, m.EventId, m.MatchRingNo, m.PendingActiveDone, m.lastMatchJudgement
                FROM Matches m
                WHERE m.EventId = ?
                ORDER BY m.MatchId DESC
            ");
            $stmt->execute([$eventId]);
            $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Attach fighters
            foreach ($matches as &$match) {
                $mf = $db->prepare("
                    SELECT mf.MatchFighterId, mf.FighterId, f.FighterName, mf.FighterColor,
                           mf.FinalScore, mf.ScoreModifier, mf.WinLossDraw, mf.lastJudgement
                    FROM MatchFighters mf
                    JOIN Fighters f ON f.FighterId = mf.FighterId
                    WHERE mf.MatchId = ?
                    ORDER BY mf.FighterColor
                ");
                $mf->execute([$match['MatchId']]);
                $match['fighters'] = $mf->fetchAll(PDO::FETCH_ASSOC);
            }

            echo json_encode(['status'=>'success','matches'=>$matches]);
            break;

        case 'POST': {
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception("Invalid JSON");
            }

            $eventId       = $input['eventId'] ?? null;
            $ring          = $input['ring'] ?? null;
            $fighter1      = $input['fighter1'] ?? null;
            $color1        = $input['colorFighter1'] ?? null;
            $fighter2      = $input['fighter2'] ?? null;
            $color2        = $input['colorFighter2'] ?? null;

            if (!$eventId || !$ring || !$fighter1 || !$fighter2 || !$color1 || !$color2) {
                throw new Exception("Missing required fields");
            }

            $db->beginTransaction();

            // Insert match
            $stmt = $db->prepare("
                INSERT INTO Matches (EventId, MatchRingNo, PendingActiveDone, lastMatchJudgement)
                VALUES (:eid, :ring, 'P', CURRENT_TIMESTAMP)
            ");
            $stmt->execute([':eid'=>$eventId, ':ring'=>$ring]);
            $matchId = $db->lastInsertId();

            // Insert fighters
            $stmtF = $db->prepare("
                INSERT INTO MatchFighters (MatchId, FighterId, FighterColor)
                VALUES (:mid,:fid,:color)
            ");
            $stmtF->execute([':mid'=>$matchId, ':fid'=>$fighter1, ':color'=>$color1]);
            $stmtF->execute([':mid'=>$matchId, ':fid'=>$fighter2, ':color'=>$color2]);

            $db->commit();

            echo json_encode(['status'=>'success','matchId'=>(int)$matchId]);
            break;
        }

        case 'PUT': {
            if (!$id) throw new Exception("Match ID required for PUT");
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception("Invalid JSON");
            }

            // Update status
            if (isset($input['status'])) {
                $stmt = $db->prepare("
                    UPDATE Matches
                    SET PendingActiveDone = :s, lastMatchJudgement = CURRENT_TIMESTAMP
                    WHERE MatchId = :id
                ");
                $stmt->execute([':s'=>$input['status'], ':id'=>$id]);
            }

            // Update fighters (optional)
            if (isset($input['fighters']) && is_array($input['fighters'])) {
                foreach ($input['fighters'] as $f) {
                    $stmt = $db->prepare("
                        UPDATE MatchFighters
                        SET FighterId = :fid, FighterColor = :color
                        WHERE MatchFighterId = :mfid
                    ");
                    $stmt->execute([
                        ':fid'=>$f['fighterId'],
                        ':color'=>$f['color'],
                        ':mfid'=>$f['matchFighterId']
                    ]);
                }
            }

            echo json_encode(['status'=>'success']);
            break;
        }

        case 'DELETE': {
            if (!$id) throw new Exception("Match ID required for DELETE");

            $db->beginTransaction();
            $stmt = $db->prepare("DELETE FROM MatchFighters WHERE MatchId=?");
            $stmt->execute([$id]);
            $stmt = $db->prepare("DELETE FROM Matches WHERE MatchId=?");
            $stmt->execute([$id]);
            $db->commit();

            echo json_encode(['status'=>'success']);
            break;
        }

        default:
            echo json_encode(['status'=>'error','message'=>'Unsupported method']);
    }
} catch (Exception $e) {
    if ($db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>$e->getMessage()]);
} finally {
    $db = null;
}
