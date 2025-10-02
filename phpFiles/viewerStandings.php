<?php
/**
 * phpFiles/viewerStandings.php
 *
 * Public API – Returns per-fighter standings for a given Event.
 * Uses only completed matches (PendingActiveDone = 'D').
 * Provides: Wins, Losses, Draws, Avg Score per Exchange, Avg Score per Match
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
            COUNT(DISTINCT m.MatchId) AS matchesPlayed,
            COALESCE(SUM(mf.FinalScore), 0) AS totalScore,
            (
                SELECT COUNT(*)
                FROM Exchanges e
                INNER JOIN MatchFighters mf2 ON e.MatchFighterId = mf2.MatchFighterId
                INNER JOIN Matches m2 ON mf2.MatchId = m2.MatchId
                WHERE mf2.FighterId = f.FighterId
                  AND m2.EventId = :eventId
                  AND m2.PendingActiveDone = 'D'
            ) AS totalExchanges
        FROM MatchFighters mf
        INNER JOIN Matches m ON mf.MatchId = m.MatchId
        INNER JOIN Fighters f ON mf.FighterId = f.FighterId
        LEFT JOIN Clubs c ON f.ClubId = c.ClubId
        WHERE m.EventId = :eventId
          AND m.PendingActiveDone = 'D'
        GROUP BY f.FighterId, f.FighterName, c.ClubName
        ORDER BY wins DESC, name ASC
    ");
    $stmt->execute([':eventId' => $eventId]);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['fighterId']      = (int)$r['fighterId'];
        $r['wins']           = (int)$r['wins'];
        $r['losses']         = (int)$r['losses'];
        $r['draws']          = (int)$r['draws'];
        $r['matchesPlayed']  = (int)$r['matchesPlayed'];
        $r['totalScore']     = (float)$r['totalScore'];
        $r['totalExchanges'] = (int)$r['totalExchanges'];

        $r['avgScorePerMatch'] = $r['matchesPlayed'] > 0
            ? round($r['totalScore'] / $r['matchesPlayed'], 2)
            : 0.0;

        $r['avgScorePerExchange'] = $r['totalExchanges'] > 0
            ? round($r['totalScore'] / $r['totalExchanges'], 2)
            : 0.0;

        unset($r['totalScore'], $r['totalExchanges']);
    }

    echo json_encode(['status' => 'success', 'standings' => $rows]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}
