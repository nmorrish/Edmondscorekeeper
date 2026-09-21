<?php
/**
 * phpFiles/fighterCardsApi.php
 *
 * === Fighter Cards API ===
 * Cards replace the old strike system. A card records a cardable offense
 * issued to a fighter within a tournament, with a judge-discretion severity
 * (Yellow/Red/Black) and an optional reason.
 *
 * Cards are scoped to a fighter-in-a-tournament via TournamentFighterId
 * (the surrogate key on TournamentFighters). Clients address fighters using
 * fighterId + tournamentId — consistent with every other endpoint — and this
 * API resolves the TournamentFighterId internally, creating the
 * TournamentFighters row if it does not yet exist.
 *
 * Supported routes:
 *  - GET    /fighterCardsApi.php?tournamentId=1
 *        -> All cards for every fighter in the tournament
 *          { status:"success", cards:[ { fighterId, tournamentId, ...card } ] }
 *
 *  - GET    /fighterCardsApi.php?tournamentId=1&fighterId=5
 *        -> All cards for a single fighter in the tournament
 *          { status:"success", cards:[ {...card} ] }
 *
 *  - GET    /fighterCardsApi.php?resource=offenses
 *        -> All cardable offenses in the catalog
 *          { status:"success", offenses:[ { cardableOffenseId, offenseName, offenseDescription } ] }
 *
 * 
 *  - POST   /fighterCardsApi.php
 *        body: { tournamentId, fighterId, cardableOffenseId, severity, reason? }
 *        -> Issues a card. Resolves/creates TournamentFighterId as needed.
 *          { status:"success", fighterCardId }
 *
 *  - DELETE /fighterCardsApi.php?fighterCardId=12
 *        -> Rescinds a single card.
 *          { status:"success", deletedId }
 *
 * Card object shape (as returned in the cards array):
 * {
 *   fighterCardId, cardableOffenseId, offenseName,
 *   severity, reason, issuedAt
 * }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];

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

/**
 * Resolve the TournamentFighterId for a fighter/tournament pair,
 * creating the TournamentFighters row if it does not exist.
 */
