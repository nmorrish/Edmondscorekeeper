<?php
/**
 * phpFiles/bracketSeeding.php
 *
 * === Bracket Orchestrator (Single + Double Elimination) ===
 *
 * Owns all shared concerns:
 *   - Request routing (action: create | fetch)
 *   - Seeding (FighterSkill DESC, FighterId ASC) + club distribution
 *   - Cleanup / transaction wrapper
 *   - Persistence: abstract-id -> MatchId map, BracketMatches wiring, fighter seating
 *   - fetchRounds() response builder (shared by both formats)
 *
 * Delegates tree-building to:
 *   - singleElim.php : buildSingleElim(seededFighters, withBronze)
 *   - doubleElim.php : buildDoubleElim(seededFighters, withGrandFinalReset)
 *
 * Builder contract (both must return):
 *   [
 *     'matches' => [
 *       [
 *         'id'      => int,                 // abstract id (unique within build)
 *         'round'   => int,                 // BracketNo (WB positive, LB negative,
 *                                           //   GF continues positive after WB final)
 *         'section' => 'W' | 'L',           // BracketSection (GF uses 'W')
 *         'left'    => SLOT,
 *         'right'   => SLOT,
 *         'role'    => 'final'|'bronze'|'grandFinal'|'grandFinalReset'|null,
 *       ], ...
 *     ]
 *   ]
 *   SLOT = ['fighterId'=>int] | ['fromMatch'=>int, 'as'?=>'loser'] | null (BYE)
 *
 * POST { action:"create", eventId, fighters:[ids], format?:"S"|"D",
 *        withBronze?:bool, withGrandFinalReset?:bool, maxRings?:int }
 * POST { action:"fetch", eventId }
 */

require_once(__DIR__ . "/connect.php");
require_once(__DIR__ . "/singleElim.php");
require_once(__DIR__ . "/doubleElim.php");

header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
if (!$data || !isset($data["eventId"], $data["action"])) {
    echo json_encode(["status" => "error", "message" => "Invalid payload"]);
    exit;
}

$eventId = (int)$data["eventId"];
$action  = $data["action"];

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) $pdo = connect();
    return $pdo;
}

/**
 * Standard bracket seed slot order for a bracket of size $size (power of 2).
 * Returns 1-based seed positions, e.g. size 8 => [1,8,4,5,2,7,3,6].
 * Pairing adjacent entries gives (1v8)(4v5)(2v7)(3v6).
 *
 * Shared by both builders (single + double elim winners' tree).
 */
function seedSlots(int $size): array {
    $slots = [1, 2];
    while (count($slots) < $size) {
        $n = count($slots) * 2;
        $next = [];
        foreach ($slots as $s) {
            $next[] = $s;
            $next[] = $n + 1 - $s;
        }
        $slots = $next;
    }
    return $slots;
}

/**
 * Seed fighters by skill, distributing clubs so same-club fighters are
 * spaced apart in the seed order (separates them in early rounds).
 *
 * Strategy:
 *  - Input rows are pre-sorted by FighterSkill DESC, FighterId ASC.
 *  - Group into skill "bands" the width of the distinct club count, so each
 *    band holds at most one fighter per club where possible.
 *  - Within each band, order fighters round-robin by club so no two adjacent
 *    seeds share a club unless a club's volume forces it.
 *
 * @param array $rows  [['FighterId'=>int,'ClubId'=>int|null], ...] pre-sorted by skill
 * @return array fighterIds in club-distributed seed order
 */
function distributeByClub(array $rows): array {
    $n = count($rows);
    if ($n <= 2) return array_map(fn($r) => (int)$r['FighterId'], $rows);

    // Distinct clubs present (null club treated as its own bucket per fighter)
    $clubKey = function ($r) {
        return $r['ClubId'] !== null ? 'c' . (int)$r['ClubId'] : 'n' . (int)$r['FighterId'];
    };
    $distinctClubs = count(array_unique(array_map($clubKey, $rows)));
    $band = max(2, $distinctClubs);   // band width

    $seeded = [];
    // Process skill-sorted rows band by band so we never pull a low-skill
    // fighter ahead of a meaningfully higher-skilled one.
    for ($start = 0; $start < $n; $start += $band) {
        $slice = array_slice($rows, $start, $band);

        // Bucket this band's fighters by club, preserving skill order within club
        $buckets = [];
        foreach ($slice as $r) {
            $buckets[$clubKey($r)][] = $r;
        }
        // Order buckets by size desc (spread the biggest clubs out first),
        // then round-robin draw one fighter at a time across buckets.
        uasort($buckets, fn($a, $b) => count($b) <=> count($a));
        $bucketLists = array_values($buckets);

        $drained = false;
        while (!$drained) {
            $drained = true;
            foreach ($bucketLists as &$bl) {
                if (!empty($bl)) {
                    $seeded[] = array_shift($bl);
                    $drained = false;
                }
            }
            unset($bl);
        }
    }

    return array_map(fn($r) => (int)$r['FighterId'], $seeded);
}

