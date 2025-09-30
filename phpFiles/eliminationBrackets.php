<?php
/**
 * phpFiles/eliminationBrackets.php
 *
 * === Elimination Brackets API ===
 * Handles single elimination bracket creation + fetching.
 * Rule: one scoring format per event.
 * - On create: clears Pools, PoolMatches, Brackets, BracketMatches, Matches for this event
 * - Builds fresh Bracket + Matches + BracketMatches
 * - On fetch: returns structured JSON of bracket tree
 *
 * Request (JSON):
 * {
 *   "action": "create" | "fetch",
 *   "eventId": number,
 *   // create-only:
 *   "bracketFormat": "S",
 *   "fighters": [fighterId, ...],   // required for create
 *   "maxPools": number,             // rings to distribute across (optional, default 1)
 *   "withBronze": true              // optional, default true
 * }
 */

require_once("connect.php");
header("Content-Type: application/json");

$method = $_SERVER["REQUEST_METHOD"];
$data = json_decode(file_get_contents("php://input"), true);

if (!$data || !isset($data["eventId"], $data["action"])) {
    echo json_encode(["status" => "error", "message" => "Invalid payload."]);
    exit;
}

$eventId = (int)$data["eventId"];
$action  = $data["action"];

try {
    $db = connect();

    if ($action === "create") {
        if (!isset($data["fighters"]) || !is_array($data["fighters"])) {
            echo json_encode(["status" => "error", "message" => "Fighters required for create."]);
            exit;
        }

        // Inputs
        $fighters    = array_values(array_filter($data["fighters"], fn($v) => $v !== null)); // sanitize
        $numFighters = count($fighters);
        if ($numFighters < 1) {
            echo json_encode(["status" => "error", "message" => "At least one fighter is required."]);
            exit;
        }

        $bracketFormat = isset($data["bracketFormat"]) ? strtoupper($data["bracketFormat"]) : 'S';
        if ($bracketFormat !== 'S') {
            echo json_encode(["status" => "error", "message" => "Only single elimination ('S') supported here."]);
            exit;
        }

        $maxPools   = isset($data["maxPools"]) && (int)$data["maxPools"] > 0 ? (int)$data["maxPools"] : 1;
        $withBronze = isset($data["withBronze"]) ? (bool)$data["withBronze"] : true;

        $db->beginTransaction();

        // --- 1) Wipe prior format data for this event ---
        $db->prepare("DELETE pm FROM PoolMatches pm JOIN Pools p ON pm.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
        $db->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);
        $db->prepare("DELETE bm FROM BracketMatches bm JOIN Brackets b ON bm.BracketId = b.BracketId WHERE b.EventId = ?")->execute([$eventId]);
        $db->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);
        $db->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);

        // --- 2) Create Bracket row ---
        $stmt = $db->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (?, 'S')");
        $stmt->execute([$eventId]);
        $bracketId = $db->lastInsertId();

        // --- 3) Compute bracket geometry (power-of-two with byes) ---
        $slots = 1;
        while ($slots < $numFighters) $slots <<= 1; // 2,4,8,16,32...
        $standardTotalRounds = (int)round(log($slots, 2)); // e.g., 23 => slots=32 => 5 rounds
        $totalRoundsForColumns = $standardTotalRounds + 1; // Bronze + Final columning

        $roundMatches = []; // BracketNo => [matchId,...]
        $globalQueue  = 1;

        // --- 4) Create Round 1 matches and assign fighters with distributed byes ---
        $round = 1;
        $roundMatches[$round] = [];
        $round1Matches = (int)($slots / 2);
        $byes          = $slots - $numFighters;

        // Pre-create Round 1 matches
        for ($m = 0; $m < $round1Matches; $m++) {
            $ring = ($m % $maxPools) + 1;
            $stmt = $db->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRing) VALUES (?, ?, ?)");
            $stmt->execute([$eventId, $globalQueue++, $ring]);
            $matchId = $db->lastInsertId();
            $roundMatches[$round][] = $matchId;

            $stmtB = $db->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, 'W')");
            $stmtB->execute([$bracketId, $matchId, $round]);
        }

        // Assign fighters sequentially
        $cur = 0;
        for ($m = 0; $m < $round1Matches; $m++) {
            $matchId = $roundMatches[$round][$m];
            $cap     = 2;

            // If we’ve run out of fighters, leave empty
            if ($cur >= $numFighters) continue;

            $fid1 = (int)$fighters[$cur++];
            $stmtMF = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId) VALUES (?, ?)");
            $stmtMF->execute([$matchId, $fid1]);

            if ($cur < $numFighters) {
                // Add second fighter if available
                $fid2 = (int)$fighters[$cur++];
                $stmtMF = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId) VALUES (?, ?)");
                $stmtMF->execute([$matchId, $fid2]);
            } else {
                // Only one fighter = bye => bump BracketNo forward by 1 for rendering
                $db->prepare("UPDATE BracketMatches SET BracketNo = BracketNo + 1 WHERE BracketId = ? AND MatchId = ?")
                   ->execute([$bracketId, $matchId]);
            }
        }

        // --- 5) Create intermediate rounds up to Semifinal ---
        for ($round = 2; $round <= $standardTotalRounds - 1; $round++) {
            $roundMatches[$round] = [];
            $numMatches = (int)pow(2, $standardTotalRounds - $round);

            for ($m = 0; $m < $numMatches; $m++) {
                $ring = ($m % $maxPools) + 1;
                $stmt = $db->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRing) VALUES (?, ?, ?)");
                $stmt->execute([$eventId, $globalQueue++, $ring]);
                $matchId = $db->lastInsertId();
                $roundMatches[$round][] = $matchId;

                $stmtB = $db->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, 'W')");
                $stmtB->execute([$bracketId, $matchId, $round]);
            }
        }

        // --- 6) Create Bronze and Final ---
        $bronzeBracketNo = $standardTotalRounds;
        $finalBracketNo  = $standardTotalRounds + 1;

        $bronzeMatchId = null;
        if ($withBronze) {
            $stmt = $db->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRing) VALUES (?, ?, ?)");
            $stmt->execute([$eventId, $globalQueue++, 1]);
            $bronzeMatchId = $db->lastInsertId();

            $stmtB = $db->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, 'W')");
            $stmtB->execute([$bracketId, $bronzeMatchId, $bronzeBracketNo]);
        }

        $stmt = $db->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRing) VALUES (?, ?, ?)");
        $stmt->execute([$eventId, $globalQueue++, 1]);
        $finalMatchId = $db->lastInsertId();

        $stmtB = $db->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, 'W')");
        $stmtB->execute([$bracketId, $finalMatchId, $finalBracketNo]);

        // --- 7) Wire NextMatchWin pointers ---
        for ($round = 1; $round <= $standardTotalRounds - 2; $round++) {
            $fromMatches = $roundMatches[$round] ?? [];
            $toMatches   = $roundMatches[$round + 1] ?? [];

            foreach ($fromMatches as $idx => $mid) {
                if (!isset($toMatches[(int)floor($idx / 2)])) continue;
                $target = $toMatches[(int)floor($idx / 2)];
                $db->prepare("UPDATE BracketMatches SET NextMatchWin = ? WHERE BracketId = ? AND MatchId = ?")
                   ->execute([$target, $bracketId, $mid]);
            }
        }

        // Semifinal winners → Final
        if (!empty($roundMatches[$standardTotalRounds - 1])) {
            foreach ($roundMatches[$standardTotalRounds - 1] as $sfMid) {
                $db->prepare("UPDATE BracketMatches SET NextMatchWin = ? WHERE BracketId = ? AND MatchId = ?")
                   ->execute([$finalMatchId, $bracketId, $sfMid]);
            }
        }

        // Semifinal losers → Bronze
        if ($withBronze && !empty($roundMatches[$standardTotalRounds - 1]) && $bronzeMatchId) {
            foreach ($roundMatches[$standardTotalRounds - 1] as $sfMid) {
                $db->prepare("UPDATE BracketMatches SET NextMatchLoss = ? WHERE BracketId = ? AND MatchId = ?")
                   ->execute([$bronzeMatchId, $bracketId, $sfMid]);
            }
        }

        $db->commit();

        // Return structured JSON
        $stmt = $db->prepare("
            SELECT bm.BracketId, bm.MatchId, bm.BracketNo, bm.NextMatchWin, bm.NextMatchLoss,
                   bm.BracketSection, m.MatchQueueNumber, m.MatchRing,
                   mf.FighterId, f.FighterName, f.ClubId
            FROM BracketMatches bm
            JOIN Matches m ON bm.MatchId = m.MatchId
            LEFT JOIN MatchFighters mf ON m.MatchId = mf.MatchId
            LEFT JOIN Fighters f ON mf.FighterId = f.FighterId
            WHERE bm.BracketId = ?
            ORDER BY bm.BracketNo, m.MatchId
        ");
        $stmt->execute([$bracketId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $rounds = [];
        foreach ($rows as $row) {
            $bno    = (int)$row['BracketNo'];
            $mid    = (int)$row['MatchId'];

            if (!isset($rounds[$bno])) $rounds[$bno] = [];
            if (!isset($rounds[$bno][$mid])) {
                $rounds[$bno][$mid] = [
                    "matchId"        => $mid,
                    "bracketNo"      => $bno,
                    "bracketSection" => $row['BracketSection'],
                    "matchRing"      => $row['MatchRing'] ? (int)$row['MatchRing'] : null,
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
            "status"      => "success",
            "message"     => "Bracket created.",
            "bracketId"   => (int)$bracketId,
            "format"      => "S",
            "hasBronze"   => $withBronze,
            "maxPools"    => (int)$maxPools,
            "rounds"      => $rounds
        ]);
        exit;
    }

    elseif ($action === "fetch") {
        $stmt = $db->prepare("
            SELECT bm.BracketId, bm.MatchId, bm.BracketNo, bm.NextMatchWin, bm.NextMatchLoss,
                   bm.BracketSection, m.MatchQueueNumber, m.MatchRing,
                   mf.FighterId, f.FighterName, f.ClubId,
                   b.BracketFormat
            FROM BracketMatches bm
            JOIN Brackets b ON bm.BracketId = b.BracketId
            JOIN Matches m ON bm.MatchId = m.MatchId
            LEFT JOIN MatchFighters mf ON m.MatchId = mf.MatchId
            LEFT JOIN Fighters f ON mf.FighterId = f.FighterId
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
                    "matchRing"      => $row['MatchRing'] ? (int)$row['MatchRing'] : null,
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

    else {
        echo json_encode(["status" => "error", "message" => "Unknown action."]);
        exit;
    }

} catch (Exception $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
