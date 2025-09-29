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
 * - PUT ?action=swap
 *   Swaps two fighters across pools: updates PoolFighters + swaps them in pending matches only.
 *
 * --- Hybrid Add/Drop for Pools (NEW) ---
 * - GET    ?action=candidates&eventId=123&poolId=456
 *   Returns:
 *     - roster: fighters currently in the given pool (with names/clubs)
 *     - available: tournament fighters NOT in any pool for this event (with names/clubs)
 *
 * - POST   ?action=addToPool
 *   Body: { eventId, poolId, fighterId }
 *   Ensures fighter is in EventFighters, inserts into PoolFighters, creates PENDING matches vs. all current poolmates,
 *   assigns ring for new matches using the pool’s existing ring (or falls back to ring 1).
 *
 * - DELETE ?action=removeFromPoolAndEvent
 *   Body: { eventId, poolId, fighterId }
 *   Removes fighter from PoolFighters and EventFighters, deletes PENDING matches that include this fighter for this event,
 *   leaves ACTIVE/DONE matches intact for history, cleans PoolMatches links for deleted matches.
 */

require_once("connect.php");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? null;

/* ------------------------------
   Helpers (NEW)
   ------------------------------ */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) $pdo = connect();
    return $pdo;
}

/**
 * Returns pool’s assigned ring inferred from existing matches.
 * If no matches yet, returns 1 as a safe default.
 */
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

/**
 * Returns all fighter IDs already assigned to any pool in this event.
 */
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

/**
 * Returns true if fighterId exists in EventFighters for eventId.
 */