/**
 * Sort helper for ordering matches into the queue.
 * WB rounds are positive, LB rounds negative, GF continues positive.
 * We want a sane play order: lower (incl. negative) rounds first, then by id.
 * Numeric ascending on round already does this; passthrough kept for safety.
 */
function roundRank($round): int {
    return is_numeric($round) ? (int)$round : PHP_INT_MAX;
}

/**
 * Seed fighters for an event: query by skill, then distribute by club.
 *
 * @return array fighterIds in final seed order
 */
function seedFighters(PDO $pdo, array $fighterIds): array {
    $in = implode(',', array_fill(0, count($fighterIds), '?'));
    $seedStmt = $pdo->prepare("
        SELECT FighterId, ClubId
          FROM Fighters
         WHERE FighterId IN ($in)
         ORDER BY (FighterSkill IS NULL) ASC, FighterSkill DESC, FighterId ASC
    ");
    $seedStmt->execute($fighterIds);
    $seedRows = $seedStmt->fetchAll(PDO::FETCH_ASSOC);
    return distributeByClub($seedRows);
}

/**
 * Wipe existing bracket/pool/match data for an event.
 */
function cleanupEvent(PDO $pdo, int $eventId): void {
    $pdo->prepare("DELETE bm FROM BracketMatches bm JOIN Brackets b ON bm.BracketId = b.BracketId WHERE b.EventId = ?")->execute([$eventId]);
    $pdo->prepare("DELETE pm FROM PoolMatches pm JOIN Pools p ON pm.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
    $pdo->prepare("DELETE pf FROM PoolFighters pf JOIN Pools p ON pf.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
    $pdo->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);
    $pdo->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);
    $pdo->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);
}

/**
 * Persist a built bracket (format-blind).
 *
 * Reads the builder contract:
 *   - section -> BracketSection
 *   - round   -> BracketNo
 *   - slots   -> seating (fighterId) or wiring (fromMatch + optional as=loser)
 *
 * @param array $matches builder matches[]
 * @return int bracketId
 */
function persistBracket(PDO $pdo, int $eventId, string $format, array $matches, int $maxRings): int {
    $stmt = $pdo->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (?, ?)");
    $stmt->execute([$eventId, $format]);
    $bracketId = (int)$pdo->lastInsertId();

    $insMatch    = $pdo->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRingNo) VALUES (?, ?, ?)");
    $insBM       = $pdo->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, ?)");
    $insMF       = $pdo->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (?, ?, ?)");
    $updNextWin  = $pdo->prepare("UPDATE BracketMatches SET NextMatchWin  = ? WHERE BracketId = ? AND MatchId = ?");
    $updNextLoss = $pdo->prepare("UPDATE BracketMatches SET NextMatchLoss = ? WHERE BracketId = ? AND MatchId = ?");

    // Order matches by round then id so queue/ring numbering is sane.
    // Negative (LB) rounds sort before positive (WB/GF); that is fine for
    // queueing — the queue is just a play-order hint, not bracket structure.
    usort($matches, fn($x, $y) =>
        ($x['round'] === $y['round'])
            ? $x['id'] <=> $y['id']
            : roundRank($x['round']) <=> roundRank($y['round'])
    );

    // 1) Insert Matches, build abstractId -> real MatchId map
    $idMap = [];
    $queue = 1;
    foreach ($matches as $m) {
        $ringNo = (($queue - 1) % $maxRings) + 1;
        $insMatch->execute([$eventId, $queue, $ringNo]);
        $idMap[$m['id']] = (int)$pdo->lastInsertId();
        $queue++;
    }

    // 2) Insert BracketMatches rows (section + bracketNo)
    foreach ($matches as $m) {
        $section = (!empty($m['section']) && $m['section'] === 'L') ? 'L' : 'W';
        $insBM->execute([$bracketId, $idMap[$m['id']], (int)$m['round'], $section]);
    }

    // 3) Seat fighters + wire NextMatchWin / NextMatchLoss
    foreach ($matches as $m) {
        $mid = $idMap[$m['id']];

        foreach ([['slot'=>$m['left'],'color'=>'Red'], ['slot'=>$m['right'],'color'=>'Blue']] as $s) {
            $slot = $s['slot'];
            if (!$slot) continue; // BYE placeholder, nothing to seat/wire

            if (isset($slot['fighterId'])) {
                // pre-seated fighter (round-1 fighter OR auto-passed BYE fighter)
                $insMF->execute([$mid, (int)$slot['fighterId'], $s['color']]);
            } elseif (isset($slot['fromMatch'])) {
                $fromMid = $idMap[$slot['fromMatch']];
                if (!empty($slot['as']) && $slot['as'] === 'loser') {
                    $updNextLoss->execute([$mid, $bracketId, $fromMid]);
                } else {
                    $updNextWin->execute([$mid, $bracketId, $fromMid]);
                }
            }
        }
    }

    return $bracketId;
}

