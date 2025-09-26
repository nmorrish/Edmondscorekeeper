<?php
/**
 * weaponApi.php
 *
 * Handles CRUD for weapons.
 *
 * Supports:
 *  - GET    /weaponApi.php          → List all weapons
 *  - GET    /weaponApi.php?id=1     → Get a single weapon
 *  - POST   /weaponApi.php          → Create a new weapon
 *  - PUT    /weaponApi.php?id=1     → Update a weapon
 *  - DELETE /weaponApi.php?id=1     → Delete a weapon
 *
 * POST / PUT body (match Tournament-style JSON, map to DB in PHP):
 * {
 *   "name": "Longsword",
 *   "weaponRequirements": "Steel blade, 110cm max",
 *   "gearRequirements": "Fencing mask, gorget, gloves, etc"
 * }
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;
$input  = json_decode(file_get_contents('php://input'), true);

try {
    switch ($method) {
        case 'GET':
            if ($id) {
                $stmt = $db->prepare("SELECT * FROM Weapons WHERE WeaponId = ?");
                $stmt->execute([$id]);
                $weapon = $stmt->fetch(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'weapon' => $weapon]);
            } else {
                $stmt = $db->query("SELECT * FROM Weapons ORDER BY WeaponName ASC");
                $weapons = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'weapons' => $weapons]);
            }
            break;

        case 'POST':
            // Expect Tournament-style JSON keys
            $name  = $input['name'] ?? null;
            $reqs  = $input['weaponRequirements'] ?? null;
            $gear  = $input['gearRequirements'] ?? null;

            if (!$name || !$reqs || !$gear) {
                throw new Exception("Weapon name, weaponRequirements, and gearRequirements are required");
            }

            $stmt = $db->prepare("
                INSERT INTO Weapons (WeaponName, WeaponRequirements, GearRequirements)
                VALUES (:name, :reqs, :gear)
            ");
            $stmt->execute([
                ':name' => $name,
                ':reqs' => $reqs,
                ':gear' => $gear
            ]);

            echo json_encode(['status' => 'success', 'id' => $db->lastInsertId()]);
            break;

        case 'PUT':
            if (!$id) throw new Exception("Weapon ID is required for update");

            $name  = $input['name'] ?? null;
            $reqs  = $input['weaponRequirements'] ?? null;
            $gear  = $input['gearRequirements'] ?? null;

            $stmt = $db->prepare("
                UPDATE Weapons
                SET WeaponName = :name,
                    WeaponRequirements = :reqs,
                    GearRequirements = :gear
                WHERE WeaponId = :id
            ");
            $stmt->execute([
                ':name' => $name,
                ':reqs' => $reqs,
                ':gear' => $gear,
                ':id'   => $id
            ]);

            echo json_encode(['status' => 'success']);
            break;

        case 'DELETE':
            if (!$id) throw new Exception("Weapon ID is required for delete");

            $stmt = $db->prepare("DELETE FROM Weapons WHERE WeaponId = ?");
            $stmt->execute([$id]);

            echo json_encode(['status' => 'success']);
            break;

        default:
            echo json_encode(['status' => 'error', 'message' => 'Unsupported HTTP method']);
            break;
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
