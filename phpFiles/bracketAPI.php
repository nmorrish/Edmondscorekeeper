<?php
/**
 * API Handler for Brackets
 *
 * Supports:
 *  - POST  /api.php?resource=brackets
 *           → Create a bracket for an event; create initial matches with fighters/colors;
 *             wire NextMatchWin/Loss using submitted matchNo references.
 *
 *  - PATCH /api.php?resource=brackets&matchId=123
 *           → Piecemeal update OF A SINGLE MATCH inside a bracket:
 *               - ring (Matches.MatchRingNo)
 *               - status (Matches.PendingActiveDone)  // 'P'|'A'|'D'  (careful: trigger may fire)
 *               - fighters/colors (replace)           // allowed at any status
 *               - next pointers (BracketMatches.NextMatchWin / NextMatchLoss)
 *
 * POST payload shape (example):
 * {
 *   "eventId": 7,
 *   "bracketFormat": "D",               // 'S' = single, 'D' = double
 *   "matches": [
 *     {
 *       "matchNo": 1,
 *       "ring": 1,                      // optional, default 1
 *       "fighters": [                   // 0, 1 (bye), or 2 fighters; colors enforced on FE
 *         { "fighterId": 101, "color": "Red" },
 *         { "fighterId": 102, "color": "Blue" }
 *       ],
 *       "nextMatchWin": 5,              // references another match by matchNo in THIS payload
 *       "nextMatchLoss": 6              // only used in 'D'; ignored/NULL in 'S'
 *     },
 *     ...
 *   ]
 * }
 *
 * PATCH payload shape (example):
 * {
 *   "ring": 2,                          // optional
 *   "status": "P",                      // optional ('P'|'A'|'D')
 *   "fighters": [                       // optional; REPLACES roster; always allowed
 *     { "fighterId": 105, "color": "Red" },
 *     { "fighterId": 109, "color": "Blue" }
 *   ],
 *   "nextMatchWinId": 88,               // optional; target by MatchId
 *   "nextMatchLossId": null,            // optional; null clears pointer
 *   "nextMatchWinNo": 6,                // optional; reference by MatchNo (same bracket)
 *   "nextMatchLossNo": null
 * }
 *
 * Notes / Guarantees:
 *  - POST runs in a single transaction:
 *      1) Insert Brackets row
 *      2) Insert all Matches (Pending, ring=payload|1)
 *      3) Insert MatchFighters (0..2 per match)
 *      4) Insert BracketMatches rows (Next* set later)
 *      5) Resolve and set NextMatchWin/NextMatchLoss by matchNo mapping
 *  - PATCH is surgical and validates:
 *      - Match belongs to exactly one bracket (error if none/ambiguous)
 *      - Next pointers refer to matches in the same bracket
 *      - In Single-elim, NextMatchLoss is forced NULL
 */

require_once(__DIR__ . "/connect.php");
$db = connect();
header('Content-Type: application/json');

// ---------- helpers ----------

function bad($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(["status" => "error", "message" => $msg]);
    exit;
}

/** Validate fighter object: { fighterId:int, color:string<=15 non-empty } */
function validateFighter(array $f, int $idx = 0): array {
    if (!isset($f['fighterId']) || !is_numeric($f['fighterId'])) {
        throw new Exception("fighters[$idx].fighterId must be a number");
    }
    if (!isset($f['color']) || !is_string($f['color']) || trim($f['color']) === '') {
        throw new Exception("fighters[$idx].color must be a non-empty string");
    }
    if (mb_strlen($f['color']) > 15) {
        throw new Exception("fighters[$idx].color length exceeds 15");
    }
    return [
        'fighterId' => (int)$f['fighterId'],
        'color'     => trim($f['color']),
    ];
}

