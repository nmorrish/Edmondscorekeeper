<?php
/**
 * phpFiles/eliminationBrackets.php
 *
 * === Single Elimination Brackets API (seeded binary tree) ===
 * - POST { action:"create", eventId, fighters:[ids], withBronze?:bool, maxRings?:int }
 *   → seeds by FighterSkill DESC, FighterId ASC, then distributes by club;
 *     builds a proper seeded bracket; round-1 BYEs auto-pass (no match record)
 *     and pre-seat into round 2; wires NextMatchWin (+ NextMatchLoss for bronze).
 *     Bronze and the Final each occupy their own column (own BracketNo).
 * - POST { action:"fetch", eventId }
 *   → returns structured JSON of bracket, each match tagged with matchRole.
 */

require_once("connect.php");
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
 * Build a seeded single-elim bracket.
 *
 * Column layout (BracketNo):
 *   real rounds 1 .. F-1  → their own columns
 *   bronze                → BracketNo F        (its own column)
 *   final (gold/silver)   → BracketNo F + 1    (its own column)
 *
 * @param array $seededFighters fighterIds in seed order (index 0 = top seed)
 * @param bool  $withBronze
 * @return array {
 *   matches: [ ['id'=>abstractId,'round'=>r,'left'=>SLOT,'right'=>SLOT, ...flags], ... ],
 *   bronze:  abstractId|null,
 *   semis:   [abstractId, abstractId]   // for bronze NextMatchLoss wiring
 * }
 *   SLOT = ['fighterId'=>X] | ['fromMatch'=>abstractId] | null (BYE)
 */
function buildBracket(array $seededFighters, bool $withBronze = true): array {
    $N = count($seededFighters);
    if ($N < 2) throw new InvalidArgumentException("Need at least 2 fighters");

    // Bracket size = next power of two
    $M = 1; while ($M < $N) $M <<= 1;

    // Map seed position (1-based) -> fighterId or null (BYE)
    $bySeed = [];
    for ($s = 1; $s <= $M; $s++) {
        $bySeed[$s] = ($s <= $N) ? $seededFighters[$s - 1] : null;
    }

    $order = seedSlots($M);                 // seed positions in bracket order
    $matchId = 1;
    $matches = [];

    // --- Round 1: pair adjacent slots ---
    // A (fighter, BYE) pair is NOT a match: the fighter auto-passes upward.
    // Carry forward either a ['fromMatch'=>id] (real match) or ['fighterId'=>x] (auto-pass).
    $carry = [];
    for ($i = 0; $i < $M; $i += 2) {
        $a = $bySeed[$order[$i]];
        $b = $bySeed[$order[$i + 1]];

        if ($a !== null && $b !== null) {
            $id = $matchId++;
            $matches[] = ['id'=>$id,'round'=>1,'left'=>['fighterId'=>$a],'right'=>['fighterId'=>$b]];
            $carry[] = ['fromMatch'=>$id];
        } else {
            // exactly one present (both-null impossible with correct seeding)
            $fid = $a ?? $b;
            $carry[] = ['fighterId'=>$fid];   // auto-pass: pre-seat into next round
        }
    }

    // --- Subsequent rounds ---
    $round = 2;
    while (count($carry) > 1) {
        $next = [];
        for ($i = 0; $i < count($carry); $i += 2) {
            $left  = $carry[$i];
            $right = $carry[$i + 1];
            $id = $matchId++;
            $matches[] = ['id'=>$id,'round'=>$round,'left'=>$left,'right'=>$right];
            $next[] = ['fromMatch'=>$id];
        }
        $carry = $next;
        $round++;
    }

    // The final is the single last match created. Its natural round number:
    $finalRound = $round - 1;

    // --- Bronze: its own column at BracketNo $finalRound; bump final up by 1 ---
    $semis = [];
    if ($withBronze) {
        // Semis = the two matches feeding the final (round == finalRound - 1).
        $semiMatches = array_values(array_filter(
            $matches,
            fn($m) => $m['round'] === $finalRound - 1
        ));
        if (count($semiMatches) === 2) {
            $semis = [$semiMatches[0]['id'], $semiMatches[1]['id']];
        }
    }

    $bronze = null;
    if ($withBronze && count($semis) === 2) {
        // Shift the final into its own column above bronze.
        foreach ($matches as &$m) {
            if ($m['round'] === $finalRound) {
                $m['round'] = $finalRound + 1;
                $m['final'] = true;
            }
        }
        unset($m);

        $bronze = $matchId++;
        $matches[] = [
            'id'     => $bronze,
            'round'  => $finalRound,   // own column, directly left of the final
            'left'   => ['fromMatch'=>$semis[0], 'as'=>'loser'],
            'right'  => ['fromMatch'=>$semis[1], 'as'=>'loser'],
            'bronze' => true,
        ];
    } else {
        // No bronze: still tag the final for role reporting.
        foreach ($matches as &$m) {
            if ($m['round'] === $finalRound) {
                $m['final'] = true;
            }
        }
        unset($m);
    }

    return ['matches'=>$matches, 'bronze'=>$bronze, 'semis'=>$semis];
}

