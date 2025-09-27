<?php
/**
 * phpFiles/eventApi.php
 *
 * === Events CRUD ===
 * Request/response shape mirrors tournamentApi.php / weaponApi.php:
 * - Frontend sends lowercase JSON keys: { name, rules, weaponId, tournamentId, maxRings }
 * - API maps to DB fields: EventName, EventRules, WeaponId, TournamentId, MaxRings
 * - Responses wrap in { status, ... } and list returns { events: [...] }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
// Optional filter so a page can load only the events for a specific tournament
$filterTournamentId = isset($_GET['tournamentId']) ? (int)$_GET['tournamentId'] : null;

/**
 * IMPORTANT:
 * - Let preflight (OPTIONS) succeed with 204.
 * - Do NOT parse JSON for non-POST/PUT methods.
 * This avoids failing the preflight and matches the behavior that lets weaponApi.php work.
 */
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    switch ($method) {
        case 'GET':

            if (isset($_GET['ringsOnly'])) {
                // Return the max rings across all events
                $stmt = $db->query("SELECT MAX(MaxRings) AS maxRings FROM Events");
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                $maxRings = $row ? (int)$row['maxRings'] : 1;
                echo json_encode(['status' => 'success', 'maxRings' => $maxRings]);
                break;
                
            } elseif ($id) {
                // Single event (include joined names for convenience)
                $stmt = $db->prepare("
                    SELECT 
                        e.EventId, e.EventName, e.EventRules, e.WeaponId, e.TournamentId, e.MaxRings,
                        w.WeaponName, t.TournamentName
                    FROM Events e
                    JOIN Weapons w ON e.WeaponId = w.WeaponId
                    JOIN Tournaments t ON e.TournamentId = t.TournamentId
                    WHERE e.EventId = ?
                ");
                $stmt->execute([$id]);
                $event = $stmt->fetch(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'event' => $event]);
            } else {
                // All events, optionally filtered by tournament
                if ($filterTournamentId) {
                    $stmt = $db->prepare("
                        SELECT 
                            e.EventId, e.EventName, e.EventRules, e.WeaponId, e.TournamentId, e.MaxRings,
                            w.WeaponName, t.TournamentName
                        FROM Events e
                        JOIN Weapons w ON e.WeaponId = w.WeaponId
                        JOIN Tournaments t ON e.TournamentId = t.TournamentId
                        WHERE e.TournamentId = ?
                        ORDER BY e.EventId DESC
                    ");
                    $stmt->execute([$filterTournamentId]);
                } else {
                    $stmt = $db->query("
                        SELECT 
                            e.EventId, e.EventName, e.EventRules, e.WeaponId, e.TournamentId, e.MaxRings,
                            w.WeaponName, t.TournamentName
                        FROM Events e
                        JOIN Weapons w ON e.WeaponId = w.WeaponId
                        JOIN Tournaments t ON e.TournamentId = t.TournamentId
                        ORDER BY e.EventId DESC
                    ");
                }
                $events = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'events' => $events]);
            }
            break;

        case 'POST': {
            // Decode JSON ONLY for POST/PUT
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
                exit;
            }

            // Expect lowercase keys from React
            $name         = $input['name'] ?? null;
            $rules        = $input['rules'] ?? null;
            $weaponId     = $input['weaponId'] ?? null;
            $tournamentId = $input['tournamentId'] ?? null;
            $maxRings     = $input['maxRings'] ?? 1;

            if ($name === null || $rules === null || $weaponId === null || $tournamentId === null) {
                throw new Exception("Event name, rules, weaponId, and tournamentId are required");
            }

            $stmt = $db->prepare("
                INSERT INTO Events (EventName, EventRules, WeaponId, TournamentId, MaxRings)
                VALUES (:name, :rules, :weaponId, :tournamentId, :maxRings)
            ");
            $stmt->execute([
                ':name'         => $name,
                ':rules'        => $rules,
                ':weaponId'     => $weaponId,
                ':tournamentId' => $tournamentId,
                ':maxRings'     => $maxRings
            ]);

            echo json_encode(['status' => 'success', 'id' => (int)$db->lastInsertId()]);
            break;
        }

        case 'PUT': {
            if (!$id) throw new Exception("Event ID is required for update");

            // Decode JSON ONLY for POST/PUT
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
                exit;
            }

            $name         = $input['name'] ?? null;
            $rules        = $input['rules'] ?? null;
            $weaponId     = $input['weaponId'] ?? null;
            $tournamentId = $input['tournamentId'] ?? null;
            $maxRings     = $input['maxRings'] ?? 1;

            $stmt = $db->prepare("
                UPDATE Events
                SET EventName = :name,
                    EventRules = :rules,
                    WeaponId = :weaponId,
                    TournamentId = :tournamentId,
                    MaxRings = :maxRings
                WHERE EventId = :id
            ");
            $stmt->execute([
                ':name'         => $name,
                ':rules'        => $rules,
                ':weaponId'     => $weaponId,
                ':tournamentId' => $tournamentId,
                ':maxRings'     => $maxRings,
                ':id'           => $id
            ]);

            echo json_encode(['status' => 'success']);
            break;
        }

        case 'DELETE': {
            if (!$id) throw new Exception("Event ID is required for delete");
            $stmt = $db->prepare("DELETE FROM Events WHERE EventId = ?");
            $stmt->execute([$id]);
            echo json_encode(['status' => 'success']);
            break;
        }

        default:
            // Do NOT 405 here; returning 200 keeps parity with weaponApi.php and avoids preflight failure.
            echo json_encode(['status' => 'error', 'message' => 'Unsupported HTTP method']);
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
