<?php
/**
 * phpFiles/eventFightersApi.php
 *
 * API handler for managing fighters in events.
 * - GET: List fighters in an event
 * - POST: Add fighter to event (and tournament if needed)
 * - DELETE: Remove fighter from event
 * - Removal from event does NOT remove from tournament
 */

require_once("connect.php");
header('Content-Type: application/json');

// Handle preflight (CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true);
$response = [];

try {
    $db = connect();

    switch ($method) {
        case 'GET': // List fighters in event
            if (!isset($_GET['eventId'])) {
                throw new Exception("Missing eventId.");
            }

            $eventId = (int)$_GET['eventId'];

            $stmt = $db->prepare("
                SELECT f.FighterId, f.FighterName, f.ClubId, c.ClubName, c.ClubAcronym
                FROM EventFighters ef
                JOIN Fighters f ON f.FighterId = ef.FighterId
                LEFT JOIN Clubs c ON f.ClubId = c.ClubId
                WHERE ef.EventId = ?
                ORDER BY f.FighterName ASC
            ");
            $stmt->execute([$eventId]);
            $fighters = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $response = ["status" => "success", "fighters" => $fighters];
            break;

        case 'POST': // Add fighter to event
            if (!isset($data['eventId'], $data['fighterId'])) {
                throw new Exception("Missing eventId or fighterId.");
            }

            $eventId    = (int)$data['eventId'];
            $fighterId  = (int)$data['fighterId'];

            // 1) Get TournamentId for event
            $stmt = $db->prepare("SELECT TournamentId FROM Events WHERE EventId = ?");
            $stmt->execute([$eventId]);
            $tournamentId = $stmt->fetchColumn();

            if (!$tournamentId) {
                throw new Exception("Invalid eventId.");
            }

            // 2) Ensure fighter is in TournamentFighters
            $stmt = $db->prepare("SELECT 1 FROM TournamentFighters WHERE FighterId = ? AND TournamentId = ?");
            $stmt->execute([$fighterId, $tournamentId]);

            if (!$stmt->fetch()) {
                $stmt = $db->prepare("
                    INSERT INTO TournamentFighters (FighterId, TournamentId, Strikes)
                    VALUES (?, ?, 0)
                ");
                $stmt->execute([$fighterId, $tournamentId]);
            }

            // 3) Add fighter to EventFighters
            $stmt = $db->prepare("INSERT IGNORE INTO EventFighters (EventId, FighterId) VALUES (?, ?)");
            $stmt->execute([$eventId, $fighterId]);

            $response = [
                "status" => "success",
                "message" => "Fighter added to event.",
                "eventId" => $eventId,
                "fighterId" => $fighterId
            ];
            break;

        case 'DELETE': // Remove fighter from event
            if (!isset($data['eventId'], $data['fighterId'])) {
                throw new Exception("Missing eventId or fighterId.");
            }

            $eventId   = (int)$data['eventId'];
            $fighterId = (int)$data['fighterId'];

            $db->beginTransaction();

            try {
                // 1) Remove from EventFighters
                $stmt = $db->prepare("DELETE FROM EventFighters WHERE EventId = ? AND FighterId = ?");
                $stmt->execute([$eventId, $fighterId]);

                // 2) Delete all matches with status 'P' that include this fighter
                $stmt = $db->prepare("
                    DELETE m
                    FROM Matches m
                    JOIN MatchFighters mf ON m.MatchId = mf.MatchId
                    WHERE m.EventId = ? 
                    AND mf.FighterId = ? 
                    AND m.PendingActiveDone = 'P'
                ");
                $stmt->execute([$eventId, $fighterId]);

                $db->commit();

                $response = [
                    "status" => "success",
                    "message" => "Fighter removed from event and pending matches cleared.",
                    "eventId" => $eventId,
                    "fighterId" => $fighterId
                ];
            } catch (Exception $e) {
                $db->rollBack();
                throw $e;
            }
            break;


        default:
            http_response_code(405);
            $response = ["status" => "error", "message" => "Method not allowed."];
    }

} catch (Exception $e) {
    http_response_code(400);
    $response = ["status" => "error", "message" => $e->getMessage()];
}

echo json_encode($response);
