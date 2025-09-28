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
 */

require_once("connect.php");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? null;

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
        $db = connect();
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
        $db = connect();
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
        $db = connect();
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

echo json_encode(["status" => "error", "message" => "Unsupported action."]);
exit;
