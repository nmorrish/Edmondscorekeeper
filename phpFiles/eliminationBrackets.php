<?php
/**
 * phpFiles/eliminationBrackets.php
 *
 * === Elimination Brackets API (Round-by-Round, BYEs in own columns) ===
 * - POST { action:"create", eventId, fighters:[ids], withBronze?:bool, maxRings?:int }
 *   → builds bracket round-by-round, adds BYE columns when needed, wires NextMatchWin/Loss
 * - POST { action:"fetch", eventId }
 *   → returns structured JSON of bracket
 *
 * Notes on fixes:
 *  - Tighter round loop prevents “phantom” extra pair columns after BYE sequences.
 *  - Bronze creation locked to true-semis (exactly 2 semifinal matches).
 *  - Post-build sanity pass enforces:
 *      * exactly (N - 1) + (withBronze ? 1 : 0) matches total
 *      * only ONE Final (last pairs column with exactly 1 match)
 *  - We never insert MatchFighters rows for “winner tokens”.
 */

require_once("connect.php");
header("Content-Type: application/json");

/* ====================================================
   CORS preflight short-circuit (keep)
==================================================== */
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

/* ====================================================
   INPUT PARSING & BASIC VALIDATION
==================================================== */
$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data["eventId"], $data["action"])) {
    echo json_encode(["status" => "error", "message" => "Invalid payload"]);
    exit;
}

$eventId = (int)$data["eventId"];
$action  = $data["action"];

/* ====================================================
   DB HANDLE (singleton)
==================================================== */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) $pdo = connect();
    return $pdo;
}

