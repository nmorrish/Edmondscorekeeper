<?php
/**
 * API Handler for Pools
 *
 * Supports (when routed via /api.php?resource=pools OR directly as /api/pools.php):
 *  - GET    /api.php?resource=pools&eventId=1
 *           → List all pools for an event, including matches + fighters in those matches.
 *
 *  - POST   /api.php?resource=pools
 *           → Create or update pools in batch ("merge" mode by default).
 *              Optionally remove missing PENDING matches via `removeMissingPending=true`.
 *
 *  - DELETE /api.php?resource=pools&id=5
 *           → Delete an entire pool.
 *             Only matches in Pending ('P') status are deleted; Active/Done remain.
 *
 * POST request body format (batch):
 * {
 *   "eventId": 3,
 *   "removeMissingPending": true,     // optional; default false (merge-only)
 *   "pools": [
 *     {
 *       "poolNo": 1,
 *       "minFighters": 4,
 *       "maxFighters": 5,
 *       "fighters": [
 *         { "fighterId": 12, "color": "Red" },
 *         { "fighterId": 14, "color": "Blue" },
 *         { "fighterId": 15, "color": "Green" }
 *       ]
 *     },
 *     {
 *       "poolNo": 2,
 *       "minFighters": 4,
 *       "maxFighters": 6,
 *       "fighters": [
 *         { "fighterId": 16, "color": "Red" },
 *         { "fighterId": 18, "color": "Blue" },
 *         { "fighterId": 20, "color": "Green" }
 *       ]
 *     }
 *   ]
 * }
 *
 * Behavior / Notes:
 *  - Pools are unique per (EventId, PoolNo). This handler upserts pool rows.
 *  - For each pool, generates all pairwise matches between fighters in the submitted list.
 *    - If a pair doesn't exist yet in this pool, a new Match is created (status 'P', ring=1),
 *      and two rows are inserted into MatchFighters using the provided colors (varchar(15)).
 *    - If a pair already exists, it is left as-is (colors are NOT changed server-side).
 *      The front end should manage color consistency across the pool.
 *  - Optional cleanup: if `removeMissingPending=true`, any PENDING matches in the pool that
 *    are not part of the newly submitted pairs are safely deleted (including MatchFighters,
 *    PoolMatches link, and any stray MatchExchanges for safety).
 *  - DELETE pool: removes only PENDING matches; Active ('A') and Done ('D') matches
 *    are preserved. Then deletes the pool row.
 */

require_once(__DIR__ . "/connect.php");
$db = connect();

// JSON response
header('Content-Type: application/json');

/**
 * Helper: validate a fighter payload entry { fighterId, color }
 */
function validateFighterEntry(array $fighter): void {
    if (!isset($fighter['fighterId']) || !is_numeric($fighter['fighterId'])) {
        throw new Exception("fighters[].fighterId must be a number");
    }
    if (!isset($fighter['color']) || !is_string($fighter['color']) || trim($fighter['color']) === '') {
        throw new Exception("fighters[].color must be a non-empty string");
    }
    if (mb_strlen($fighter['color']) > 15) {
        throw new Exception("fighters[].color exceeds 15 characters");
    }
}

/**
 * Helper: produce a normalized pair key "minId-maxId" (order independent)
 */