try {
    $pdo = db();

    if ($action === "create") {
        if (!isset($data["fighters"]) || !is_array($data["fighters"])) {
            echo json_encode(["status" => "error", "message" => "fighters[] required"]);
            exit;
        }

        $fighterIds = array_values(array_filter($data["fighters"], fn($f) => $f !== null));
        $maxRings   = isset($data["maxRings"]) && (int)$data["maxRings"] > 0 ? (int)$data["maxRings"] : 1;

        // Format: 'S' single (default) or 'D' double
        $format = (isset($data["format"]) && strtoupper((string)$data["format"]) === 'D') ? 'D' : 'S';

        $withBronze          = isset($data["withBronze"]) ? (bool)$data["withBronze"] : true;
        $withGrandFinalReset = isset($data["withGrandFinalReset"]) ? (bool)$data["withGrandFinalReset"] : false;

        if (count($fighterIds) < 2) {
            echo json_encode(["status" => "error", "message" => "Need at least 2 fighters"]);
            exit;
        }

        $pdo->beginTransaction();

        $seeded = seedFighters($pdo, $fighterIds);

        // Delegate tree-building to the format-specific builder
        if ($format === 'D') {
            $tree = buildDoubleElim($seeded, $withGrandFinalReset);
        } else {
            $tree = buildSingleElim($seeded, $withBronze);
        }
        $matches = $tree['matches'];

        cleanupEvent($pdo, $eventId);
        $bracketId = persistBracket($pdo, $eventId, $format, $matches, $maxRings);

        $pdo->commit();

        echo json_encode([
            "status"              => "success",
            "message"             => "Bracket created",
            "bracketId"           => $bracketId,
            "format"              => $format,
            "hasBronze"           => ($format === 'S') ? (bool)$withBronze : false,
            "hasGrandFinalReset"  => ($format === 'D') ? (bool)$withGrandFinalReset : false,
            "rounds"              => fetchRounds($pdo, $bracketId),
        ]);
        exit;
    }

    if ($action === "fetch") {
        $stmt = $pdo->prepare("SELECT BracketId, BracketFormat FROM Brackets WHERE EventId = ? LIMIT 1");
        $stmt->execute([$eventId]);
        $b = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$b) {
            echo json_encode(["status"=>"success","message"=>"No bracket found for event.","rounds"=>[]]);
            exit;
        }

        echo json_encode([
            "status"    => "success",
            "bracketId" => (int)$b['BracketId'],
            "format"    => $b['BracketFormat'],
            "rounds"    => fetchRounds($pdo, (int)$b['BracketId']),
        ]);
        exit;
    }

    echo json_encode(["status"=>"error","message"=>"Unknown action"]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(["status"=>"error","message"=>$e->getMessage()]);
}

/**
 * Shared rounds-builder for create/fetch responses.
 *
 * Works for both formats by reading BracketSection from the DB and deriving
 * matchRole from structure:
 *   - Within WB ('W' section, positive BracketNo):
 *       highest positive BracketNo column:
 *         - if a single match: that match's role depends on format/wiring
 *       For single elim:
 *         - highest BracketNo -> "final"
 *         - "bronze" -> the 'W' match referenced by some NextMatchLoss
 *     For double elim grand finals:
 *         - "grandFinal" / "grandFinalReset" derived from wiring (see below)
 *   - LB matches ('L' section, negative BracketNo): role = null
 *
 * Role derivation here is intentionally structural so it does not depend on
 * the builder's in-memory flags (which are gone by fetch time):
 *
 *   bronze:          a 'W' match that is the target of a NextMatchLoss link
 *                    AND has no NextMatchWin (single-elim only).
 *   final:           the 'W' match with the highest BracketNo whose
 *                    NextMatchWin is NULL and is NOT a bronze.
 *   grandFinal:      'W' match whose NextMatchWin points to another 'W' match
 *                    (the reset) — i.e. it has a downstream within section 'W'
 *                    above the WB final.
 *   grandFinalReset: 'W' match that is the target of grandFinal's NextMatchWin
 *                    and has NextMatchWin NULL.
 *
 * For simplicity and robustness we compute roles in two cheap passes.
 */
