<?php
/**
 * phpFiles/poolsRoundRobinApi.php
 *
 * === Round Robin Pools API ===
 * - POST ?action=save
 *   Clears existing pools/matches for event, inserts Pools + PoolFighters + Matches + MatchFighters + PoolMatches.
 *   Rings assigned cyclically 1..MaxRings.
 *
 * - GET ?action=get&eventId=123
 *   Returns Pools + PoolFighters roster + Matches (fighters only IDs/colors).
 *
 * - GET ?action=candidates&eventId=123&poolId=456
 *   Returns:
 *     - roster: fighters currently in the given pool (with names/clubs)
 *     - available: tournament fighters NOT in any pool for this event (with names/clubs)
 *
 * - PUT ?action=swap
 *   Body: { eventId, fighterAId, fighterBId }
 *   If all matches are PENDING in both pools → simple swap (swap PoolFighters membership + rename in PENDING).
 *   If any ACTIVE/DONE exist → balanced swap (freeze A/D, delete P involving the two fighters, reshuffle both pools).
 *
 * - PUT ?action=move
 *   Body: { eventId, movedFighterId, toPoolId }
 *   Moves one fighter to a new pool; deletes their PENDING matches, reshuffles old & new pools.
 *
 * - POST ?action=addToPool
 *   Body: { eventId, poolId, fighterId }
 *   Ensures fighter is in EventFighters, inserts into PoolFighters, reshuffles pool.
 *
 * - DELETE ?action=removeFromPoolAndEvent
 *   Body: { eventId, poolId, fighterId }
 *   Removes fighter from PoolFighters and EventFighters, deletes PENDING matches that include this fighter for this event,
 *   leaves ACTIVE/DONE matches intact for history, cleans PoolMatches links for deleted matches, reshuffles pool.
 */

require_once("connect.php");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? null;

/* ------------------------------
   Helpers
   ------------------------------ */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) $pdo = connect();
    return $pdo;
}

function getPoolRing(int $poolId): int {
    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT m.MatchRingNo
        FROM PoolMatches pm
        JOIN Matches m ON pm.MatchId = m.MatchId
        WHERE pm.PoolId = ?
        LIMIT 1
    ");
    $stmt->execute([$poolId]);
    $ring = $stmt->fetchColumn();
    return $ring ? (int)$ring : 1;
}