function isInEvent(int $eventId, int $fighterId): bool {
    $pdo = db();
    $stmt = $pdo->prepare("SELECT 1 FROM EventFighters WHERE EventId = ? AND FighterId = ? LIMIT 1");
    $stmt->execute([$eventId, $fighterId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * Ensures a (eventId, fighterId) row exists in EventFighters.
 */
function ensureEventFighter(int $eventId, int $fighterId): void {
    if (isInEvent($eventId, $fighterId)) return;
    $pdo = db();
    $stmt = $pdo->prepare("INSERT INTO EventFighters (EventId, FighterId) VALUES (?, ?)");
    $stmt->execute([$eventId, $fighterId]);
}

/**
 * Build full roster rows for given poolId with Fighter + Club fields used by UI.
 */
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

/**
 * Build available list = Tournament fighters NOT in any pool for eventId.
 * Returns FighterId, FighterName, ClubId, ClubAcronym.
 */
function getAvailableTournamentFightersNotInPools(int $eventId): array {
    $pdo = db();

    // All tournament fighters for the tournament of this event
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

/**
 * Insert a fighter into PoolFighters; no-op if already there.
 */
function ensureInPool(int $poolId, int $fighterId): void {
    $pdo = db();
    $stmt = $pdo->prepare("SELECT 1 FROM PoolFighters WHERE PoolId = ? AND FighterId = ? LIMIT 1");
    $stmt->execute([$poolId, $fighterId]);
    if ($stmt->fetchColumn()) return;
    $stmt = $pdo->prepare("INSERT INTO PoolFighters (PoolId, FighterId) VALUES (?, ?)");
    $stmt->execute([$poolId, $fighterId]);
}

/**
 * Create pending matches for (newFighterId) vs. all existing poolmates (excluding themself).
 * Assign ring based on pool’s existing ring.
 */
function createPendingMatchesForNewPoolFighter(int $eventId, int $poolId, int $newFighterId): array {
    $pdo = db();

    // Current roster (excluding new fighter)
    $stmt = $pdo->prepare("
        SELECT FighterId
        FROM PoolFighters
        WHERE PoolId = ?
          AND FighterId <> ?
        ORDER BY FighterId ASC
    ");
    $stmt->execute([$poolId, $newFighterId]);
    $opponentIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    if (!count($opponentIds)) return [];

    $ring = getPoolRing($poolId);
    $created = [];

    foreach ($opponentIds as $oppId) {
        // Create Match
        $stmt = $pdo->prepare("INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo) VALUES (?, 'P', ?)");
        $stmt->execute([$eventId, $ring]);
        $matchId = (int)$pdo->lastInsertId();

        // Create fighters (deterministic but arbitrary color assignment)
        // Keep new fighter Red, opponent Blue (consistent with save())
        $stmt = $pdo->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (?, ?, ?)");
        $stmt->execute([$matchId, $newFighterId, "Red"]);
        $stmt->execute([$matchId, $oppId,       "Blue"]);

        // Link to pool
        $stmt = $pdo->prepare("INSERT INTO PoolMatches (PoolId, MatchId) VALUES (?, ?)");
        $stmt->execute([$poolId, $matchId]);

        $created[] = [
            "matchId"  => $matchId,
            "status"   => "P",
            "ringNo"   => $ring,
            "fighters" => [
                ["FighterId" => $newFighterId, "FighterColor" => "Red"],
                ["FighterId" => $oppId,        "FighterColor" => "Blue"],
            ],
        ];
    }

    return $created;
}

/**
 * Delete all PENDING matches for (eventId) where the fighter participates.
 * Also cleans PoolMatches links for those deleted matches.
 */
function deletePendingMatchesForFighterInEvent(int $eventId, int $fighterId): void {
    $pdo = db();

    // Find pending matchIds that include fighter
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

    // Remove PoolMatches links for those matches first (FK safety)
    $in = implode(',', array_fill(0, count($matchIds), '?'));
    $stmt = $pdo->prepare("DELETE FROM PoolMatches WHERE MatchId IN ($in)");
    $stmt->execute($matchIds);

    // Delete Matches (cascades to MatchFighters → Exchanges → ExchangeScores)
    $stmt = $pdo->prepare("DELETE FROM Matches WHERE MatchId IN ($in)");
    $stmt->execute($matchIds);
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

            // Roster with full fighter info for swap UI
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

            // Matches (fighters only IDs/colors for cards that self-load)
            $stmtM = $db->prepare("
                SELECT m.MatchId, m.MatchRingNo, m.PendingActiveDone,
                       mf.FighterId, mf.FighterColor
                FROM PoolMatches pm
                JOIN Matches m ON pm.MatchId = m.MatchId
                JOIN MatchFighters mf ON m.MatchId = mf.MatchId
                WHERE pm.PoolId = ?
                ORDER BY m.MatchId ASC, mf.FighterColor ASC
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
                        "fighters" => []
                    ];
                }
                $matches[$mid]["fighters"][] = [
                    "FighterId"    => (int)$r['FighterId'],
                    "FighterColor" => $r['FighterColor']
                ];
            }

            $structured[] = [
                "poolId"       => $poolId,
                "poolNo"       => (int)$pool['PoolNo'],
                "ringAssigned" => count($rows) ? (int)$rows[0]['MatchRingNo'] : null,
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
    if (!$data || !isset($data['eventId'], $data['fromFighterId'], $data['toFighterId'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId       = (int)$data['eventId'];
    $fromFighterId = (int)$data['fromFighterId'];
    $toFighterId   = (int)$data['toFighterId'];

    try {
        $db = db();
        $db->beginTransaction();

        // Find pools of each fighter within the event
        $stmt = $db->prepare("
            SELECT pf.PoolId
            FROM PoolFighters pf
            JOIN Pools p ON pf.PoolId = p.PoolId
            WHERE pf.FighterId = ? AND p.EventId = ?
            LIMIT 1
        ");
        $stmt->execute([$fromFighterId, $eventId]);
        $fromPool = $stmt->fetchColumn();

        $stmt->execute([$toFighterId, $eventId]);
        $toPool = $stmt->fetchColumn();

        if (!$fromPool || !$toPool) {
            throw new Exception("Fighters not found in event pools.");
        }

        // Swap pool roster assignments
        $db->prepare("UPDATE PoolFighters SET FighterId = ? WHERE PoolId = ? AND FighterId = ?")
           ->execute([$toFighterId, $fromPool, $fromFighterId]);
        $db->prepare("UPDATE PoolFighters SET FighterId = ? WHERE PoolId = ? AND FighterId = ?")
           ->execute([$fromFighterId, $toPool, $toFighterId]);

        // Swap only in pending matches
        $stmt = $db->prepare("
            UPDATE MatchFighters mf
            JOIN Matches m ON mf.MatchId = m.MatchId
            SET mf.FighterId = CASE 
                WHEN mf.FighterId = :fromFighter THEN :toFighter
                WHEN mf.FighterId = :toFighter THEN :fromFighter
                ELSE mf.FighterId END
            WHERE m.EventId = :eventId
              AND m.PendingActiveDone = 'P'
              AND mf.FighterId IN (:fromFighter, :toFighter)
        ");
        $stmt->bindValue(":fromFighter", $fromFighterId, PDO::PARAM_INT);
        $stmt->bindValue(":toFighter",   $toFighterId,   PDO::PARAM_INT);
        $stmt->bindValue(":eventId",     $eventId,       PDO::PARAM_INT);
        $stmt->execute();

        $db->commit();
        echo json_encode(["status" => "success", "message" => "Swap complete"]);
    } catch (Exception $e) {
        if ($db && $db->inTransaction()) $db->rollBack();
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

        // Max rings
        $stmt = $db->prepare("SELECT MaxRings FROM Events WHERE EventId = ?");
        $stmt->execute([$eventId]);
        $eventRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$eventRow) throw new Exception("Event not found.");
        $maxRings = max(1, (int)$eventRow['MaxRings']);

        if ($deleteExisting) {
            $db->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);
            $db->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);
            $db->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);
        }

        $poolRingCounter = 1;
        $structured = [];

        foreach ($data['pools'] as $pool) {
            $poolNo     = (int)$pool['poolNo'];
            $fighterIds = $pool['fighterIds'] ?? [];
            $matches    = $pool['matches'] ?? [];
            if (!$fighterIds || !$matches) continue;

            // Create pool
            $stmt = $db->prepare("INSERT INTO Pools (EventId, PoolNo, MinFighters, MaxFighters)
                                  VALUES (?, ?, ?, ?)");
            $stmt->execute([$eventId, $poolNo, count($fighterIds), count($fighterIds)]);
            $poolId = $db->lastInsertId();

            // Insert PoolFighters
            $stmtPF = $db->prepare("INSERT INTO PoolFighters (PoolId, FighterId) VALUES (?, ?)");
            foreach ($fighterIds as $fid) {
                $stmtPF->execute([$poolId, (int)$fid]);
            }

            // Fetch FULL roster (Id, Name, ClubAcronym) for response (authoritative for swap UI)
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

            // Ring
            $assignedRing   = $poolRingCounter;
            $poolRingCounter = ($poolRingCounter % $maxRings) + 1;

            $poolBlock = [
                "poolId"       => (int)$poolId,
                "poolNo"       => $poolNo,
                "ringAssigned" => $assignedRing,
                "roster"       => $roster,
                "matches"      => []
            ];

            // Insert matches
            foreach ($matches as $pair) {
                if (count($pair) !== 2) continue;
                [$f1, $f2] = array_map('intval', $pair);

                $stmt = $db->prepare("INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo)
                                      VALUES (?, 'P', ?)");
                $stmt->execute([$eventId, $assignedRing]);
                $matchId = $db->lastInsertId();

                $stmt = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor)
                                      VALUES (?, ?, ?)");
                $stmt->execute([$matchId, $f1, "Red"]);
                $stmt->execute([$matchId, $f2, "Blue"]);

                $db->prepare("INSERT INTO PoolMatches (PoolId, MatchId) VALUES (?, ?)")
                   ->execute([$poolId, $matchId]);

                $poolBlock["matches"][] = [
                    "matchId"  => (int)$matchId,
                    "status"   => "P",
                    "ringNo"   => $assignedRing,
                    "fighters" => [
                        ["FighterId" => $f1, "FighterColor" => "Red"],
                        ["FighterId" => $f2, "FighterColor" => "Blue"]
                    ]
                ];
            }

            $structured[] = $poolBlock;
        }

        $db->commit();
        echo json_encode(["status" => "success", "pools" => $structured]);
    } catch (Exception $e) {
        if ($db && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   NEW: GET candidates (roster + available)
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'candidates') {
    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $poolId  = isset($_GET['poolId'])  ? (int)$_GET['poolId']  : 0;
    if (!$eventId || !$poolId) {
        echo json_encode(["status" => "error", "message" => "eventId and poolId required"]);
        exit;
    }

    try {
        $roster    = getPoolRoster($poolId);
        $available = getAvailableTournamentFightersNotInPools($eventId);
        echo json_encode([
            "status"    => "success",
            "roster"    => $roster,
            "available" => $available
        ]);
    } catch (Exception $e) {
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   NEW: POST addToPool
   Body: { eventId, poolId, fighterId }
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
        $pdo = db();
        $pdo->beginTransaction();

        // Validate pool belongs to event
        $stmt = $pdo->prepare("SELECT PoolId FROM Pools WHERE PoolId = ? AND EventId = ? LIMIT 1");
        $stmt->execute([$poolId, $eventId]);
        if (!$stmt->fetchColumn()) throw new Exception("Pool does not belong to event.");

        // Ensure event roster, ensure pool membership
        ensureEventFighter($eventId, $fighterId);
        ensureInPool($poolId, $fighterId);

        // Create pending matches vs existing poolmates
        $createdMatches = createPendingMatchesForNewPoolFighter($eventId, $poolId, $fighterId);

        // Fresh roster for response
        $roster = getPoolRoster($poolId);

        $pdo->commit();
        echo json_encode([
            "status"  => "success",
            "message" => "Fighter added to pool and pending matches created.",
            "poolId"  => $poolId,
            "roster"  => $roster,
            "matches" => $createdMatches
        ]);
    } catch (Exception $e) {
        if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

/* ------------------------------
   NEW: DELETE removeFromPoolAndEvent
   Body: { eventId, poolId, fighterId }
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
        $pdo = db();
        $pdo->beginTransaction();

        // Validate pool belongs to event
        $stmt = $pdo->prepare("SELECT PoolId FROM Pools WHERE PoolId = ? AND EventId = ? LIMIT 1");
        $stmt->execute([$poolId, $eventId]);
        if (!$stmt->fetchColumn()) throw new Exception("Pool does not belong to event.");

        // Delete pending matches involving this fighter (for this event)
        deletePendingMatchesForFighterInEvent($eventId, $fighterId);

        // Remove from PoolFighters (if present)
        $stmt = $pdo->prepare("DELETE FROM PoolFighters WHERE PoolId = ? AND FighterId = ?");
        $stmt->execute([$poolId, $fighterId]);

        // Remove from EventFighters (global to event)
        $stmt = $pdo->prepare("DELETE FROM EventFighters WHERE EventId = ? AND FighterId = ?");
        $stmt->execute([$eventId, $fighterId]);

        // Fresh roster (now missing removed fighter)
        $roster = getPoolRoster($poolId);

        $pdo->commit();
        echo json_encode([
            "status"  => "success",
            "message" => "Fighter removed from pool and event; pending matches deleted.",
            "poolId"  => $poolId,
            "roster"  => $roster
        ]);
    } catch (Exception $e) {
        if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}

echo json_encode(["status" => "error", "message" => "Unsupported action."]);
exit;
