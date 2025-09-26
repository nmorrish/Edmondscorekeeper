<?php
/**
 * phpFiles/clubsApi.php
 *
 * === Clubs CRUD ===
 * Request/response shape mirrors eventApi.php / tournamentApi.php / weaponApi.php:
 * - Frontend sends lowercase JSON keys: { clubName, clubAcronym }
 * - API maps to DB fields: ClubName, ClubAcronym (ClubLogo supported but optional/unused by FE)
 * - Responses wrap in { status, ... } and list returns { clubs: [...] }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

/**
 * IMPORTANT:
 * - Let preflight (OPTIONS) succeed with 204.
 * - Do NOT parse JSON for non-POST/PUT methods.
 * This avoids failing the preflight and matches the behavior that lets other APIs work.
 */
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    switch ($method) {
        case 'GET':
            if ($id) {
                // Single club
                $stmt = $db->prepare("
                    SELECT ClubId, ClubName, ClubLogo, ClubAcronym
                    FROM Clubs
                    WHERE ClubId = ?
                ");
                $stmt->execute([$id]);
                $club = $stmt->fetch(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'club' => $club]);
            } else {
                // All clubs (ordered by name)
                $stmt = $db->query("
                    SELECT ClubId, ClubName, ClubLogo, ClubAcronym
                    FROM Clubs
                    ORDER BY ClubName ASC
                ");
                $clubs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'clubs' => $clubs]);
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
            $clubName    = isset($input['clubName']) ? trim((string)$input['clubName']) : null;
            $clubAcronym = array_key_exists('clubAcronym', $input) ? trim((string)$input['clubAcronym']) : null;
            // Optional: tolerate clubLogo even if FE omits it
            $clubLogo    = array_key_exists('clubLogo', $input) ? $input['clubLogo'] : null;

            if ($clubName === null || $clubName === '') {
                throw new Exception("clubName is required");
            }
            if ($clubAcronym !== null && $clubAcronym === '') {
                $clubAcronym = null; // normalize empty string to NULL
            }
            if ($clubAcronym !== null && strlen($clubAcronym) > 10) {
                throw new Exception("clubAcronym must be 10 characters or fewer");
            }

            $stmt = $db->prepare("
                INSERT INTO Clubs (ClubName, ClubLogo, ClubAcronym)
                VALUES (:clubName, :clubLogo, :clubAcronym)
            ");
            $stmt->execute([
                ':clubName'    => $clubName,
                ':clubLogo'    => $clubLogo,      // FE currently omits; schema allows NULL
                ':clubAcronym' => $clubAcronym,
            ]);

            echo json_encode(['status' => 'success', 'id' => (int)$db->lastInsertId()]);
            break;
        }

        case 'PUT': {
            if (!$id) throw new Exception("Club ID is required for update");

            // Decode JSON ONLY for POST/PUT
            $input = json_decode(file_get_contents('php://input'), true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
                exit;
            }

            $fields = [];
            $params = [':id' => $id];

            if (array_key_exists('clubName', $input)) {
                $clubName = trim((string)$input['clubName']);
                if ($clubName === '') throw new Exception("clubName cannot be empty");
                $fields[] = "ClubName = :clubName";
                $params[':clubName'] = $clubName;
            }

            if (array_key_exists('clubAcronym', $input)) {
                $clubAcronym = trim((string)$input['clubAcronym']);
                if ($clubAcronym === '') $clubAcronym = null; // normalize
                if ($clubAcronym !== null && strlen($clubAcronym) > 10) {
                    throw new Exception("clubAcronym must be 10 characters or fewer");
                }
                $fields[] = "ClubAcronym = :clubAcronym";
                $params[':clubAcronym'] = $clubAcronym;
            }

            if (array_key_exists('clubLogo', $input)) {
                // tolerated by backend even if UI doesn't send it
                $fields[] = "ClubLogo = :clubLogo";
                $params[':clubLogo'] = $input['clubLogo'];
            }

            if (empty($fields)) {
                throw new Exception("No fields to update");
            }

            $sql = "UPDATE Clubs SET " . implode(", ", $fields) . " WHERE ClubId = :id";
            $stmt = $db->prepare($sql);
            $stmt->execute($params);

            echo json_encode(['status' => 'success']);
            break;
        }

        case 'DELETE': {
            if (!$id) throw new Exception("Club ID is required for delete");
            $stmt = $db->prepare("DELETE FROM Clubs WHERE ClubId = ?");
            $stmt->execute([$id]);
            echo json_encode(['status' => 'success']);
            break;
        }

        default:
            // Do NOT 405 here; keep parity with your other APIs and avoid breaking preflights.
            echo json_encode(['status' => 'error', 'message' => 'Unsupported HTTP method']);
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
