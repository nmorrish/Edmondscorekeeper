<?php
/**
 * phpFiles/tournamentFightersApi.php
 *
 * === Tournament Fighters CRUD ===
 * Handles the relationship between Fighters and Tournaments, including strikes.
 *
 * Supported routes:
 *  - GET    /tournamentFightersApi.php?tournamentId=1
 *        → { status:"success", fighters:[...] }
 *
 *  - POST   /tournamentFightersApi.php
 *        body: { "tournamentId":1, "fighterId":5 }
 *
 *  - PUT    /tournamentFightersApi.php
 *        body: { "tournamentId":1, "fighterId":5, "action":"incrementStrike" }
 *
 *  - DELETE /tournamentFightersApi.php?tournamentId=1&fighterId=5
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method       = $_SERVER['REQUEST_METHOD'];
$tournamentId = isset($_GET['tournamentId']) ? (int)$_GET['tournamentId'] : null;
$fighterId    = isset($_GET['fighterId']) ? (int)$_GET['fighterId'] : null;

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$input = null;
if (in_array($method, ['POST', 'PUT'])) {
    $input = json_decode(file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
        exit;
    }
}

try {
    switch ($method) {
        case 'GET':
            if (!$tournamentId) {
                throw new Exception("tournamentId is required");
            }

            $stmt = $db->prepare("
                SELECT 
                    f.FighterId,
                    f.FighterName,
                    f.ClubId,
                    c.ClubName,
                    c.ClubAcronym,
                    tf.Strikes
                FROM TournamentFighters tf
                JOIN Fighters f ON tf.FighterId = f.FighterId
                LEFT JOIN Clubs c ON f.ClubId = c.ClubId
                WHERE tf.TournamentId = :tid
                ORDER BY f.FighterName
            ");
            $stmt->execute([':tid' => $tournamentId]);
            $fighters = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['status' => 'success', 'fighters' => $fighters]);
            break;

        case 'POST':
            $tournamentId = $input['tournamentId'] ?? null;
            $fighterId    = $input['fighterId'] ?? null;
            if (!$tournamentId || !$fighterId) {
                throw new Exception("tournamentId and fighterId are required");
            }

            $stmt = $db->prepare("
                INSERT INTO TournamentFighters (TournamentId, FighterId, Strikes)
                VALUES (:tid, :fid, 0)
                ON DUPLICATE KEY UPDATE TournamentId = TournamentId
            ");
            $stmt->execute([':tid' => $tournamentId, ':fid' => $fighterId]);

            echo json_encode(['status' => 'success', 'message' => 'Fighter added to tournament']);
            break;

        case 'PUT':
            $tournamentId = $input['tournamentId'] ?? null;
            $fighterId    = $input['fighterId'] ?? null;
            $action       = $input['action'] ?? null;

            if (!$tournamentId || !$fighterId || !$action) {
                throw new Exception("tournamentId, fighterId, and action are required");
            }

            if ($action === 'incrementStrike') {
                $stmt = $db->prepare("
                    UPDATE TournamentFighters
                    SET Strikes = COALESCE(Strikes, 0) + 1
                    WHERE TournamentId = :tid AND FighterId = :fid
                ");
                $stmt->execute([':tid' => $tournamentId, ':fid' => $fighterId]);

                // fetch updated strikes + fighterName
                $stmt = $db->prepare("
                    SELECT f.FighterName, tf.Strikes
                    FROM TournamentFighters tf
                    JOIN Fighters f ON tf.FighterId = f.FighterId
                    WHERE tf.TournamentId = :tid AND tf.FighterId = :fid
                ");
                $stmt->execute([':tid' => $tournamentId, ':fid' => $fighterId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                echo json_encode([
                    'status' => 'success',
                    'fighterName' => $row['FighterName'],
                    'strikes' => (int)$row['Strikes']
                ]);
            } else {
                throw new Exception("Unsupported action: $action");
            }
            break;

        case 'DELETE': // Remove fighter from tournament
            if (!isset($_GET['tournamentId'], $_GET['fighterId'])) {
                throw new Exception("Missing tournamentId or fighterId.");
            }

            $tournamentId = (int)$_GET['tournamentId'];
            $fighterId    = (int)$_GET['fighterId'];

            $db->beginTransaction();

            try {
                // 1) Remove fighter from TournamentFighters
                $stmt = $db->prepare("DELETE FROM TournamentFighters WHERE TournamentId = ? AND FighterId = ?");
                $stmt->execute([$tournamentId, $fighterId]);

                // 2) Find all events in this tournament
                $stmt = $db->prepare("SELECT EventId FROM Events WHERE TournamentId = ?");
                $stmt->execute([$tournamentId]);
                $events = $stmt->fetchAll(PDO::FETCH_COLUMN);

                if ($events) {
                    // 3) Remove fighter from EventFighters
                    $inClause = implode(',', array_fill(0, count($events), '?'));
                    $params   = array_merge([$fighterId], $events);

                    $stmt = $db->prepare("DELETE FROM EventFighters WHERE FighterId = ? AND EventId IN ($inClause)");
                    $stmt->execute($params);

                    // 4) Delete all pending matches for this fighter in those events
                    $stmt = $db->prepare("
                        DELETE m
                        FROM Matches m
                        JOIN MatchFighters mf ON m.MatchId = mf.MatchId
                        WHERE mf.FighterId = ?
                        AND m.EventId IN ($inClause)
                        AND m.PendingActiveDone = 'P'
                    ");
                    $stmt->execute($params);
                }

                $db->commit();

                echo json_encode([
                    "status" => "success",
                    "message" => "Fighter removed from tournament, events, and pending matches cleared.",
                    "tournamentId" => $tournamentId,
                    "fighterId" => $fighterId
                ]);
            } catch (Exception $e) {
                $db->rollBack();
                throw $e;
            }
            break;


        default:
            http_response_code(405);
            echo json_encode(['status' => 'error', 'message' => 'Unsupported HTTP method']);
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}
