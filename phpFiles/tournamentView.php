<?php
/**
 * phpFiles/tournamentView.php
 *
 * === Tournament + Events Viewer API ===
 * GET { tournamentId }
 * Returns tournament info + events + weapon details
 */

require_once("connect.php");
header("Content-Type: application/json");

// Handle preflight
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

// Input check
$tournamentId = isset($_GET["tournamentId"]) ? (int) $_GET["tournamentId"] : 0;
if ($tournamentId <= 0) {
    echo json_encode(["status" => "error", "message" => "Missing or invalid tournamentId"]);
    exit;
}

try {
    $db = connect();

    // Tournament info
    $stmt = $db->prepare("
        SELECT TournamentId, TournamentName, TournamentStartDate, TournamentEndDate, 
               TournamentDescription, TournamentRules
        FROM Tournaments
        WHERE TournamentId = ?
    ");
    $stmt->execute([$tournamentId]);
    $tournament = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$tournament) {
        echo json_encode(["status" => "error", "message" => "Tournament not found"]);
        exit;
    }

    // Events with weapon details
    $stmt = $db->prepare("
        SELECT e.EventId, e.EventName, e.EventRules, e.MaxRings,
               w.WeaponId, w.WeaponName, w.WeaponRequirements, w.GearRequirements
        FROM Events e
        INNER JOIN Weapons w ON e.WeaponId = w.WeaponId
        WHERE e.TournamentId = ?
        ORDER BY e.EventId ASC
    ");
    $stmt->execute([$tournamentId]);
    $events = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $events[] = [
            "EventId" => (int) $row["EventId"],
            "EventName" => $row["EventName"],
            "EventRules" => $row["EventRules"],
            "MaxRings" => (int) $row["MaxRings"],
            "Weapon" => [
                "WeaponId" => (int) $row["WeaponId"],
                "WeaponName" => $row["WeaponName"],
                "WeaponRequirements" => $row["WeaponRequirements"],
                "GearRequirements" => $row["GearRequirements"],
            ],
        ];
    }

    echo json_encode([
        "status" => "success",
        "tournament" => $tournament,
        "events" => $events
    ]);

} catch (Exception $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