function resolveTournamentFighterId(PDO $db, int $tournamentId, int $fighterId): int {
    $stmt = $db->prepare("
        SELECT TournamentFighterId
        FROM TournamentFighters
        WHERE TournamentId = :tid AND FighterId = :fid
        LIMIT 1
    ");
    $stmt->execute([':tid' => $tournamentId, ':fid' => $fighterId]);
    $id = $stmt->fetchColumn();
    if ($id) return (int)$id;

    $stmt = $db->prepare("
        INSERT INTO TournamentFighters (FighterId, TournamentId)
        VALUES (:fid, :tid)
    ");
    $stmt->execute([':fid' => $fighterId, ':tid' => $tournamentId]);
    return (int)$db->lastInsertId();
}

try {
        switch ($method) {
            case 'GET':
            // Offense catalog lookup (no tournament scope)
            if (($_GET['resource'] ?? null) === 'offenses') {
                $stmt = $db->query("
                    SELECT CardableOffenseId, OffenseName, OffenseDescription
                    FROM CardableOffenses
                    ORDER BY OffenseName ASC
                ");
                $offenses = array_map(fn($r) => [
                    'cardableOffenseId'  => (int)$r['CardableOffenseId'],
                    'offenseName'        => $r['OffenseName'],
                    'offenseDescription' => $r['OffenseDescription'],
                ], $stmt->fetchAll(PDO::FETCH_ASSOC));

                echo json_encode(['status' => 'success', 'offenses' => $offenses]);
                break;
            }

            $tournamentId = isset($_GET['tournamentId']) ? (int)$_GET['tournamentId'] : null;
            $fighterId    = isset($_GET['fighterId']) ? (int)$_GET['fighterId'] : null;

            if (!$tournamentId) {
                throw new Exception("tournamentId is required");
            }

            if ($fighterId) {
                // Cards for a single fighter in this tournament
                $stmt = $db->prepare("
                    SELECT
                        fc.FighterCardId,
                        fc.CardableOffenseId,
                        co.OffenseName,
                        fc.Severity,
                        fc.Reason,
                        fc.IssuedAt
                    FROM FighterCards fc
                    JOIN TournamentFighters tf ON fc.TournamentFighterId = tf.TournamentFighterId
                    JOIN CardableOffenses co ON fc.CardableOffenseId = co.CardableOffenseId
                    WHERE tf.TournamentId = :tid AND tf.FighterId = :fid
                    ORDER BY fc.IssuedAt ASC, fc.FighterCardId ASC
                ");
                $stmt->execute([':tid' => $tournamentId, ':fid' => $fighterId]);
            } else {
                // All cards for every fighter in the tournament
                $stmt = $db->prepare("
                    SELECT
                        tf.FighterId,
                        tf.TournamentId,
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
                    ORDER BY tf.FighterId ASC, fc.IssuedAt ASC, fc.FighterCardId ASC
                ");
                $stmt->execute([':tid' => $tournamentId]);
            }

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $cards = array_map(fn($r) => array_merge(
                // fighter identifiers only present on the tournament-wide query
                isset($r['FighterId']) ? [
                    'fighterId'    => (int)$r['FighterId'],
                    'tournamentId' => (int)$r['TournamentId'],
                ] : [],
                [
                    'fighterCardId'     => (int)$r['FighterCardId'],
                    'cardableOffenseId' => (int)$r['CardableOffenseId'],
                    'offenseName'       => $r['OffenseName'],
                    'severity'          => $r['Severity'],
                    'reason'            => $r['Reason'],
                    'issuedAt'          => $r['IssuedAt'],
                ]
            ), $rows);

            echo json_encode(['status' => 'success', 'cards' => $cards]);
            break;

        case 'POST':
            $tournamentId      = $input['tournamentId'] ?? null;
            $fighterId         = $input['fighterId'] ?? null;
            $cardableOffenseId = $input['cardableOffenseId'] ?? null;
            $severity          = $input['severity'] ?? null;
            $reason            = $input['reason'] ?? null;

            if (!$tournamentId || !$fighterId || !$cardableOffenseId || !$severity) {
                throw new Exception("tournamentId, fighterId, cardableOffenseId, and severity are required");
            }

            if (!in_array($severity, ['Yellow', 'Red', 'Black'], true)) {
                throw new Exception("severity must be one of: Yellow, Red, Black");
            }

            $db->beginTransaction();
            try {
                $tournamentFighterId = resolveTournamentFighterId($db, (int)$tournamentId, (int)$fighterId);

                $stmt = $db->prepare("
                    INSERT INTO FighterCards
                        (TournamentFighterId, CardableOffenseId, Severity, Reason)
                    VALUES
                        (:tfid, :offenseId, :severity, :reason)
                ");
                $stmt->execute([
                    ':tfid'      => $tournamentFighterId,
                    ':offenseId' => (int)$cardableOffenseId,
                    ':severity'  => $severity,
                    ':reason'    => $reason,
                ]);

                $fighterCardId = (int)$db->lastInsertId();
                $db->commit();

                echo json_encode(['status' => 'success', 'fighterCardId' => $fighterCardId]);
            } catch (Exception $e) {
                $db->rollBack();
                throw $e;
            }
            break;

        case 'DELETE':
            $fighterCardId = isset($_GET['fighterCardId']) ? (int)$_GET['fighterCardId'] : null;
            if (!$fighterCardId) {
                throw new Exception("fighterCardId is required");
            }

            $stmt = $db->prepare("DELETE FROM FighterCards WHERE FighterCardId = :id");
            $stmt->execute([':id' => $fighterCardId]);

            echo json_encode(['status' => 'success', 'deletedId' => $fighterCardId]);
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