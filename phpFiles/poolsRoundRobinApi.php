<?php
/**
 * phpFiles/poolsRoundRobinApi.php
 *
 * === Round Robin Pools API ===
 * - POST ?action=save
 *   Wipes Matches/Pools/Brackets, inserts Pools+Matches+MatchFighters+PoolMatches,
 *   assigns rings 1..MaxRings cyclically,
 *   and returns structured JSON suitable for front-end editor.
 *
 * - GET ?action=get&eventId=123
 *   Returns structured pools + matches + fighters for the given event.
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

        // fetch pools for event
        $stmt = $db->prepare("SELECT * FROM Pools WHERE EventId = ? ORDER BY PoolNo ASC");
        $stmt->execute([$eventId]);
        $pools = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $structured = [];

        foreach ($pools as $pool) {
            $poolId = (int)$pool['PoolId'];
            $poolBlock = [
                "poolId" => $poolId,
                "poolNo" => (int)$pool['PoolNo'],
                "ringAssigned" => null,
                "matches" => []
            ];

            // fetch matches + fighters linked to this pool
            $stmtM = $db->prepare("
                SELECT m.MatchId, m.MatchRingNo, m.PendingActiveDone,
                       mf.FighterId, mf.FighterColor,
                       f.FighterName, f.ClubId, c.ClubAcronym
                FROM PoolMatches pm
                JOIN Matches m ON pm.MatchId = m.MatchId
                JOIN MatchFighters mf ON m.MatchId = mf.MatchId
                JOIN Fighters f ON mf.FighterId = f.FighterId
                LEFT JOIN Clubs c ON f.ClubId = c.ClubId
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
                        "matchId" => $mid,
                        "status" => $r['PendingActiveDone'],
                        "ringNo" => (int)$r['MatchRingNo'],
                        "fighters" => []
                    ];
                }
                $matches[$mid]["fighters"][] = [
                    "FighterId" => (int)$r['FighterId'],
                    "FighterColor" => $r['FighterColor'],
                    "FighterName" => $r['FighterName'],
                    "ClubId" => $r['ClubId'] ? (int)$r['ClubId'] : null,
                    "ClubAcronym" => $r['ClubAcronym']
                ];

                if ($poolBlock["ringAssigned"] === null) {
                    $poolBlock["ringAssigned"] = (int)$r['MatchRingNo'];
                }
            }

            $poolBlock["matches"] = array_values($matches);
            $structured[] = $poolBlock;
        }

        echo json_encode([
            "status" => "success",
            "pools" => $structured
        ]);
    } catch (Exception $e) {
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}


/* ------------------------------
   POST: save new pools
   ------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'save') {
    $data = json_decode(file_get_contents("php://input"), true);
    if (!$data || !isset($data['eventId'], $data['pools'])) {
        echo json_encode(["status" => "error", "message" => "Invalid payload."]);
        exit;
    }

    $eventId = (int)$data['eventId'];
    $deleteExisting = !empty($data['deleteExisting']);

    try {
        $db = connect();
        $db->beginTransaction();

        // Get MaxRings
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

        $poolsInserted = 0;
        $matchesInserted = 0;
        $poolMatchesInserted = 0;

        $poolRingCounter = 1;
        $structured = [];

        foreach ($data['pools'] as $pool) {
            $poolNo = (int)$pool['poolNo'];
            $fighterIds = $pool['fighterIds'] ?? [];
            $matches = $pool['matches'] ?? [];
            if (!$fighterIds || !$matches) continue;

            $stmt = $db->prepare("INSERT INTO Pools (EventId, PoolNo, MinFighters, MaxFighters)
                                  VALUES (?, ?, ?, ?)");
            $stmt->execute([$eventId, $poolNo, count($fighterIds), count($fighterIds)]);
            $poolId = $db->lastInsertId();
            $poolsInserted++;

            $assignedRing = $poolRingCounter;
            $poolRingCounter++;
            if ($poolRingCounter > $maxRings) $poolRingCounter = 1;

            $poolBlock = [
                "poolId" => (int)$poolId,
                "poolNo" => $poolNo,
                "ringAssigned" => $assignedRing,
                "matches" => []
            ];

            foreach ($matches as $pair) {
                if (count($pair) !== 2) continue;
                [$f1, $f2] = array_map('intval', $pair);

                $stmt = $db->prepare("INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo)
                                      VALUES (?, 'P', ?)");
                $stmt->execute([$eventId, $assignedRing]);
                $matchId = $db->lastInsertId();
                $matchesInserted++;

                $stmt = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor)
                                      VALUES (?, ?, ?)");
                $stmt->execute([$matchId, $f1, "Red"]);
                $stmt->execute([$matchId, $f2, "Blue"]);

                $stmt = $db->prepare("INSERT INTO PoolMatches (PoolId, MatchId) VALUES (?, ?)");
                $stmt->execute([$poolId, $matchId]);
                $poolMatchesInserted++;

                // --- Fetch enriched fighter info immediately ---
                $stmtF = $db->prepare("
                    SELECT f.FighterId, f.FighterName, f.ClubId, c.ClubAcronym, mf.FighterColor
                    FROM MatchFighters mf
                    JOIN Fighters f ON mf.FighterId = f.FighterId
                    LEFT JOIN Clubs c ON f.ClubId = c.ClubId
                    WHERE mf.MatchId = ?
                    ORDER BY mf.FighterColor ASC
                ");
                $stmtF->execute([$matchId]);
                $fighters = $stmtF->fetchAll(PDO::FETCH_ASSOC);

                $poolBlock["matches"][] = [
                    "matchId" => (int)$matchId,
                    "status" => "P",
                    "ringNo" => $assignedRing,
                    "fighters" => array_map(function($row) {
                        return [
                            "FighterId" => (int)$row['FighterId'],
                            "FighterColor" => $row['FighterColor'],
                            "FighterName" => $row['FighterName'],
                            "ClubId" => $row['ClubId'] ? (int)$row['ClubId'] : null,
                            "ClubAcronym" => $row['ClubAcronym']
                        ];
                    }, $fighters)
                ];
            }

            $structured[] = $poolBlock;
        }

        $db->commit();
        echo json_encode([
            "status" => "success",
            "poolsInserted" => $poolsInserted,
            "matchesInserted" => $matchesInserted,
            "poolMatchesInserted" => $poolMatchesInserted,
            "pools" => $structured
        ]);
    } catch (Exception $e) {
        if ($db && $db->inTransaction()) $db->rollBack();
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    exit;
}


echo json_encode(["status" => "error", "message" => "Unsupported action."]);
exit;