try {
    $pdo = db();

    if ($action === "create") {
        if (!isset($data["fighters"]) || !is_array($data["fighters"])) {
            echo json_encode(["status" => "error", "message" => "fighters[] required"]);
            exit;
        }

        $fighterIds  = array_values(array_filter($data["fighters"], fn($f) => $f !== null));
        $withBronze  = isset($data["withBronze"]) ? (bool)$data["withBronze"] : true;
        $maxRings    = isset($data["maxRings"]) && (int)$data["maxRings"] > 0 ? (int)$data["maxRings"] : 1;

        if (count($fighterIds) < 2) {
            echo json_encode(["status" => "error", "message" => "Need at least 2 fighters"]);
            exit;
        }

        $pdo->beginTransaction();

        // --- Seed by FighterSkill DESC, FighterId ASC, then distribute by club ---
        $in = implode(',', array_fill(0, count($fighterIds), '?'));
        $seedStmt = $pdo->prepare("
            SELECT FighterId, ClubId
              FROM Fighters
             WHERE FighterId IN ($in)
             ORDER BY (FighterSkill IS NULL) ASC, FighterSkill DESC, FighterId ASC
        ");
        $seedStmt->execute($fighterIds);
        $seedRows = $seedStmt->fetchAll(PDO::FETCH_ASSOC);

        $seeded = distributeByClub($seedRows);

        // Build the seeded tree
        $tree    = buildBracket($seeded, $withBronze);
        $matches = $tree['matches'];

        // --- Cleanup existing bracket/pools/matches for this event ---
        $pdo->prepare("DELETE bm FROM BracketMatches bm JOIN Brackets b ON bm.BracketId = b.BracketId WHERE b.EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE pm FROM PoolMatches pm JOIN Pools p ON pm.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE pf FROM PoolFighters pf JOIN Pools p ON pf.PoolId = p.PoolId WHERE p.EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE FROM Brackets WHERE EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE FROM Pools WHERE EventId = ?")->execute([$eventId]);
        $pdo->prepare("DELETE FROM Matches WHERE EventId = ?")->execute([$eventId]);

        $stmt = $pdo->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (?, 'S')");
        $stmt->execute([$eventId]);
        $bracketId = (int)$pdo->lastInsertId();

        $insMatch    = $pdo->prepare("INSERT INTO Matches (EventId, MatchQueueNumber, MatchRingNo) VALUES (?, ?, ?)");
        $insBM       = $pdo->prepare("INSERT INTO BracketMatches (BracketId, MatchId, BracketNo, BracketSection) VALUES (?, ?, ?, 'W')");
        $insMF       = $pdo->prepare("INSERT INTO MatchFighters (MatchId, FighterId, FighterColor) VALUES (?, ?, ?)");
        $updNextWin  = $pdo->prepare("UPDATE BracketMatches SET NextMatchWin  = ? WHERE BracketId = ? AND MatchId = ?");
        $updNextLoss = $pdo->prepare("UPDATE BracketMatches SET NextMatchLoss = ? WHERE BracketId = ? AND MatchId = ?");

        // Order matches by round then id so queue/ring numbering is sane
        usort($matches, fn($x, $y) =>
            ($x['round'] === $y['round']) ? $x['id'] <=> $y['id'] : roundRank($x['round']) <=> roundRank($y['round'])
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

        // 2) Insert BracketMatches rows
        foreach ($matches as $m) {
            $insBM->execute([$bracketId, $idMap[$m['id']], (int)$m['round']]);
        }

        // 3) Seat fighters + wire NextMatchWin / NextMatchLoss
        foreach ($matches as $m) {
            $mid = $idMap[$m['id']];

            foreach ([['slot'=>$m['left'],'color'=>'Red'], ['slot'=>$m['right'],'color'=>'Blue']] as $s) {
                $slot = $s['slot'];
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

        $pdo->commit();

        echo json_encode([
            "status"    => "success",
            "message"   => "Bracket created",
            "bracketId" => $bracketId,
            "format"    => "S",
            "hasBronze" => (bool)$withBronze,
            "rounds"    => fetchRounds($pdo, $bracketId, (bool)$withBronze),
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

        // Determine bronze presence from structure: a 'W' match wired as a
        // NextMatchLoss target indicates a bronze match exists.
        $hasBronze = bracketHasBronze($pdo, (int)$b['BracketId']);

        echo json_encode([
            "status"=>"success",
            "bracketId"=>(int)$b['BracketId'],
            "format"=>$b['BracketFormat'],
            "hasBronze"=>$hasBronze,
            "rounds"=>fetchRounds($pdo, (int)$b['BracketId'], $hasBronze),
        ]);
        exit;
    }

    echo json_encode(["status"=>"error","message"=>"Unknown action"]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    echo json_encode(["status"=>"error","message"=>$e->getMessage()]);
}

/**
 * Sort helper so 'bronze' rounds rank alongside their numeric column.
 * (Currently bronze carries a numeric round, so this is a passthrough,
 *  kept for safety if a non-numeric round label is ever introduced.)
 */
function roundRank($round): int {
    return is_numeric($round) ? (int)$round : PHP_INT_MAX;
}

/**
 * Does this bracket include a bronze match?
 * A bronze match is the single 'W' match that is referenced by NextMatchLoss.
 */
function bracketHasBronze(PDO $pdo, int $bracketId): bool {
    $stmt = $pdo->prepare("
        SELECT COUNT(*) FROM BracketMatches
         WHERE BracketId = ? AND NextMatchLoss IS NOT NULL
    ");
    $stmt->execute([$bracketId]);
    return ((int)$stmt->fetchColumn()) > 0;
}

/**
 * Shared rounds-builder for create/fetch responses.
 *
 * matchRole derivation (positional, simplest scheme):
 *   - highest BracketNo  → "final"
 *   - second-highest     → "bronze"  (only when $hasBronze)
 *   - otherwise          → null
 */
function fetchRounds(PDO $pdo, int $bracketId, bool $hasBronze = false): array {
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

    // Distinct BracketNos present, ascending
    $bracketNos = [];
    foreach ($rows as $row) {
        $bn = (int)$row['BracketNo'];
        $bracketNos[$bn] = true;
    }
    $bracketNos = array_keys($bracketNos);
    sort($bracketNos);

    $finalBn  = empty($bracketNos) ? null : $bracketNos[count($bracketNos) - 1];
    $bronzeBn = ($hasBronze && count($bracketNos) >= 2)
        ? $bracketNos[count($bracketNos) - 2]
        : null;

    $roleFor = function (int $bn) use ($finalBn, $bronzeBn): ?string {
        if ($bn === $finalBn)  return "final";
        if ($bn === $bronzeBn) return "bronze";
        return null;
    };

    $rounds = [];
    foreach ($rows as $row) {
        $bno = (int)$row['BracketNo'];
        $mid = (int)$row['MatchId'];
        if (!isset($rounds[$bno])) $rounds[$bno] = [];
        if (!isset($rounds[$bno][$mid])) {
            $rounds[$bno][$mid] = [
                "matchId"       => $mid,
                "bracketNo"     => $bno,
                "bracketSection"=> $row['BracketSection'],
                "matchRole"     => $roleFor($bno),
                "matchRing"     => $row['MatchRingNo'] ? (int)$row['MatchRingNo'] : null,
                "matchQueue"    => $row['MatchQueueNumber'] ? (int)$row['MatchQueueNumber'] : null,
                "nextMatchWin"  => $row['NextMatchWin'] ? (int)$row['NextMatchWin'] : null,
                "nextMatchLoss" => $row['NextMatchLoss'] ? (int)$row['NextMatchLoss'] : null,
                "fighters"      => [],
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