/** Ensure colors inside a single match are unique (case-insensitive) and fighterIds not duplicated */
function validateMatchRoster(array $fighters): void {
    if (count($fighters) > 2) {
        throw new Exception("A match can contain at most two fighters");
    }
    $colors = [];
    $ids    = [];
    foreach ($fighters as $i => $f) {
        $v = validateFighter($f, $i);
        $cKey = mb_strtolower($v['color']);
        if (isset($colors[$cKey])) {
            throw new Exception("Duplicate color '{$v['color']}' within the same match");
        }
        if (isset($ids[$v['fighterId']])) {
            throw new Exception("Duplicate fighterId '{$v['fighterId']}' within the same match");
        }
        $colors[$cKey] = true;
        $ids[$v['fighterId']] = true;
    }
}

/** Fetch one row or null */
function fetchOne(PDOStatement $stmt, array $params) {
    $stmt->execute($params);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

// ---------- routing ----------

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'POST') {
        // -------------------- CREATE BRACKET --------------------
        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE) bad("Invalid JSON");

        $eventId       = isset($input['eventId']) ? (int)$input['eventId'] : 0;
        $bracketFormat = isset($input['bracketFormat']) ? strtoupper(trim($input['bracketFormat'])) : '';
        $matchesIn     = $input['matches'] ?? [];

        if ($eventId <= 0) bad("eventId is required");
        if (!in_array($bracketFormat, ['S', 'D'], true)) bad("bracketFormat must be 'S' or 'D'");
        if (!is_array($matchesIn) || empty($matchesIn)) bad("matches[] is required and must be non-empty");

        // Validate event exists
        $evt = fetchOne($db->prepare("SELECT EventId FROM Events WHERE EventId = :id"), [':id' => $eventId]);
        if (!$evt) bad("Event not found", 404);

        // Pre-validate matchNos
        $matchNos   = [];
        $specs      = [];
        foreach ($matchesIn as $idx => $m) {
            if (!isset($m['matchNo']) || !is_numeric($m['matchNo'])) {
                throw new Exception("matches[$idx].matchNo must be numeric");
            }
            $matchNo = (int)$m['matchNo'];
            if (isset($matchNos[$matchNo])) {
                throw new Exception("Duplicate matchNo '$matchNo' in payload");
            }
            $matchNos[$matchNo] = true;

            $ring = isset($m['ring']) ? (int)$m['ring'] : 1;

            $fighters = $m['fighters'] ?? [];
            if (!is_array($fighters)) throw new Exception("matches[$idx].fighters must be an array");
            validateMatchRoster($fighters);

            $nextWinNo  = isset($m['nextMatchWin'])  ? (int)$m['nextMatchWin']  : null;
            $nextLossNo = isset($m['nextMatchLoss']) ? (int)$m['nextMatchLoss'] : null;
            if ($bracketFormat === 'S') {
                $nextLossNo = null;
            }

            $specs[] = [
                'matchNo'    => $matchNo,
                'ring'       => $ring,
                'fighters'   => array_map(fn($f) => ['fighterId' => (int)$f['fighterId'], 'color' => trim($f['color'])], $fighters),
                'nextWinNo'  => $nextWinNo,
                'nextLossNo' => $nextLossNo
            ];
        }

        $db->beginTransaction();

        // Insert Bracket
        $insBracket = $db->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (:eventId, :fmt)");
        $insBracket->execute([':eventId' => $eventId, ':fmt' => $bracketFormat]);
        $bracketId = (int)$db->lastInsertId();

        // Prepared statements
        $insMatch       = $db->prepare("INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo) VALUES (:eventId, 'P', :ring)");
        $insMatchFtr    = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (:mid, :fid, :color)");
        $insBracketLink = $db->prepare("INSERT INTO BracketMatches (BracketId, MatchId, MatchNo, NextMatchWin, NextMatchLoss) VALUES (:bid, :mid, :mno, NULL, NULL)");
        $updNexts       = $db->prepare("UPDATE BracketMatches SET NextMatchWin = :win, NextMatchLoss = :loss WHERE BracketId = :bid AND MatchId = :mid");

        // Pass 1: create Matches + BracketMatches
        $noToId = [];
        foreach ($specs as $s) {
            $insMatch->execute([':eventId' => $eventId, ':ring' => $s['ring']]);
            $mid = (int)$db->lastInsertId();

            $insBracketLink->execute([':bid' => $bracketId, ':mid' => $mid, ':mno' => $s['matchNo']]);

            foreach ($s['fighters'] as $f) {
                $insMatchFtr->execute([':mid' => $mid, ':fid' => $f['fighterId'], ':color' => $f['color']]);
            }
            $noToId[$s['matchNo']] = $mid;
        }

        // Pass 2: wire NextMatchWin/Loss
        foreach ($specs as $s) {
            $mid    = $noToId[$s['matchNo']];
            $winId  = null;
            $lossId = null;

            if (!is_null($s['nextWinNo'])) {
                if (!isset($noToId[$s['nextWinNo']])) throw new Exception("nextMatchWin points to unknown matchNo '{$s['nextWinNo']}'");
                $winId = $noToId[$s['nextWinNo']];
                if ($winId === $mid) throw new Exception("Match {$s['matchNo']} cannot point NextMatchWin to itself");
            }
            if ($bracketFormat === 'D' && !is_null($s['nextLossNo'])) {
                if (!isset($noToId[$s['nextLossNo']])) throw new Exception("nextMatchLoss points to unknown matchNo '{$s['nextLossNo']}'");
                $lossId = $noToId[$s['nextLossNo']];
                if ($lossId === $mid) throw new Exception("Match {$s['matchNo']} cannot point NextMatchLoss to itself");
            }

            $updNexts->execute([
                ':win' => $winId,
                ':loss'=> $lossId,
                ':bid' => $bracketId,
                ':mid' => $mid
            ]);
        }

        $db->commit();

        echo json_encode([
            "status"     => "success",
            "bracketId"  => $bracketId,
            "eventId"    => $eventId,
            "format"     => $bracketFormat,
            "matchIdMap" => $noToId
        ]);
        exit;
    }

    if ($method === 'PATCH') {
        // -------------------- UPDATE ONE MATCH --------------------
        $matchId = isset($_GET['matchId']) ? (int)$_GET['matchId'] : 0;
        if ($matchId <= 0) bad("matchId is required");

        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE) bad("Invalid JSON");

        // Match & bracket context
        $mStmt = $db->prepare("SELECT MatchId, EventId, PendingActiveDone, MatchRingNo FROM Matches WHERE MatchId = :mid");
        $match = fetchOne($mStmt, [':mid' => $matchId]);
        if (!$match) bad("Match not found", 404);

        $bmStmt = $db->prepare("SELECT BracketId, MatchNo FROM BracketMatches WHERE MatchId = :mid");
        $bmStmt->execute([':mid' => $matchId]);
        $brows = $bmStmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($brows) === 0) bad("Match is not part of any bracket", 409);
        if (count($brows) > 1)   bad("Match is part of multiple brackets; ambiguous", 409);

        $bracketId = (int)$brows[0]['BracketId'];
        $brStmt = $db->prepare("SELECT BracketFormat FROM Brackets WHERE BracketId = :bid");
        $br = fetchOne($brStmt, [':bid' => $bracketId]);
        if (!$br) bad("Bracket not found", 404);
        $format = $br['BracketFormat'];

        // Extract optional fields
        $newRing   = array_key_exists('ring', $input) ? (int)$input['ring'] : null;
        $newStatus = array_key_exists('status', $input) ? strtoupper((string)$input['status']) : null;
        $fightersPayload = $input['fighters'] ?? null;

        // Next pointers
        $winId  = $input['nextMatchWinId']  ?? null;
        $lossId = $input['nextMatchLossId'] ?? null;
        $winNo  = $input['nextMatchWinNo']  ?? null;
        $lossNo = $input['nextMatchLossNo'] ?? null;

        if (!is_null($newStatus) && !in_array($newStatus, ['P','A','D'], true)) {
            bad("status must be 'P', 'A', or 'D'");
        }
        if (!is_null($fightersPayload)) {
            if (!is_array($fightersPayload)) bad("fighters must be an array");
            validateMatchRoster($fightersPayload);
        }

        // Resolve next pointers
        $targetWinId = null;
        $targetLossId = null;
        $noToIdStmt = $db->prepare("SELECT MatchId FROM BracketMatches WHERE BracketId = :bid AND MatchNo = :mno");
        $existsStmt = $db->prepare("SELECT 1 FROM BracketMatches WHERE BracketId = :bid AND MatchId = :mid LIMIT 1");

        if (!is_null($winId)) {
            $targetWinId = (int)$winId;
            if ($targetWinId === $matchId) bad("nextMatchWin cannot point to self");
            if (!fetchOne($existsStmt, [':bid' => $bracketId, ':mid' => $targetWinId])) bad("nextMatchWinId not in bracket");
        } elseif (!is_null($winNo)) {
            $row = fetchOne($noToIdStmt, [':bid' => $bracketId, ':mno' => (int)$winNo]);
            if (!$row) bad("nextMatchWinNo not found");
            $targetWinId = (int)$row['MatchId'];
            if ($targetWinId === $matchId) bad("nextMatchWin cannot point to self");
        }

        if ($format === 'D') {
            if (!is_null($lossId)) {
                $targetLossId = (int)$lossId;
                if ($targetLossId === $matchId) bad("nextMatchLoss cannot point to self");
                if (!fetchOne($existsStmt, [':bid' => $bracketId, ':mid' => $targetLossId])) bad("nextMatchLossId not in bracket");
            } elseif (!is_null($lossNo)) {
                $row = fetchOne($noToIdStmt, [':bid' => $bracketId, ':mno' => (int)$lossNo]);
                if (!$row) bad("nextMatchLossNo not found");
                $targetLossId = (int)$row['MatchId'];
                if ($targetLossId === $matchId) bad("nextMatchLoss cannot point to self");
            }
        }

        // Apply updates
        $db->beginTransaction();
        if (!is_null($newRing)) {
            $db->prepare("UPDATE Matches SET MatchRingNo = :r WHERE MatchId = :mid")
               ->execute([':r' => $newRing, ':mid' => $matchId]);
        }
        if (!is_null($newStatus)) {
            $db->prepare("UPDATE Matches SET PendingActiveDone = :s WHERE MatchId = :mid")
               ->execute([':s' => $newStatus, ':mid' => $matchId]);
        }
        if (!is_null($targetWinId) || !is_null($targetLossId) ||
            array_key_exists('nextMatchWinId', $input) || array_key_exists('nextMatchWinNo', $input) ||
            array_key_exists('nextMatchLossId', $input) || array_key_exists('nextMatchLossNo', $input)) {
            $db->prepare("UPDATE BracketMatches SET NextMatchWin = :win, NextMatchLoss = :loss WHERE BracketId = :bid AND MatchId = :mid")
               ->execute([':win' => $targetWinId, ':loss' => $targetLossId, ':bid' => $bracketId, ':mid' => $matchId]);
        }
        if (!is_null($fightersPayload)) {
            $db->prepare("DELETE FROM MatchFighters WHERE MatchId = :mid")->execute([':mid' => $matchId]);
            $insMF = $db->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (:mid, :fid, :color)");
            foreach ($fightersPayload as $f) {
                $v = validateFighter($f);
                $insMF->execute([':mid' => $matchId, ':fid' => $v['fighterId'], ':color' => $v['color']]);
            }
        }
        $db->commit();

        $out = fetchOne(
            $db->prepare("
                SELECT m.MatchId, m.EventId, m.PendingActiveDone, m.MatchRingNo,
                       bm.BracketId, bm.MatchNo, bm.NextMatchWin, bm.NextMatchLoss
                FROM Matches m
                JOIN BracketMatches bm ON bm.MatchId = m.MatchId
                WHERE m.MatchId = :mid
            "),
            [':mid' => $matchId]
        );
        echo json_encode(["status" => "success", "match" => $out]);
        exit;
    }

    bad("Unsupported method for Brackets API", 405);

} catch (Exception $e) {
    if ($db && $db->inTransaction()) $db->rollBack();
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
} finally {
    $db = null;
}
?>