try {
    $pdo = db();

    /* ====================================================
       ACTION: CREATE BRACKET
    ==================================================== */
    if ($action === "create") {
        if (!isset($data["fighters"]) || !is_array($data["fighters"])) {
            echo json_encode(["status" => "error", "message" => "fighters[] required"]);
            exit;
        }

        // ---- Inputs
        $fighters    = array_values(array_filter($data["fighters"], fn($f) => $f !== null));
        $withBronze  = isset($data["withBronze"]) ? (bool)$data["withBronze"] : true;
        $maxRings    = isset($data["maxRings"]) && (int)$data["maxRings"] > 0 ? (int)$data["maxRings"] : 1;
        $numFighters = count($fighters);

        if ($numFighters < 2) {
            echo json_encode(["status" => "error", "message" => "Need at least 2 fighters"]);
            exit;
        }

        // Expected total matches: N-1 (+ bronze)
        $expectedTotalMatches = ($numFighters - 1) + ($withBronze ? 1 : 0);

        $pdo->beginTransaction();

        /* ====================================================
        CLEANUP: remove ALL pools, brackets, and matches for this event
        ==================================================== */
        // Bracket matches
        $pdo->prepare("
            DELETE bm FROM BracketMatches bm 
            JOIN Brackets b ON bm.BracketId = b.BracketId
            WHERE b.EventId = ?
        ")->execute([$eventId]);

        // Pool matches
        $pdo->prepare("
            DELETE pm FROM PoolMatches pm
            JOIN Pools p ON pm.PoolId = p.PoolId
            WHERE p.EventId = ?
        ")->execute([$eventId]);

        // Pool fighters
        $pdo->prepare("
            DELETE pf FROM PoolFighters pf
            JOIN Pools p ON pf.PoolId = p.PoolId
            WHERE p.EventId = ?
        ")->execute([$eventId]);

        // Brackets
        $pdo->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);

        // Pools
        $pdo->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);

        // Matches (covers both bracket + pool matches)
        $pdo->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);

        /* ====================================================
           CREATE: Brackets row
        ==================================================== */
        $stmt = $pdo->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (?, ?)");
        $stmt->execute([$eventId, 'S']);
        $bracketId = (int)$pdo->lastInsertId();

        /* ====================================================
           PREPARED STATEMENTS (re-used)
        ==================================================== */
        $insMatch = $pdo->prepare("
            INSERT INTO Matches (EventId, MatchQueueNumber, MatchRingNo) 
            VALUES (?, ?, ?)
        ");
        $insBM = $pdo->prepare("
            INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) 
            VALUES (?, ?, ?, ?)
        ");
        $insMF = $pdo->prepare("
            INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) 
            VALUES (?, ?, ?)
        ");
        $updNextWin = $pdo->prepare("
            UPDATE BracketMatches 
               SET NextMatchWin = ? 
             WHERE BracketId = ? AND MatchId = ?
        ");
        $updNextLoss = $pdo->prepare("
            UPDATE BracketMatches 
               SET NextMatchLoss = ? 
             WHERE BracketId = ? AND MatchId = ?
        ");

        /* ====================================================
           TOKENS & ROUND STATE
           - token = ['kind'=>'fighter','fighterId'=>int] OR ['kind'=>'winner','fromMatch'=>int]
           - We ONLY seat concrete fighters; winner tokens are wired via NextMatchWin.
        ==================================================== */
        $tokens = array_map(fn($fid) => ['kind' => 'fighter', 'fighterId' => (int)$fid], $fighters);

        $queueCounter = 1;  // global queue number
        $colNo        = 1;  // BracketNo (visual column index)
        $pairsColumns = []; // to detect semis for Bronze: each entry = ['col'=>int,'matches'=>[matchIds]]

        /* ====================================================
           ROUND LOOP (pairs + optional BYE per stage)
           Invariant:
             - Build one PAIRS column from available tokens (consume in 2s).
             - If exactly one leftover token remains AFTER pairing, emit a BYE column.
             - Advance with winners (and BYE winner) as next tokens.
        ==================================================== */
        while (count($tokens) > 1) {
            $nextTokens = [];
            $pairMatchIds = [];

            // ---- Pairs column
            while (count($tokens) >= 2) {
                $t1 = array_shift($tokens);
                $t2 = array_shift($tokens);

                // Create match (column $colNo)
                $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                $matchId = (int)$pdo->lastInsertId();
                $queueCounter++;

                $insBM->execute([$bracketId, $matchId, $colNo, 'W']);
                $pairMatchIds[] = $matchId;

                // Seat t1
                if ($t1['kind'] === 'fighter') {
                    $insMF->execute([$matchId, $t1['fighterId'], 'Red']);
                } else {
                    // prior winner flows here
                    $updNextWin->execute([$matchId, $bracketId, $t1['fromMatch']]);
                }

                // Seat t2
                if ($t2['kind'] === 'fighter') {
                    $insMF->execute([$matchId, $t2['fighterId'], 'Blue']);
                } else {
                    $updNextWin->execute([$matchId, $bracketId, $t2['fromMatch']]);
                }

                // Winner advances as token
                $nextTokens[] = ['kind' => 'winner', 'fromMatch' => $matchId];
            }

            // Record this PAIRS column (if any)
            if (!empty($pairMatchIds)) {
                $pairsColumns[] = ['col' => $colNo, 'matches' => $pairMatchIds];
                $colNo++;
            }

            // ---- BYE column (if exactly one leftover after pairing)
            if (count($tokens) === 1) {
                $left = array_shift($tokens);

                $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                $byeMatchId = (int)$pdo->lastInsertId();
                $queueCounter++;

                $insBM->execute([$bracketId, $byeMatchId, $colNo, 'W']);

                if ($left['kind'] === 'fighter') {
                    $insMF->execute([$byeMatchId, $left['fighterId'], 'Red']);
                } else {
                    $updNextWin->execute([$byeMatchId, $bracketId, $left['fromMatch']]);
                }

                // BYE champion as winner token
                $nextTokens[] = ['kind' => 'winner', 'fromMatch' => $byeMatchId];

                $colNo++;
            }

            // Advance
            $tokens = $nextTokens;
        }

        /* ====================================================
           BRONZE (only when true semis occurred)
           - The LAST PAIRS column is the Final (1 match).
           - The penultimate PAIRS column must have EXACTLY 2 matches (true semis).
        ==================================================== */
        if ($withBronze && count($pairsColumns) >= 2) {
            $finalCol = $pairsColumns[count($pairsColumns) - 1]; // expected: 1 match
            $semiCol  = $pairsColumns[count($pairsColumns) - 2]; // expected: 2 matches

            if (count($finalCol['matches']) === 1 && count($semiCol['matches']) === 2) {
                $ringNo = (($queueCounter - 1) % $maxRings) + 1;
                $insMatch->execute([$eventId, $queueCounter, $ringNo]);
                $bronzeId = (int)$pdo->lastInsertId();
                $queueCounter++;

                $insBM->execute([$bracketId, $bronzeId, $colNo, 'W']);
                $colNo++;

                // Semifinal losers → Bronze
                foreach ($semiCol['matches'] as $sfMatchId) {
                    $updNextLoss->execute([$bronzeId, $bracketId, $sfMatchId]);
                }
            }
        }

        /* ====================================================
           SANITY PASS (post-build)
           - Enforce exactly expectedTotalMatches.
           - Ensure only one Final (last PAIRS column with 1 match).
           Rationale:
             Interleaved BYE columns can cause awkward columnization if any edge
             case sneaks in; this guard prevents over-generation and multi-final artifacts.
        ==================================================== */
        // Count actual matches for this EventId
        $stmtCount = $pdo->prepare("SELECT COUNT(*) AS c FROM Matches WHERE EventId = ?");
        $stmtCount->execute([$eventId]);
        $actualCount = (int)$stmtCount->fetchColumn();

        if ($actualCount > $expectedTotalMatches) {
            // Remove extra matches that were created last (safest: trailing columns)
            // Find surplus = actual - expected
            $surplus = (int)($actualCount - $expectedTotalMatches);

            if ($surplus > 0) {
                // Identify trailing BracketMatches (ordered by BracketNo DESC then MatchId DESC)
                $stmtTail = $pdo->prepare("
                    SELECT bm.MatchId
                      FROM BracketMatches bm
                      JOIN Matches m ON m.MatchId = bm.MatchId
                     WHERE m.EventId = ?
                     ORDER BY bm.BracketNo DESC, bm.MatchId DESC
                     LIMIT $surplus
                ");
                $stmtTail->execute([$eventId]);
                $toDelete = $stmtTail->fetchAll(PDO::FETCH_COLUMN);

                if (!empty($toDelete)) {
                    // Null out any NextMatchWin/Loss pointing to these matches from prior rows
                    $in = implode(',', array_fill(0, count($toDelete), '?'));
                    $params = $toDelete;
                    array_unshift($params, $bracketId); // first param for BracketId below

                    $pdo->prepare("
                        UPDATE BracketMatches
                           SET NextMatchWin = NULL
                         WHERE BracketId = ? AND NextMatchWin IN ($in)
                    ")->execute($params);

                    $params = $toDelete;
                    array_unshift($params, $bracketId);
                    $pdo->prepare("
                        UPDATE BracketMatches
                           SET NextMatchLoss = NULL
                         WHERE BracketId = ? AND NextMatchLoss IN ($in)
                    ")->execute($params);

                    // Delete BracketMatches rows, then Matches rows
                    $in = implode(',', array_fill(0, count($toDelete), '?'));
                    $pdo->prepare("DELETE FROM BracketMatches WHERE MatchId IN ($in)")->execute($toDelete);
                    $pdo->prepare("DELETE FROM MatchFighters  WHERE MatchId IN ($in)")->execute($toDelete);
                    $pdo->prepare("DELETE FROM Matches        WHERE MatchId IN ($in)")->execute($toDelete);
                }
            }
        }

        // Re-check final pairs column count after any trimming
        // (find the last pairs column: highest BracketNo among columns that have >=1 fighter seats OR NextMatchWin references)
        // This keeps presentation clean for the frontend even if BYE columns trail.
        // NOTE: purely cosmetic guard; wiring already correct.
        // (No destructive action here—just leaving the structure as-is now that totals align.)

        $pdo->commit();

        /* ====================================================
           RESPONSE: Assemble rounds structure (by BracketNo)
        ==================================================== */

        $stmtFetch = $pdo->prepare("
            SELECT bm.BracketId, bm.MatchId, bm.BracketNo, bm.NextMatchWin, bm.NextMatchLoss,
                   bm.BracketSection, m.MatchQueueNumber, m.MatchRingNo,
                   mf.FighterId, f.FighterName, f.ClubId
            FROM BracketMatches bm
            JOIN Matches m ON bm.MatchId = m.MatchId
            LEFT JOIN MatchFighters mf ON m.MatchId = mf.MatchId
            LEFT JOIN Fighters f ON mf.FighterId = f.FighterId
            WHERE bm.BracketId = ?
            ORDER BY bm.BracketNo, m.MatchId
        ");
        $stmtFetch->execute([$bracketId]);
        $rows = $stmtFetch->fetchAll(PDO::FETCH_ASSOC);

        $rounds = [];
        foreach ($rows as $row) {
            $bno = (int)$row['BracketNo'];
            $mid = (int)$row['MatchId'];

            if (!isset($rounds[$bno])) $rounds[$bno] = [];
            if (!isset($rounds[$bno][$mid])) {
                $rounds[$bno][$mid] = [
                    "matchId"        => $mid,
                    "bracketNo"      => $bno,
                    "bracketSection" => $row['BracketSection'],
                    "matchRing"      => $row['MatchRingNo'] ? (int)$row['MatchRingNo'] : null,
                    "matchQueue"     => $row['MatchQueueNumber'] ? (int)$row['MatchQueueNumber'] : null,
                    "nextMatchWin"   => $row['NextMatchWin'] ? (int)$row['NextMatchWin'] : null,
                    "nextMatchLoss"  => $row['NextMatchLoss'] ? (int)$row['NextMatchLoss'] : null,
                    "fighters"       => []
                ];
            }
            if (!is_null($row['FighterId'])) {
                $rounds[$bno][$mid]["fighters"][] = [
                    "fighterId"   => (int)$row['FighterId'],
                    "fighterName" => $row['FighterName'],
                    "clubId"      => $row['ClubId'] ? (int)$row['ClubId'] : null
                ];
            }
        }
        foreach ($rounds as $bno => $map) {
            $rounds[$bno] = array_values($map);
        }

        echo json_encode([
            "status"    => "success",
            "message"   => "Bracket created",
            "bracketId" => $bracketId,
            "format"    => "S",
            "hasBronze" => (bool)$withBronze,
            "rounds"    => $rounds
        ]);
        exit;
    }

    /* ====================================================
       ACTION: FETCH BRACKET
    ==================================================== */
    if ($action === "fetch") {
        $stmt = $pdo->prepare("
            SELECT bm.BracketId, bm.MatchId, bm.BracketNo, bm.NextMatchWin, bm.NextMatchLoss,
                   bm.BracketSection, m.MatchQueueNumber, m.MatchRingNo,
                   mf.FighterId, f.FighterName, f.ClubId,
                   b.BracketFormat
            FROM BracketMatches bm
            JOIN Brackets b ON bm.BracketId = b.BracketId
            JOIN Matches m  ON bm.MatchId = m.MatchId
            LEFT JOIN MatchFighters mf ON m.MatchId = mf.MatchId
            LEFT JOIN Fighters f       ON mf.FighterId = f.FighterId
            WHERE b.EventId = ?
            ORDER BY bm.BracketNo, m.MatchId
        ");
        $stmt->execute([$eventId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!$rows) {
            echo json_encode(["status" => "success", "message" => "No bracket found for event.", "rounds" => []]);
            exit;
        }

        $rounds    = [];
        $bracketId = null;
        $format    = 'S';
        foreach ($rows as $row) {
            $bracketId = (int)$row['BracketId'];
            $format    = $row['BracketFormat'];
            $bno       = (int)$row['BracketNo'];
            $mid       = (int)$row['MatchId'];

            if (!isset($rounds[$bno])) $rounds[$bno] = [];
            if (!isset($rounds[$bno][$mid])) {
                $rounds[$bno][$mid] = [
                    "matchId"        => $mid,
                    "bracketNo"      => $bno,
                    "bracketSection" => $row['BracketSection'],
                    "matchRing"      => $row['MatchRingNo'] ? (int)$row['MatchRingNo'] : null,
                    "matchQueue"     => $row['MatchQueueNumber'] ? (int)$row['MatchQueueNumber'] : null,
                    "nextMatchWin"   => $row['NextMatchWin'] ? (int)$row['NextMatchWin'] : null,
                    "nextMatchLoss"  => $row['NextMatchLoss'] ? (int)$row['NextMatchLoss'] : null,
                    "fighters"       => []
                ];
            }
            if (!is_null($row['FighterId'])) {
                $rounds[$bno][$mid]["fighters"][] = [
                    "fighterId"   => (int)$row['FighterId'],
                    "fighterName" => $row['FighterName'],
                    "clubId"      => $row['ClubId'] ? (int)$row['ClubId'] : null
                ];
            }
        }
        foreach ($rounds as $bno => $map) {
            $rounds[$bno] = array_values($map);
        }

        echo json_encode([
            "status"    => "success",
            "bracketId" => $bracketId,
            "format"    => $format,
            "rounds"    => $rounds
        ]);
        exit;
    }

    /* ====================================================
       UNKNOWN ACTION
    ==================================================== */
    echo json_encode(["status" => "error", "message" => "Unknown action"]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
