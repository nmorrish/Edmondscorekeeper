<?php
/**
 * phpFiles/fighterApi.php
 *
 * === Fighters CRUD ===
 * Frontend sends lowercase JSON keys:
 *   { fighterName, clubId, fighterPortrait }
 *
 * - API maps to DB fields: FighterName, ClubId, FighterPortrait
 * - Responses wrap in { status, ... }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . "/connect.php";
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$tournamentId = isset($_GET['tournamentId']) ? (int)$_GET['tournamentId'] : null;

// Short-circuit OPTIONS preflight
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    switch ($method) {
        case 'GET':
            if ($id) {
                // Single fighter by ID
                $stmt = $db->prepare("
                    SELECT 
                        FighterId   AS fighterId,
                        ClubId      AS clubId,
                        FighterName AS fighterName,
                        FighterPortrait AS fighterPortrait
                    FROM Fighters 
                    WHERE FighterId = :id
                ");
                $stmt->execute([':id' => $id]);
                $fighter = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($fighter) {
                    echo json_encode(['status' => 'success', 'fighter' => $fighter]);
                } else {
                    echo json_encode(['status' => 'error', 'message' => 'Fighter not found']);
                }
            } elseif ($tournamentId) {
                // Fighters for a specific tournament
                $stmt = $db->prepare("
                SELECT 
                    f.FighterId   AS fighterId,
                    f.ClubId      AS clubId,
                    f.FighterName AS fighterName,
                    f.FighterPortrait AS fighterPortrait,
                    tf.TournamentId AS tournamentId,
                    tf.TournamentFighterId AS tournamentFighterId,
                    c.ClubName    AS clubName,
                    c.ClubAcronym AS clubAcronym
                FROM Fighters f
                INNER JOIN TournamentFighters tf 
                    ON tf.FighterId = f.FighterId
                LEFT JOIN Clubs c
                    ON f.ClubId = c.ClubId
                WHERE tf.TournamentId = :tid
                ORDER BY f.FighterName ASC
            ");
                $stmt->execute([':tid' => $tournamentId]);
                $fighters = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Attach cards per fighter (cards replace the old strike system).
                // Single query for all cards in the tournament, grouped in PHP by TournamentFighterId.
                if ($fighters) {
                    $cardStmt = $db->prepare("
                        SELECT
                            fc.TournamentFighterId,
                            fc.FighterCardId,
                            fc.CardableOffenseId,
                            co.OffenseName,
                            fc.Severity,
                            fc.Reason,
                            fc.IssuedAt
                        FROM FighterCards fc
                        JOIN TournamentFighters tf ON fc.TournamentFighterId = tf.TournamentFighterId
                        JOIN CardableOffenses co ON fc.CardableOffenseId = co.CardableOffenseId
                        WHERE tf.TournamentId = :tid
                        ORDER BY fc.IssuedAt ASC, fc.FighterCardId ASC
                    ");
                    $cardStmt->execute([':tid' => $tournamentId]);

                    $cardsByTf = [];
                    foreach ($cardStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                        $cardsByTf[(int)$r['TournamentFighterId']][] = [
                            'fighterCardId'     => (int)$r['FighterCardId'],
                            'cardableOffenseId' => (int)$r['CardableOffenseId'],
                            'offenseName'       => $r['OffenseName'],
                            'severity'          => $r['Severity'],
                            'reason'            => $r['Reason'],
                            'issuedAt'          => $r['IssuedAt'],
                        ];
                    }

                    foreach ($fighters as &$f) {
                        $f['cards'] = $cardsByTf[(int)$f['tournamentFighterId']] ?? [];
                    }
                    unset($f);
                }

                echo json_encode(['status' => 'success', 'fighters' => $fighters]);
            } else {
                // All fighters
                $stmt = $db->query("
                    SELECT 
                        FighterId   AS fighterId,
                        ClubId      AS clubId,
                        FighterName AS fighterName,
                        FighterPortrait AS fighterPortrait
                    FROM Fighters
                    ORDER BY FighterName ASC
                ");
                echo json_encode(['status' => 'success', 'fighters' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            }
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) throw new Exception("Invalid JSON");

            $fighterName = trim((string)($input['fighterName'] ?? ''));
            if ($fighterName === '') throw new Exception("fighterName is required");

            $clubId = $input['clubId'] ?? null;
            $portrait = $input['fighterPortrait'] ?? null;

            $stmt = $db->prepare("
                INSERT INTO Fighters (ClubId, FighterName, FighterPortrait) 
                VALUES (:clubId, :fighterName, :portrait)
            ");
            $stmt->execute([
                ':clubId'      => $clubId,
                ':fighterName' => $fighterName,
                ':portrait'    => $portrait,
            ]);
            echo json_encode(['status' => 'success', 'fighterId' => (int)$db->lastInsertId()]);
            break;

        case 'PUT':
            if (!$id) throw new Exception("id is required");
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) throw new Exception("Invalid JSON");

            $fields = [];
            $params = [':id' => $id];

            if (array_key_exists('clubId', $input)) {
                $fields[] = "ClubId = :clubId";
                $params[':clubId'] = $input['clubId'];
            }
            if (array_key_exists('fighterName', $input)) {
                $fields[] = "FighterName = :fighterName";
                $params[':fighterName'] = $input['fighterName'];
            }
            if (array_key_exists('fighterPortrait', $input)) {
                $fields[] = "FighterPortrait = :portrait";
                $params[':portrait'] = $input['fighterPortrait'];
            }

            if (empty($fields)) throw new Exception("No fields to update");

            $sql = "UPDATE Fighters SET " . implode(", ", $fields) . " WHERE FighterId = :id";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            echo json_encode(['status' => 'success', 'updatedId' => $id]);
            break;

        case 'DELETE':
            if (!$id) throw new Exception("id is required");

            $chk = $db->prepare("SELECT FighterId FROM Fighters WHERE FighterId = :id");
            $chk->execute([':id' => $id]);
            if (!$chk->fetch()) throw new Exception("Fighter not found");

            $stmt = $db->prepare("DELETE FROM Fighters WHERE FighterId = :id");
            $stmt->execute([':id' => $id]);

            echo json_encode(['status' => 'success', 'deletedId' => $id]);
            break;

        default:
            echo json_encode(['status' => 'error', 'message' => 'Unsupported HTTP method']);
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}