function pairKey(int $a, int $b): string {
    return ($a < $b) ? "{$a}-{$b}" : "{$b}-{$a}";
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        // -------------------- GET: list pools for an event --------------------
        $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : null;
        if (!$eventId) {
            throw new Exception("Missing eventId for GET /pools");
        }

        // Fetch pools for the event
        $stmt = $db->prepare("SELECT PoolId, EventId, PoolNo, MinFighters, MaxFighters FROM Pools WHERE EventId = :eventId ORDER BY PoolNo ASC");
        $stmt->execute([':eventId' => $eventId]);
        $pools = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Attach matches (flat rows: one row per match-fighter) for each pool
        foreach ($pools as &$pool) {
            $stmt = $db->prepare("
                SELECT 
                    m.MatchId,
                    m.EventId,
                    m.PendingActiveDone,
                    m.MatchRingNo,
                    mf.FighterId,
                    mf.FighterColor,
                    f.FighterName
                FROM PoolMatches pm
                JOIN Matches m        ON pm.MatchId = m.MatchId
                JOIN MatchFighters mf ON m.MatchId  = mf.MatchId
                JOIN Fighters f       ON mf.FighterId = f.FighterId
                WHERE pm.PoolId = :poolId
                ORDER BY m.MatchId ASC
            ");
            $stmt->execute([':poolId' => $pool['PoolId']]);
            $pool['matches'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }

        echo json_encode([
            "status" => "success",
            "pools"  => $pools
        ]);
        exit;
    }

    if ($method === 'POST') {
        // -------------------- POST: batch create/update pools --------------------
        $input = json_decode(file_get_contents("php://input"), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("Invalid JSON in request body");
        }

        $eventId = isset($input['eventId']) ? (int)$input['eventId'] : null;
        $poolsIn = $input['pools'] ?? [];
        $removeMissingPending = isset($input['removeMissingPending']) ? (bool)$input['removeMissingPending'] : false;

        if (!$eventId || !is_array($poolsIn)) {
            throw new Exception("Invalid payload: eventId and pools[] are required");
        }

        // Wrap entire batch in a transaction
        $db->beginTransaction();

        // Prepared statements reused in loops
        $selPoolStmt = $db->prepare("SELECT PoolId FROM Pools WHERE EventId = :eventId AND PoolNo = :poolNo");
        $updPoolStmt = $db->prepare("UPDATE Pools SET MinFighters = :min, MaxFighters = :max WHERE PoolId = :poolId");
        $insPoolStmt = $db->prepare("INSERT INTO Pools (EventId, PoolNo, MinFighters, MaxFighters) VALUES (:eventId, :poolNo, :min, :max)");

        $findMatchStmt = $db->prepare("
            SELECT m.MatchId
            FROM PoolMatches pm
            JOIN Matches m        ON pm.MatchId = m.MatchId
            JOIN MatchFighters a  ON m.MatchId  = a.MatchId AND a.FighterId = :f1
            JOIN MatchFighters b  ON m.MatchId  = b.MatchId AND b.FighterId = :f2
            WHERE pm.PoolId = :poolId
            LIMIT 1
        ");

        $insMatchStmt = $db->prepare("INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo) VALUES (:eventId, 'P', 1)");
        $insPoolMatchStmt = $db->prepare("INSERT INTO PoolMatches (PoolId, MatchId) VALUES (:poolId, :matchId)");
        $insMatchFighterStmt = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (:matchId, :fighterId, :color)");

        $selPendingMatchesStmt = $db->prepare("
            SELECT m.MatchId
            FROM PoolMatches pm
            JOIN Matches m ON pm.MatchId = m.MatchId
            WHERE pm.PoolId = :poolId AND m.PendingActiveDone = 'P'
        ");
        $selMatchFightersStmt = $db->prepare("SELECT FighterId FROM MatchFighters WHERE MatchId = :matchId");

        $delPoolMatchStmt     = $db->prepare("DELETE FROM PoolMatches WHERE PoolId = :poolId AND MatchId = :matchId");
        $delMatchExchangesStmt= $db->prepare("DELETE FROM MatchExchanges WHERE MatchId = :matchId");
        $delMatchFightersStmt = $db->prepare("DELETE FROM MatchFighters WHERE MatchId = :matchId");
        $delMatchStmt         = $db->prepare("DELETE FROM Matches WHERE MatchId = :matchId");

        foreach ($poolsIn as $poolData) {
            // Basic pool fields
            if (!isset($poolData['poolNo']) || !is_numeric($poolData['poolNo'])) {
                throw new Exception("Each pool requires a numeric poolNo");
            }
            $poolNo       = (int)$poolData['poolNo'];
            $minFighters  = isset($poolData['minFighters']) ? (int)$poolData['minFighters'] : 4;
            $maxFighters  = isset($poolData['maxFighters']) ? (int)$poolData['maxFighters'] : 5;
            $fightersList = $poolData['fighters'] ?? [];

            // Validate fighters payload entries and de-duplicate by fighterId (last color wins)
            $fightersById = [];
            foreach ($fightersList as $f) {
                if (!is_array($f)) {
                    throw new Exception("fighters[] must be objects { fighterId, color }");
                }
                validateFighterEntry($f);
                $fid = (int)$f['fighterId'];
                $color = trim($f['color']);
                $fightersById[$fid] = $color; // overwrite duplicates by last occurrence
            }

            // Upsert pool
            $selPoolStmt->execute([':eventId' => $eventId, ':poolNo' => $poolNo]);
            $existing = $selPoolStmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                $poolId = (int)$existing['PoolId'];
                $updPoolStmt->execute([':min' => $minFighters, ':max' => $maxFighters, ':poolId' => $poolId]);
            } else {
                $insPoolStmt->execute([
                    ':eventId' => $eventId,
                    ':poolNo'  => $poolNo,
                    ':min'     => $minFighters,
                    ':max'     => $maxFighters
                ]);
                $poolId = (int)$db->lastInsertId();
            }

            // Generate all pairwise matchups for current fighters set
            $fighterIds = array_keys($fightersById);
            $newPairs   = []; // track newly-desired pairs: key => true

            $n = count($fighterIds);
            for ($i = 0; $i < $n; $i++) {
                for ($j = $i + 1; $j < $n; $j++) {
                    $f1 = (int)$fighterIds[$i];
                    $f2 = (int)$fighterIds[$j];
                    $k  = pairKey($f1, $f2);
                    $newPairs[$k] = true;

                    // Prevent same color vs same color in a single match (DB unique(FighterColor) would also reject)
                    $color1 = $fightersById[$f1];
                    $color2 = $fightersById[$f2];
                    if (strcasecmp($color1, $color2) === 0) {
                        throw new Exception("Pool {$poolNo}: fighters {$f1} and {$f2} share color '{$color1}'. Colors must differ per match.");
                    }

                    // Check if match already exists in this pool for this pair (order independent)
                    $findMatchStmt->execute([
                        ':f1' => $f1,
                        ':f2' => $f2,
                        ':poolId' => $poolId
                    ]);
                    $existingMatch = $findMatchStmt->fetch(PDO::FETCH_ASSOC);

                    if (!$existingMatch) {
                        // Create Pending match (ring defaults to 1 — adjustable later via Matches API)
                        $insMatchStmt->execute([':eventId' => $eventId]);
                        $matchId = (int)$db->lastInsertId();

                        // Bridge to pool
                        $insPoolMatchStmt->execute([':poolId' => $poolId, ':matchId' => $matchId]);

                        // Insert fighters with explicit colors from payload
                        $insMatchFighterStmt->execute([
                            ':matchId'   => $matchId,
                            ':fighterId' => $f1,
                            ':color'     => $color1
                        ]);
                        $insMatchFighterStmt->execute([
                            ':matchId'   => $matchId,
                            ':fighterId' => $f2,
                            ':color'     => $color2
                        ]);
                    }
                    // If it exists: we leave it unchanged (no server-side color mutation).
                }
            }

            // Optional cleanup: remove PENDING matches that are no longer in the submitted pairs
            if ($removeMissingPending) {
                $selPendingMatchesStmt->execute([':poolId' => $poolId]);
                $pending = $selPendingMatchesStmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($pending as $row) {
                    $mid = (int)$row['MatchId'];
                    // Load the fighters for this match
                    $selMatchFightersStmt->execute([':matchId' => $mid]);
                    $rows = $selMatchFightersStmt->fetchAll(PDO::FETCH_ASSOC);
                    if (count($rows) < 2) {
                        // Inconsistent half-formed match — safe to delete
                        $delPoolMatchStmt->execute([':poolId' => $poolId, ':matchId' => $mid]);
                        $delMatchExchangesStmt->execute([':matchId' => $mid]); // safety
                        $delMatchFightersStmt->execute([':matchId' => $mid]);
                        $delMatchStmt->execute([':matchId' => $mid]);
                        continue;
                    }
                    $ids = array_map(fn($r) => (int)$r['FighterId'], $rows);
                    // Build pair key
                    $key = pairKey($ids[0], $ids[1]);

                    // If this pending match's pair is NOT desired anymore, delete it
                    if (!isset($newPairs[$key])) {
                        $delPoolMatchStmt->execute([':poolId' => $poolId, ':matchId' => $mid]);
                        $delMatchExchangesStmt->execute([':matchId' => $mid]); // safety (should be none for 'P')
                        $delMatchFightersStmt->execute([':matchId' => $mid]);
                        $delMatchStmt->execute([':matchId' => $mid]);
                    }
                }
            }
        } // end foreach poolsIn

        $db->commit();

        echo json_encode([
            "status"  => "success",
            "message" => "Pools updated successfully",
            "mode"    => $removeMissingPending ? "merge+prune(Pending)" : "merge-only"
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        // -------------------- DELETE: remove a pool (safe mode) --------------------
        $poolId = isset($_GET['id']) ? (int)$_GET['id'] : null;
        if (!$poolId) {
            throw new Exception("Missing poolId for DELETE /pools");
        }

        $db->beginTransaction();

        // Find matches linked to this pool, grouped by status
        $stmt = $db->prepare("
            SELECT m.MatchId, m.PendingActiveDone
            FROM PoolMatches pm
            JOIN Matches m ON pm.MatchId = m.MatchId
            WHERE pm.PoolId = :poolId
        ");
        $stmt->execute([':poolId' => $poolId]);
        $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Delete only Pending matches; preserve Active/Done
        $delPoolMatchStmt     = $db->prepare("DELETE FROM PoolMatches WHERE PoolId = :poolId AND MatchId = :matchId");
        $delMatchExchangesStmt= $db->prepare("DELETE FROM MatchExchanges WHERE MatchId = :matchId"); // safety
        $delMatchFightersStmt = $db->prepare("DELETE FROM MatchFighters WHERE MatchId = :matchId");
        $delMatchStmt         = $db->prepare("DELETE FROM Matches WHERE MatchId = :matchId");

        foreach ($matches as $m) {
            if ($m['PendingActiveDone'] === 'P') {
                $mid = (int)$m['MatchId'];
                $delPoolMatchStmt->execute([':poolId' => $poolId, ':matchId' => $mid]);
                $delMatchExchangesStmt->execute([':matchId' => $mid]); // should be none for 'P', but safe
                $delMatchFightersStmt->execute([':matchId' => $mid]);
                $delMatchStmt->execute([':matchId' => $mid]);
            }
        }

        // Remove the pool row itself (will fail if FK restrictions exist elsewhere, which they don't here)
        $stmt = $db->prepare("DELETE FROM Pools WHERE PoolId = :poolId");
        $stmt->execute([':poolId' => $poolId]);

        $db->commit();

        echo json_encode([
            "status"  => "success",
            "message" => "Pool deleted. Pending matches removed; Active/Done preserved."
        ]);
        exit;
    }

    // Unsupported method
    throw new Exception("Unsupported HTTP method for Pools API");
}
catch (Exception $e) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    echo json_encode([
        "status"  => "error",
        "message" => $e->getMessage()
    ]);
}
finally {
    $db = null;
}


?>