function fetchRounds(PDO $pdo, int $bracketId): array {
    $stmt = $pdo->prepare("
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
    $stmt->execute([$bracketId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // --- Gather per-match structural facts (dedup rows from the fighter join) ---
    $bm = []; // matchId -> ['bracketNo','section','nextWin','nextLoss']
    foreach ($rows as $row) {
        $mid = (int)$row['MatchId'];
        if (!isset($bm[$mid])) {
            $bm[$mid] = [
                'bracketNo' => (int)$row['BracketNo'],
                'section'   => $row['BracketSection'],
                'nextWin'   => $row['NextMatchWin'] !== null ? (int)$row['NextMatchWin'] : null,
                'nextLoss'  => $row['NextMatchLoss'] !== null ? (int)$row['NextMatchLoss'] : null,
            ];
        }
    }

    // Sets used for role detection
    $isLossTarget = []; // matchId => true if some match's NextMatchLoss points here
    foreach ($bm as $mid => $info) {
        if ($info['nextLoss'] !== null) $isLossTarget[$info['nextLoss']] = true;
    }

    // grandFinal (reset case): the ONLY match that points BOTH its
    // NextMatchWin and NextMatchLoss at the same 'W' match is GF1; that
    // shared target is GF2 (the reset). In single elim a match's win/loss
    // targets always diverge (final vs bronze), so this never false-fires
    // on normal winners'-bracket progression.
    $grandFinalId = null;
    $grandFinalResetId = null;
    foreach ($bm as $mid => $info) {
        if ($info['section'] === 'W'
            && $info['nextWin'] !== null
            && $info['nextWin'] === $info['nextLoss']) {
            $tgt = $info['nextWin'];
            if (isset($bm[$tgt]) && $bm[$tgt]['section'] === 'W') {
                $grandFinalId = $mid;
                $grandFinalResetId = $tgt;
            }
        }
    }

    // Determine bronze + final among 'W' matches (single-elim case).
    // Only relevant when there is no grand final structure.
    $bronzeId = null;
    $finalId  = null;
    if ($grandFinalId === null) {
        // bronze: a 'W' match that is a NextMatchLoss target and has no NextMatchWin
        foreach ($bm as $mid => $info) {
            if ($info['section'] === 'W'
                && isset($isLossTarget[$mid])
                && $info['nextWin'] === null) {
                $bronzeId = $mid;
                break;
            }
        }
        // final: 'W' match, NextMatchWin NULL, highest BracketNo, not the bronze
        $bestBn = null;
        foreach ($bm as $mid => $info) {
            if ($info['section'] === 'W'
                && $info['nextWin'] === null
                && $mid !== $bronzeId) {
                if ($bestBn === null || $info['bracketNo'] > $bestBn) {
                    $bestBn  = $info['bracketNo'];
                    $finalId = $mid;
                }
            }
        }
    }

    $roleFor = function (int $mid) use ($bronzeId, $finalId, $grandFinalId, $grandFinalResetId): ?string {
        if ($mid === $grandFinalId)      return "grandFinal";
        if ($mid === $grandFinalResetId) return "grandFinalReset";
        if ($mid === $finalId)           return "final";
        if ($mid === $bronzeId)          return "bronze";
        return null;
    };

    // --- Build grouped rounds keyed by BracketNo ---
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
                "matchRole"      => $roleFor($mid),
                "matchRing"      => $row['MatchRingNo'] ? (int)$row['MatchRingNo'] : null,
                "matchQueue"     => $row['MatchQueueNumber'] ? (int)$row['MatchQueueNumber'] : null,
                "nextMatchWin"   => $row['NextMatchWin'] ? (int)$row['NextMatchWin'] : null,
                "nextMatchLoss"  => $row['NextMatchLoss'] ? (int)$row['NextMatchLoss'] : null,
                "fighters"       => [],
            ];
        }
        if (!is_null($row['FighterId'])) {
            $rounds[$bno][$mid]["fighters"][] = [
                "fighterId"   => (int)$row['FighterId'],
                "fighterName" => $row['FighterName'],
                "clubId"      => $row['ClubId'] ? (int)$row['ClubId'] : null,
            ];
        }
    }
    foreach ($rounds as $bno => $map) {
        $rounds[$bno] = array_values($map);
    }
    return $rounds;
}