function getAssignedFighterIdsForEvent(int $eventId): array {
    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT DISTINCT pf.FighterId
        FROM PoolFighters pf
        JOIN Pools p ON pf.PoolId = p.PoolId
        WHERE p.EventId = ?
    ");
    $stmt->execute([$eventId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function isInEvent(int $eventId, int $fighterId): bool {
    $pdo = db();
    $stmt = $pdo->prepare("SELECT 1 FROM EventFighters WHERE EventId = ? AND FighterId = ? LIMIT 1");
    $stmt->execute([$eventId, $fighterId]);
    return (bool)$stmt->fetchColumn();
}

function ensureEventFighter(int $eventId, int $fighterId): void {
    if (isInEvent($eventId, $fighterId)) return;
    $pdo = db();
    $stmt = $pdo->prepare("INSERT INTO EventFighters (EventId, FighterId) VALUES (?, ?)");
    $stmt->execute([$eventId, $fighterId]);
}

function getPoolRoster(int $poolId): array {
    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT pf.FighterId, f.FighterName, f.ClubId, c.ClubAcronym
        FROM PoolFighters pf
        JOIN Fighters f ON pf.FighterId = f.FighterId
        LEFT JOIN Clubs c ON f.ClubId = c.ClubId
        WHERE pf.PoolId = ?
        ORDER BY f.FighterName ASC
    ");
    $stmt->execute([$poolId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getAvailableTournamentFightersNotInPools(int $eventId): array {
    $pdo = db();
    $stmt = $pdo->prepare("SELECT TournamentId FROM Events WHERE EventId = ? LIMIT 1");
    $stmt->execute([$eventId]);
    $tournamentId = $stmt->fetchColumn();
    if (!$tournamentId) return [];

    $assigned = getAssignedFighterIdsForEvent($eventId);
    $assignedSet = count($assigned) ? implode(',', array_fill(0, count($assigned), '?')) : '';

    $params = [$tournamentId];
    $sql = "
        SELECT tf.FighterId, f.FighterName, f.ClubId, c.ClubAcronym
        FROM TournamentFighters tf
        JOIN Fighters f ON tf.FighterId = f.FighterId
        LEFT JOIN Clubs c ON f.ClubId = c.ClubId
        WHERE tf.TournamentId = ?
    ";

    if ($assignedSet) {
        $sql .= " AND tf.FighterId NOT IN ($assignedSet) ";
        $params = array_merge($params, $assigned);
    }

    $sql .= " ORDER BY f.FighterName ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function ensureInPool(int $poolId, int $fighterId): void {
    $pdo = db();
    $stmt = $pdo->prepare("SELECT 1 FROM PoolFighters WHERE PoolId = ? AND FighterId = ? LIMIT 1");
    $stmt->execute([$poolId, $fighterId]);
    if ($stmt->fetchColumn()) return;
    $stmt = $pdo->prepare("INSERT INTO PoolFighters (PoolId, FighterId) VALUES (?, ?)");
    $stmt->execute([$poolId, $fighterId]);
}

function deletePendingMatchesForFighterInEvent(int $eventId, int $fighterId): void {
    $pdo = db();
    $stmt = $pdo->prepare("
        SELECT DISTINCT m.MatchId
        FROM Matches m
        JOIN MatchFighters mf ON m.MatchId = mf.MatchId
        WHERE m.EventId = ?
          AND m.PendingActiveDone = 'P'
          AND mf.FighterId = ?
    ");
    $stmt->execute([$eventId, $fighterId]);
    $matchIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    if (!count($matchIds)) return;

    $in = implode(',', array_fill(0, count($matchIds), '?'));
    $stmt = $pdo->prepare("DELETE FROM PoolMatches WHERE MatchId IN ($in)");
    $stmt->execute($matchIds);

    $stmt = $pdo->prepare("DELETE FROM Matches WHERE MatchId IN ($in)");
    $stmt->execute($matchIds);
}

/**
 * Circle method scheduler
 */
function generateCircleSchedule(array $fighters): array {
    $count = count($fighters);
    if ($count < 2) return [];

    // pad odd count with bye
    if ($count % 2 === 1) {
        $fighters[] = -1; // sentinel bye
        $count++;
    }

    $rounds = $count - 1;
    $half   = (int)($count / 2);
    $schedule = [];

    for ($r = 0; $r < $rounds; $r++) {
        for ($i = 0; $i < $half; $i++) {
            $f1 = $fighters[$i];
            $f2 = $fighters[$count - 1 - $i];
            if ($f1 === -1 || $f2 === -1) continue; // skip bye
            $schedule[] = [$f1, $f2];
        }
        // rotate, keep index 0 fixed
        $first = array_shift($fighters);
        $last  = array_pop($fighters);
        array_unshift($fighters, $first);
        array_splice($fighters, 1, 0, [$last]);
    }

    return $schedule;
}

/**
 * Reshuffle pending matches for a pool using circle method.
 * Keeps DONE + ACTIVE matches intact, regenerates PENDING.
 * Returns a complete list of matches (ACTIVE/DONE preserved + new PENDING),
 * each with: matchId, status, ringNo, queueNo, fighters[FighterId,FighterColor].
 */
function reshufflePoolMatches(PDO $db, int $eventId, int $poolId, int $ring): array {
    // 1) Fetch roster
    $roster = getPoolRoster($poolId);
    $fighterIds = array_map('intval', array_column($roster, 'FighterId'));

    // 2) Fetch existing matches (rich)
    $stmt = $db->prepare("
        SELECT m.MatchId, m.PendingActiveDone, m.MatchRingNo, m.MatchQueueNumber,
               mf.FighterId, mf.FighterColor
        FROM PoolMatches pm
        JOIN Matches m ON pm.MatchId = m.MatchId
        JOIN MatchFighters mf ON m.MatchId = mf.MatchId
        WHERE pm.PoolId = ?
        ORDER BY m.MatchQueueNumber ASC, m.MatchId ASC, mf.FighterColor ASC
    ");
    $stmt->execute([$poolId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $byId = [];       // all matches by id
    $pendingIds = []; // list of pending match ids to delete

    foreach ($rows as $r) {
        $mid = (int)$r['MatchId'];
        if (!isset($byId[$mid])) {
            $byId[$mid] = [
                "matchId"  => $mid,
                "status"   => $r['PendingActiveDone'],
                "ringNo"   => (int)$r['MatchRingNo'],
                "queueNo"  => (int)$r['MatchQueueNumber'],
                "fighters" => []
            ];
        }
        $byId[$mid]["fighters"][] = [
            "FighterId"    => (int)$r['FighterId'],
            "FighterColor" => $r['FighterColor']
        ];
        if ($r['PendingActiveDone'] === 'P') {
            $pendingIds[$mid] = true;
        }
    }

    // 3) Delete all pending matches from DB
    if (!empty($pendingIds)) {
        $ids = array_map('intval', array_keys($pendingIds));
        $in  = implode(',', array_fill(0, count($ids), '?'));
        $db->prepare("DELETE FROM PoolMatches WHERE MatchId IN ($in)")->execute($ids);
        $db->prepare("DELETE FROM Matches WHERE MatchId IN ($in)")->execute($ids);
        // Remove them from memory snapshot as well
        foreach ($ids as $mid) unset($byId[$mid]);
    }

    // If fewer than 2 fighters, nothing to create — return existing A/D only
    if (count($fighterIds) < 2) {
        return array_values($byId);
    }

    // 4) Generate fresh pending matches
    $pairs = generateCircleSchedule($fighterIds);
    foreach ($pairs as [$f1, $f2]) {
        // Create new pending match on the pool's ring
        $stmt = $db->prepare("INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo) VALUES (?, 'P', ?)");
        $stmt->execute([$eventId, $ring]);
        $matchId = (int)$db->lastInsertId();

        $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (?, ?, 'Red')")
           ->execute([$matchId, $f1]);
        $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (?, ?, 'Blue')")
           ->execute([$matchId, $f2]);

        $db->prepare("INSERT INTO PoolMatches (PoolId, MatchId) VALUES (?, ?)")
           ->execute([$poolId, $matchId]);

        $queue = (int)$db->query("SELECT MatchQueueNumber FROM Matches WHERE MatchId = $matchId")->fetchColumn();

        $byId[$matchId] = [
            "matchId"  => $matchId,
            "status"   => "P",
            "ringNo"   => $ring,
            "queueNo"  => $queue,
            "fighters" => [
                ["FighterId" => (int)$f1, "FighterColor" => "Red"],
                ["FighterId" => (int)$f2, "FighterColor" => "Blue"]
            ]
        ];
    }

    // 5) Return ACTIVE/DONE (preserved) + new PENDING, as flat list
    // Sort by queueNo then matchId for stability
    $list = array_values($byId);
    usort($list, function($a, $b) {
        if (($a['queueNo'] ?? 0) === ($b['queueNo'] ?? 0)) return ($a['matchId'] <=> $b['matchId']);
        return ($a['queueNo'] <=> $b['queueNo']);
    });
    return $list;
}

/**
 * Swap fighters mid-event with balance compensation.
 * - If both pools have only pending matches → simple swap:
 *   • swap PoolFighters membership
 *   • update PENDING matches to swap fighterIds
 * - If either pool has ACTIVE/DONE → balanced swap:
 *   • freeze ACTIVE/DONE
 *   • delete PENDING involving swapped fighters
 *   • swap PoolFighters membership
 *   • reshuffle both pools
 */
function swapFightersWithBalance(PDO $db, int $eventId, int $f1, int $f2): array {
    // Get pools of each fighter and detect A/D presence
    $stmt = $db->prepare("
        SELECT pf.FighterId, pf.PoolId, m.PendingActiveDone
        FROM PoolFighters pf
        JOIN Pools p ON pf.PoolId = p.PoolId
        LEFT JOIN PoolMatches pm ON pf.PoolId = pm.PoolId
        LEFT JOIN Matches m ON pm.MatchId = m.MatchId
        WHERE p.EventId = ? AND (pf.FighterId = ? OR pf.FighterId = ?)
    ");
    $stmt->execute([$eventId, $f1, $f2]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $poolByFighter = [];
    $hasDoneOrActive = false;
    foreach ($rows as $r) {
        $poolByFighter[(int)$r['FighterId']] = (int)$r['PoolId'];
        if ($r['PendingActiveDone'] === 'D' || $r['PendingActiveDone'] === 'A') {
            $hasDoneOrActive = true;
        }
    }

    $p1 = $poolByFighter[$f1] ?? null;
    $p2 = $poolByFighter[$f2] ?? null;
    if (!$p1 || !$p2) {
        throw new Exception("Both fighters must be in pools.");
    }

    if (!$hasDoneOrActive) {
        // === SIMPLE SWAP ===
        // 1) swap PoolFighters membership
        $db->prepare("DELETE FROM PoolFighters WHERE PoolId=? AND FighterId=?")->execute([$p1, $f1]);
        $db->prepare("DELETE FROM PoolFighters WHERE PoolId=? AND FighterId=?")->execute([$p2, $f2]);
        ensureInPool($p1, $f2);
        ensureInPool($p2, $f1);

        // 2) update PENDING matches to rename fighterIds
        $stmt = $db->prepare("
            UPDATE MatchFighters SET FighterId = :newId
            WHERE FighterId = :oldId AND MatchId IN (
                SELECT m.MatchId
                FROM Matches m
                WHERE m.EventId = :eventId AND m.PendingActiveDone = 'P'
            )
        ");
        $stmt->execute(['newId' => $f2, 'oldId' => $f1, 'eventId' => $eventId]);
        $stmt->execute(['newId' => $f1, 'oldId' => $f2, 'eventId' => $eventId]);

        // No reshuffle needed; PENDING matches still complete after rename.
        return [
            'mode'  => 'simple',
            'pools' => [
                ['poolId' => $p1, 'roster' => getPoolRoster($p1)],
                ['poolId' => $p2, 'roster' => getPoolRoster($p2)],
            ]
        ];
    }

    // === BALANCED SWAP ===
    // swap membership
    $db->prepare("DELETE FROM PoolFighters WHERE PoolId=? AND FighterId=?")->execute([$p1, $f1]);
    $db->prepare("DELETE FROM PoolFighters WHERE PoolId=? AND FighterId=?")->execute([$p2, $f2]);
    ensureInPool($p1, $f2);
    ensureInPool($p2, $f1);

    // delete all pending involving either fighter
    deletePendingMatchesForFighterInEvent($eventId, $f1);
    deletePendingMatchesForFighterInEvent($eventId, $f2);

    // reshuffle both pools
    $ring1    = getPoolRing($p1);
    $ring2    = getPoolRing($p2);
    $matches1 = reshufflePoolMatches($db, $eventId, $p1, $ring1);
    $matches2 = reshufflePoolMatches($db, $eventId, $p2, $ring2);

    return [
        'mode'  => 'balanced',
        'pools' => [
            ['poolId' => $p1, 'matches' => $matches1, 'roster' => getPoolRoster($p1)],
            ['poolId' => $p2, 'matches' => $matches2, 'roster' => getPoolRoster($p2)],
        ]
    ];
}

/* ------------------------------
   GET: candidates (roster + available)
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'candidates') {
    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $poolId  = isset($_GET['poolId']) ? (int)$_GET['poolId'] : 0;
    if (!$eventId || !$poolId) {
        echo json_encode(["status" => "error", "message" => "eventId and poolId required"]);
        exit;
    }

    try {
        $roster    = getPoolRoster($poolId);
        $available = getAvailableTournamentFightersNotInPools($eventId);
        echo json_encode(["status" => "success", "roster" => $roster, "available" => $available]);
    } catch (Exception $e) {
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   GET: fetch existing pools
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get') {
    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    if (!$eventId) {
        echo json_encode(["status" => "error", "message" => "eventId required"]);
        exit;
    }

    try {
        $db = db();
        $stmt = $db->prepare("SELECT * FROM Pools WHERE EventId = ? ORDER BY PoolNo ASC");
        $stmt->execute([$eventId]);
        $pools = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $structured = [];
        foreach ($pools as $pool) {
            $poolId = (int)$pool['PoolId'];

            $stmtR = $db->prepare("
                SELECT pf.FighterId, f.FighterName, f.ClubId, c.ClubAcronym
                FROM PoolFighters pf
                JOIN Fighters f ON pf.FighterId = f.FighterId
                LEFT JOIN Clubs c ON f.ClubId = c.ClubId
                WHERE pf.PoolId = ?
                ORDER BY f.FighterName ASC
            ");
            $stmtR->execute([$poolId]);
            $roster = $stmtR->fetchAll(PDO::FETCH_ASSOC);

            $stmtM = $db->prepare("
                SELECT m.MatchId, m.MatchRingNo, m.PendingActiveDone, m.MatchQueueNumber,
                       mf.FighterId, mf.FighterColor
                FROM PoolMatches pm
                JOIN Matches m ON pm.MatchId = m.MatchId
                JOIN MatchFighters mf ON m.MatchId = mf.MatchId
                WHERE pm.PoolId = ?
                ORDER BY m.MatchQueueNumber ASC, m.MatchId ASC, mf.FighterColor ASC
            ");
            $stmtM->execute([$poolId]);
            $rows = $stmtM->fetchAll(PDO::FETCH_ASSOC);

            $matches = [];
            foreach ($rows as $r) {
                $mid = (int)$r['MatchId'];
                if (!isset($matches[$mid])) {
                    $matches[$mid] = [
                        "matchId"  => $mid,
                        "status"   => $r['PendingActiveDone'],
                        "ringNo"   => (int)$r['MatchRingNo'],
                        "queueNo"  => (int)$r['MatchQueueNumber'],
                        "fighters" => []
                    ];
                }
                $matches[$mid]["fighters"][] = [
                    "FighterId"    => (int)$r['FighterId'],
                    "FighterColor" => $r['FighterColor']
                ];
            }

            // ringAssigned from first match (if any)
            $ringAssigned = null;
            if (!empty($rows)) {
                $ringAssigned = (int)$rows[0]['MatchRingNo'];
            }

            $structured[] = [
                "poolId"       => $poolId,
                "poolNo"       => (int)$pool['PoolNo'],
                "ringAssigned" => $ringAssigned,
                "roster"       => $roster,
                "matches"      => array_values($matches)
            ];
        }

        echo json_encode(["status" => "success", "pools" => $structured]);
    } catch (Exception $e) {
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   PUT: swap fighters
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'PUT' && $action === 'swap') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data || !isset($data['eventId'], $data['fighterAId'], $data['fighterBId'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId = (int)$data['eventId'];
    $f1 = (int)$data['fighterAId'];
    $f2 = (int)$data['fighterBId'];

    try {
        $db = db();
        $db->beginTransaction();

        $result = swapFightersWithBalance($db, $eventId, $f1, $f2);

        $db->commit();
        echo json_encode([
            "status"  => "success",
            "message" => $result['mode'] === 'simple'
                ? "Fighters swapped (simple)."
                : "Fighters swapped with balanced reshuffle.",
            "details" => $result
        ]);
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   PUT: move fighter (to another pool)
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'PUT' && $action === 'move') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data || !isset($data['eventId'], $data['movedFighterId'], $data['toPoolId'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId        = (int)$data['eventId'];
    $movedFighterId = (int)$data['movedFighterId'];
    $toPoolId       = (int)$data['toPoolId'];

    try {
        $db = db();
        $db->beginTransaction();

        // Validate pool belongs to event
        $stmt = $db->prepare("SELECT PoolId FROM Pools WHERE PoolId=? AND EventId=? LIMIT 1");
        $stmt->execute([$toPoolId, $eventId]);
        if (!$stmt->fetchColumn()) throw new Exception("Target pool does not belong to event.");

        // Find old pool
        $stmt = $db->prepare("
            SELECT pf.PoolId
            FROM PoolFighters pf
            JOIN Pools p ON pf.PoolId = p.PoolId
            WHERE pf.FighterId=? AND p.EventId=? LIMIT 1
        ");
        $stmt->execute([$movedFighterId, $eventId]);
        $fromPoolId = $stmt->fetchColumn();

        if ($fromPoolId && (int)$fromPoolId === $toPoolId) {
            throw new Exception("Fighter is already in that pool.");
        }

        // Remove from old pool + delete their pending matches + reshuffle old
        if ($fromPoolId) {
            $stmt = $db->prepare("DELETE FROM PoolFighters WHERE PoolId=? AND FighterId=?");
            $stmt->execute([(int)$fromPoolId, $movedFighterId]);
            deletePendingMatchesForFighterInEvent($eventId, $movedFighterId);
            $oldRing = getPoolRing((int)$fromPoolId);
            reshufflePoolMatches($db, $eventId, (int)$fromPoolId, $oldRing);
        }

        // Add to new pool and reshuffle
        ensureEventFighter($eventId, $movedFighterId);
        ensureInPool($toPoolId, $movedFighterId);

        $ring    = getPoolRing($toPoolId);
        $matches = reshufflePoolMatches($db, $eventId, $toPoolId, $ring);
        $roster  = getPoolRoster($toPoolId);

        $db->commit();
        echo json_encode([
            "status"  => "success",
            "message" => "Fighter moved to new pool.",
            "poolId"  => $toPoolId,
            "roster"  => $roster,
            "matches" => $matches
        ]);
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   POST: save pools
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'save') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data || !isset($data['eventId'], $data['pools'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId        = (int)$data['eventId'];
    $deleteExisting = !empty($data['deleteExisting']);

    try {
        $db = db();
        $db->beginTransaction();

        $stmt = $db->prepare("SELECT MaxRings FROM Events WHERE EventId = ? LIMIT 1");
        $stmt->execute([$eventId]);
        $eventRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$eventRow) throw new Exception("Event not found.");
        $maxRings = max(1, (int)$eventRow['MaxRings']);

        if ($deleteExisting) {
            // First remove bracket match links
            $db->prepare("DELETE bm FROM BracketMatches bm
                        JOIN Matches m ON bm.MatchId = m.MatchId
                        WHERE m.EventId = ?")->execute([$eventId]);

            // Then remove pool match links
            $db->prepare("DELETE pm FROM PoolMatches pm
                        JOIN Matches m ON pm.MatchId = m.MatchId
                        WHERE m.EventId = ?")->execute([$eventId]);

            // Remove pool fighters
            $db->prepare("DELETE pf FROM PoolFighters pf
                        JOIN Pools p ON pf.PoolId = p.PoolId
                        WHERE p.EventId = ?")->execute([$eventId]);

            // Now safe to delete matches themselves
            $db->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);

            // Delete pools for the event
            $db->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);

            // Finally delete brackets for the event
            $db->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);
        }

        $poolRingCounter = 1;
        $structured = [];

        foreach ($data['pools'] as $pool) {
            $poolNo     = (int)$pool['poolNo'];
            $fighterIds = $pool['fighterIds'] ?? [];
            if (!$fighterIds) continue;

            $stmt = $db->prepare("INSERT INTO Pools (EventId, PoolNo, MinFighters, MaxFighters)
                                  VALUES (?, ?, ?, ?)");
            $stmt->execute([$eventId, $poolNo, count($fighterIds), count($fighterIds)]);
            $poolId = (int)$db->lastInsertId();

            $stmtPF = $db->prepare("INSERT INTO PoolFighters (PoolId, FighterId) VALUES (?, ?)");
            foreach ($fighterIds as $fid) $stmtPF->execute([$poolId, (int)$fid]);

            $roster = getPoolRoster($poolId);

            // assign ring cyclically
            $assignedRing   = $poolRingCounter;
            $poolRingCounter = ($poolRingCounter % $maxRings) + 1;

            $matches = reshufflePoolMatches($db, $eventId, $poolId, $assignedRing);

            $structured[] = [
                "poolId"       => $poolId,
                "poolNo"       => $poolNo,
                "ringAssigned" => $assignedRing,
                "roster"       => $roster,
                "matches"      => $matches
            ];
        }

        $db->commit();
        echo json_encode(["status" => "success", "pools" => $structured]);
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   POST: addToPool
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'addToPool') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data || !isset($data['eventId'], $data['poolId'], $data['fighterId'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId   = (int)$data['eventId'];
    $poolId    = (int)$data['poolId'];
    $fighterId = (int)$data['fighterId'];

    try {
        $db = db();
        $db->beginTransaction();

        $stmt = $db->prepare("SELECT PoolId FROM Pools WHERE PoolId = ? AND EventId = ? LIMIT 1");
        $stmt->execute([$poolId, $eventId]);
        if (!$stmt->fetchColumn()) throw new Exception("Pool does not belong to event.");

        ensureEventFighter($eventId, $fighterId);
        ensureInPool($poolId, $fighterId);

        $ring    = getPoolRing($poolId);
        $matches = reshufflePoolMatches($db, $eventId, $poolId, $ring);
        $roster  = getPoolRoster($poolId);

        $db->commit();
        echo json_encode([
            "status"  => "success",
            "message" => "Fighter added to pool and matches reshuffled.",
            "poolId"  => $poolId,
            "roster"  => $roster,
            "matches" => $matches
        ]);
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   DELETE: removeFromPoolAndEvent
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'DELETE' && $action === 'removeFromPoolAndEvent') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data || !isset($data['eventId'], $data['poolId'], $data['fighterId'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId   = (int)$data['eventId'];
    $poolId    = (int)$data['poolId'];
    $fighterId = (int)$data['fighterId'];

    try {
        $db = db();
        $db->beginTransaction();

        $stmt = $db->prepare("SELECT PoolId FROM Pools WHERE PoolId = ? AND EventId = ? LIMIT 1");
        $stmt->execute([$poolId, $eventId]);
        if (!$stmt->fetchColumn()) throw new Exception("Pool does not belong to event.");

        deletePendingMatchesForFighterInEvent($eventId, $fighterId);

        $stmt = $db->prepare("DELETE FROM PoolFighters WHERE PoolId = ? AND FighterId = ?");
        $stmt->execute([$poolId, $fighterId]);

        $stmt = $db->prepare("DELETE FROM EventFighters WHERE EventId = ? AND FighterId = ?");
        $stmt->execute([$eventId, $fighterId]);

        $ring    = getPoolRing($poolId);
        $matches = reshufflePoolMatches($db, $eventId, $poolId, $ring);
        $roster  = getPoolRoster($poolId);

        $db->commit();
        echo json_encode([
            "status"  => "success",
            "message" => "Fighter removed from pool and matches reshuffled.",
            "poolId"  => $poolId,
            "roster"  => $roster,
            "matches" => $matches
        ]);
    } catch (Exception $e) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

echo json_encode(["status" => "error", "message" => "Unsupported action."]);
exit;
