<?php
/**
 * phpFiles/viewerStandings.php
 *
 * Public API – Returns per-fighter standings for a given Event.
 * Uses only completed matches (PendingActiveDone = 'D').
 */

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/connect.php';
$db = connect();

$method     = $_SERVER['REQUEST_METHOD'];
$tournament = isset($_GET['tournamentId']) ? (int)$_GET['tournamentId'] : null;
$eventId    = isset($_GET['eventId']) ? (int)$_GET['eventId'] : null;

// Short-circuit OPTIONS preflight
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!$tournament || !$eventId) {
    echo json_encode(['status' => 'error', 'message' => 'Missing tournamentId or eventId']);
    exit;
}

try {
    $stmt = $db->prepare("
        SELECT 
            f.FighterId   AS fighterId,
            f.FighterName AS name,
            c.ClubName    AS club,
            SUM(CASE WHEN mf.WinLossDraw = 'W' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN mf.WinLossDraw = 'L' THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN mf.WinLossDraw = 'D' THEN 1 ELSE 0 END) AS draws,
            COALESCE(SUM(mf.FinalScore), 0) AS points
        FROM MatchFighters mf
        INNER JOIN Matches m ON mf.MatchId = m.MatchId
        INNER JOIN Fighters f ON mf.FighterId = f.FighterId
        LEFT JOIN Clubs c ON f.ClubId = c.ClubId
        WHERE m.EventId = :eventId
          AND m.PendingActiveDone = 'D'
        GROUP BY f.FighterId, f.FighterName, c.ClubName
        ORDER BY points DESC, wins DESC, name ASC
    ");
    $stmt->execute([':eventId' => $eventId]);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Cast numeric fields
    foreach ($rows as &$r) {
        $r['fighterId'] = (int)$r['fighterId'];
        $r['wins']      = (int)$r['wins'];
        $r['losses']    = (int)$r['losses'];
        $r['draws']     = (int)$r['draws'];
        $r['points']    = (float)$r['points'];
    }

    echo json_encode(['status' => 'success', 'standings' => $rows]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}
