<?php
/**
 * tournamentApi.php
 * 
 * Handles CRUD for tournaments.
 * 
 * Supports:
 *  - GET    /tournamentApi.php          → List all tournaments
 *  - GET    /tournamentApi.php?id=1     → Get a single tournament
 *  - POST   /tournamentApi.php          → Create a new tournament
 *  - PUT    /tournamentApi.php?id=1     → Update a tournament
 *  - DELETE /tournamentApi.php?id=1     → Delete a tournament
 * 
 * POST / PUT body:
 * {
 *   "name": "Autumn Open 2025",
 *   "startDate": "2025-10-12 09:00:00",
 *   "endDate": "2025-10-13 17:00:00",
 *   "description": "Nordschlag 20xx",
 *   "rules": "Rules universally applicable to whole tournament"
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
                $stmt = $db->prepare("SELECT * FROM Tournaments WHERE TournamentId = ?");
                $stmt->execute([$id]);
                $tournament = $stmt->fetch(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'tournament' => $tournament]);
            } else {
                $stmt = $db->query("SELECT * FROM Tournaments ORDER BY TournamentStartDate DESC");
                $tournaments = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'tournaments' => $tournaments]);
            }
            break;

        case 'POST':
            $name        = $input['name'] ?? null;
            $startDate   = $input['startDate'] ?? null;
            $endDate     = $input['endDate'] ?? null;
            $description = $input['description'] ?? null;
            $rules       = $input['rules'] ?? null;

            if (!$name || !$startDate || !$endDate || !$description || !$rules) {
                throw new Exception("Tournament name, dates, description, and rules are required");
            }

            $stmt = $db->prepare("
                INSERT INTO Tournaments 
                    (TournamentName, TournamentStartDate, TournamentEndDate, TournamentDescription, TournamentRules)
                VALUES 
                    (:name, :startDate, :endDate, :description, :rules)
            ");
            $stmt->execute([
                ':name' => $name,
                ':startDate' => $startDate,
                ':endDate' => $endDate,
                ':description' => $description,
                ':rules' => $rules
            ]);

            echo json_encode(['status' => 'success', 'id' => $db->lastInsertId()]);
            break;

        case 'PUT':
            if (!$id) throw new Exception("Tournament ID is required for update");

            $stmt = $db->prepare("
                UPDATE Tournaments
                SET TournamentName = :name,
                    TournamentStartDate = :startDate,
                    TournamentEndDate = :endDate,
                    TournamentDescription = :description,
                    TournamentRules = :rules
                WHERE TournamentId = :id
            ");
            $stmt->execute([
                ':name' => $input['name'] ?? null,
                ':startDate' => $input['startDate'] ?? null,
                ':endDate' => $input['endDate'] ?? null,
                ':description' => $input['description'] ?? null,
                ':rules' => $input['rules'] ?? null,
                ':id' => $id
            ]);

            echo json_encode(['status' => 'success']);
            break;

        case 'DELETE':
            if (!$id) throw new Exception("Tournament ID is required for delete");

            $stmt = $db->prepare("DELETE FROM Tournaments WHERE TournamentId = ?");
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
