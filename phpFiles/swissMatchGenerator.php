<?php

require_once __DIR__ . '/connect.php';

/**
 * Creates a set of matches and rounds for a tournament using the Swiss System (standard variation)
 *
 * Current scope:
 * - createSwissNextRound($eventId): creates the next Swiss round container (Pools row) every time it is called.
 *   - Round 1: generates baseline Swiss seeded split pairings and creates Matches / PoolMatches / MatchFighters.
 *   - Round >= 2: does NOT generate pairings yet (next step is standings-based pairing).
 * - buildSwissEligibilityContext($eventId): queries DB for pairing ineligibilities (rematches) + bye history.
 *
 * Schema used (from your DB):
 * - Event roster: EventFighters(EventId, FighterId)
 * - Seeding: Fighters(FighterSkill) nullable
 * - Round container: Pools(EventId, PoolNo, MinFighters, MaxFighters) with UNIQUE(EventId, PoolNo)
 * - Round membership: PoolFighters(PoolId, FighterId, HadBye) with UNIQUE(PoolId, FighterId)
 * - Matches: Matches(EventId, PendingActiveDone default 'P', MatchRingNo, MatchQueueNumber nullable triggers)
 * - Round->Match: PoolMatches(PoolId, MatchId)
 * - Match->Fighters: MatchFighters(MatchId, FighterId, FighterColor) with UNIQUE(MatchId, FighterColor)
 * - Swiss format marker: Brackets(EventId, BracketFormat='W')
 */

/* ============================================================
   Round / Bracket helpers
   ============================================================ */

function getNextSwissRoundNo(PDO $db, int $eventId): int {
    $stmt = $db->prepare("SELECT IFNULL(MAX(PoolNo), 0) AS MaxPoolNo FROM Pools WHERE EventId = ?");
    $stmt->execute([$eventId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return ((int)$row['MaxPoolNo']) + 1;
}

function ensureSwissBracket(PDO $db, int $eventId): void {
    $stmt = $db->prepare("SELECT BracketId FROM Brackets WHERE EventId = ? AND BracketFormat = 'W' LIMIT 1");
    $stmt->execute([$eventId]);
    if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
        $stmt2 = $db->prepare("INSERT INTO Brackets (EventId, BracketFormat) VALUES (?, 'W')");
        $stmt2->execute([$eventId]);
    }
}

/* ============================================================
   Roster / seeding / bye helpers
   ============================================================ */

function loadSeededRoster(PDO $db, int $eventId): array {
    $stmt = $db->prepare("
        SELECT ef.FighterId, COALESCE(f.FighterSkill, 0) AS FighterSkill
        FROM EventFighters ef
        JOIN Fighters f ON f.FighterId = ef.FighterId
        WHERE ef.EventId = ?
        ORDER BY COALESCE(f.FighterSkill, 0) DESC, ef.FighterId ASC
    ");
    $stmt->execute([$eventId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Returns map: fighterId => bool (has ever had a bye in this event).
 * Optional: exclude a specific pool (useful for re-evaluating after creating pool membership).
 */
function loadByeHistory(PDO $db, int $eventId, ?int $excludePoolId = null): array {
    $sql = "
        SELECT pf.FighterId, MAX(pf.HadBye) AS HadBye
        FROM Pools p
        JOIN PoolFighters pf ON pf.PoolId = p.PoolId
        WHERE p.EventId = ?
    ";
    $params = [$eventId];

    if ($excludePoolId !== null) {
        $sql .= " AND p.PoolId <> ? ";
        $params[] = $excludePoolId;
    }

    $sql .= " GROUP BY pf.FighterId";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $hadBye = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $hadBye[(int)$row['FighterId']] = ((int)$row['HadBye'] === 1);
    }
    return $hadBye;
}

/**
 * fightersSortedLowToHigh: array of rows with FighterId. Lowest-ranked first.
 * hadByeMap: fighterId => bool
 */
function chooseByeFighterId(array $fightersSortedLowToHigh, array $hadByeMap): ?int {
    // Pick lowest-ranked fighter who has not had a bye yet.
    foreach ($fightersSortedLowToHigh as $fr) {
        $fid = (int)$fr['FighterId'];
        if (empty($hadByeMap[$fid])) return $fid;
    }

    // If everyone already had a bye (rare), fall back to absolute lowest.
    return count($fightersSortedLowToHigh)
        ? (int)$fightersSortedLowToHigh[0]['FighterId']   // <-- FIXED
        : null;
}

/* ============================================================
   Swiss round creation
   ============================================================ */

/**
 * Creates the NEXT Swiss round for an event.
 * - Always creates a new Pools row (round container) with PoolNo = MAX(PoolNo)+1.
 * - Inserts PoolFighters for full roster; sets HadBye=1 for bye fighter if odd roster.
 * - If roundNo == 1: creates baseline Swiss seeded split pairings.
 * - If roundNo >= 2: leaves matches empty (next step is standings-based Swiss pairing).
 */
/**
 * Compute Swiss standings for an event THROUGH round N (Pools.PoolNo <= $throughRoundNo).
 *
 * If $throughRoundNo is null:
 * - Uses MAX(PoolNo) for this event (i.e. all existing Swiss rounds).
 *
 * Points:
 * - Win ('W') = 1.0
 * - Draw ('D') = 0.5
 * - Loss ('L') = 0.0
 * - Bye (PoolFighters.HadBye=1) = +1.0 per bye
 *
 * Match results counted only when:
 * - match is linked to a Pool via PoolMatches
 * - that Pool belongs to the event
 * - PoolNo <= throughRoundNo
 * - Matches.PendingActiveDone = 'D'
 *
 * Returns fighters sorted by:
 * 1) points DESC
 * 2) buchholz DESC
 * 3) wins DESC
 * 4) FighterSkill DESC
 * 5) FighterId ASC
 */
function computeSwissStandings(int $eventId, ?int $throughRoundNo = null): array {
    $db = connect();

    // Resolve throughRoundNo if null
    if ($throughRoundNo === null) {
        $stmt = $db->prepare("SELECT IFNULL(MAX(PoolNo), 0) AS MaxPoolNo FROM Pools WHERE EventId = ?");
        $stmt->execute([$eventId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $throughRoundNo = (int)$row['MaxPoolNo'];
    }

    if ($throughRoundNo < 0) $throughRoundNo = 0;

    // 1) Roster + seed info
    $stmt = $db->prepare("
        SELECT ef.FighterId, COALESCE(f.FighterSkill, 0) AS FighterSkill, f.ClubId, f.FighterName
        FROM EventFighters ef
        JOIN Fighters f ON f.FighterId = ef.FighterId
        WHERE ef.EventId = ?
    ");
    $stmt->execute([$eventId]);
    $rosterRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($rosterRows) === 0) {
        return ['status' => 'error', 'message' => "No fighters in EventFighters for EventId=$eventId"];
    }

    // Initialize standings map
    $standings = []; // fighterId => data
    foreach ($rosterRows as $r) {
        $fid = (int)$r['FighterId'];
        $standings[$fid] = [
            'fighterId' => $fid,
            'fighterName' => $r['FighterName'],
            'clubId' => $r['ClubId'] !== null ? (int)$r['ClubId'] : null,
            'fighterSkill' => (int)$r['FighterSkill'],

            'points' => 0.0,
            'wins' => 0,
            'draws' => 0,
            'losses' => 0,
            'played' => 0,

            'byeCount' => 0,
            'buchholz' => 0.0,
        ];
    }
    $rosterIds = array_keys($standings);

    // If throughRoundNo == 0, no rounds counted (useful for "pre-round-1" standings = all zeros)
    if ($throughRoundNo === 0) {
        $list = array_values($standings);
        usort($list, function($a, $b) {
            if ($a['fighterSkill'] !== $b['fighterSkill']) return ($a['fighterSkill'] < $b['fighterSkill']) ? 1 : -1;
            return ($a['fighterId'] > $b['fighterId']) ? 1 : -1;
        });

        return [
            'status' => 'success',
            'eventId' => $eventId,
            'throughRoundNo' => $throughRoundNo,
            'standings' => $list
        ];
    }

    // 2) Bye points THROUGH round N
    $stmt = $db->prepare("
        SELECT pf.FighterId, SUM(CASE WHEN pf.HadBye = 1 THEN 1 ELSE 0 END) AS ByeCount
        FROM Pools p
        JOIN PoolFighters pf ON pf.PoolId = p.PoolId
        WHERE p.EventId = ?
          AND p.PoolNo <= ?
        GROUP BY pf.FighterId
    ");
    $stmt->execute([$eventId, $throughRoundNo]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $fid = (int)$row['FighterId'];
        if (!isset($standings[$fid])) continue;
        $byeCount = (int)$row['ByeCount'];
        $standings[$fid]['byeCount'] = $byeCount;
        $standings[$fid]['points'] += (float)$byeCount;
    }

    // 3) Match results THROUGH round N (only matches linked to those pools)
    $stmt = $db->prepare("
        SELECT
            m.MatchId,
            mf.MatchFighterId,
            mf.FighterId,
            mf.WinLossDraw
        FROM Pools p
        JOIN PoolMatches pm ON pm.PoolId = p.PoolId
        JOIN Matches m ON m.MatchId = pm.MatchId
        JOIN MatchFighters mf ON mf.MatchId = m.MatchId
        WHERE p.EventId = ?
          AND p.PoolNo <= ?
          AND m.PendingActiveDone = 'D'
        ORDER BY m.MatchId ASC, mf.MatchFighterId ASC
    ");
    $stmt->execute([$eventId, $throughRoundNo]);

    $fightersByMatch = []; // matchId => [fighterId,...]
    $resultsByMatchFighter = []; // matchFighterId => ['fighterId'=>, 'wld'=>]
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $mid = (int)$row['MatchId'];
        $mfid = (int)$row['MatchFighterId'];
        $fid = (int)$row['FighterId'];
        $wld = $row['WinLossDraw']; // 'W','L','D' or null

        if (!isset($fightersByMatch[$mid])) $fightersByMatch[$mid] = [];
        $fightersByMatch[$mid][] = $fid;

        $resultsByMatchFighter[$mfid] = ['fighterId' => $fid, 'wld' => $wld];
    }

    foreach ($resultsByMatchFighter as $data) {
        $fid = (int)$data['fighterId'];
        if (!isset($standings[$fid])) continue;

        $wld = $data['wld'];
        if ($wld === 'W') {
            $standings[$fid]['wins'] += 1;
            $standings[$fid]['played'] += 1;
            $standings[$fid]['points'] += 1.0;
        } elseif ($wld === 'D') {
            $standings[$fid]['draws'] += 1;
            $standings[$fid]['played'] += 1;
            $standings[$fid]['points'] += 0.5;
        } elseif ($wld === 'L') {
            $standings[$fid]['losses'] += 1;
            $standings[$fid]['played'] += 1;
        } else {
            // Match is Done but trigger didn't set WinLossDraw; leave uncounted so it surfaces.
        }
    }

    // 4) Buchholz THROUGH round N: sum of opponents' points (using points computed above)
    $opponents = [];
    foreach ($rosterIds as $fid) $opponents[$fid] = [];

    foreach ($fightersByMatch as $mid => $fids) {
        if (count($fids) !== 2) continue;
        $a = (int)$fids[0];
        $b = (int)$fids[1];
        if ($a === $b) continue;
        if (isset($opponents[$a])) $opponents[$a][$b] = true;
        if (isset($opponents[$b])) $opponents[$b][$a] = true;
    }

    foreach ($opponents as $fid => $oppSet) {
        $sum = 0.0;
        foreach ($oppSet as $oppId => $_) {
            if (isset($standings[$oppId])) $sum += (float)$standings[$oppId]['points'];
        }
        $standings[$fid]['buchholz'] = $sum;
    }

    // 5) Sort
    $list = array_values($standings);
    usort($list, function($a, $b) {
        if ($a['points'] !== $b['points']) return ($a['points'] < $b['points']) ? 1 : -1;
        if ($a['buchholz'] !== $b['buchholz']) return ($a['buchholz'] < $b['buchholz']) ? 1 : -1;
        if ($a['wins'] !== $b['wins']) return ($a['wins'] < $b['wins']) ? 1 : -1;
        if ($a['fighterSkill'] !== $b['fighterSkill']) return ($a['fighterSkill'] < $b['fighterSkill']) ? 1 : -1;
        return ($a['fighterId'] > $b['fighterId']) ? 1 : -1;
    });

    return [
        'status' => 'success',
        'eventId' => $eventId,
        'throughRoundNo' => $throughRoundNo,
        'standings' => $list
    ];
}

/**
 * Recursive perfect matching solver.
 *
 * $players = ordered list of fighterIds
 * $ctx = eligibility context (contains opponentsByFighter)
 *
 * Returns:
 * - array of pairs [[a,b], ...] if solvable
 * - null if no perfect matching exists
 */
function swissPerfectMatching(array $players, array $ctx): ?array {
    if (empty($players)) {
        return [];
    }

    $a = $players[0];
    $remaining = array_slice($players, 1);

    for ($i = 0; $i < count($remaining); $i++) {
        $b = $remaining[$i];

        // Skip if already fought
        if (isset($ctx['opponentsByFighter'][$a][$b])) {
            continue;
        }

        $nextPlayers = $remaining;
        array_splice($nextPlayers, $i, 1);

        $sub = swissPerfectMatching($nextPlayers, $ctx);

        if ($sub !== null) {
            array_unshift($sub, [$a, $b]);
            return $sub;
        }
    }

    return null; // no valid pairing
}

function generateSwissPairingsProper(int $eventId, int $roundNo): array {
    if ($roundNo < 1) {
        return ['status' => 'error', 'message' => 'Invalid round number'];
    }

    $prevRound = $roundNo - 1;

    $stand = computeSwissStandings($eventId, $prevRound);
    if ($stand['status'] !== 'success') return $stand;

    $ctx = buildSwissEligibilityContext($eventId, $prevRound);
    if ($ctx['status'] !== 'success') return $ctx;

    $standings = $stand['standings'];
    $hadBye = $ctx['hadBye'];

    $byeFighterId = null;

    // Assign bye if odd
    if (count($standings) % 2 === 1) {
        for ($i = count($standings) - 1; $i >= 0; $i--) {
            $fid = (int)$standings[$i]['fighterId'];
            if (empty($hadBye[$fid])) {
                $byeFighterId = $fid;
                break;
            }
        }

        if ($byeFighterId === null) {
            return ['status' => 'error', 'message' => 'No legal bye candidate found'];
        }
    }

    // Build player list excluding bye
    $players = [];
    foreach ($standings as $row) {
        $fid = (int)$row['fighterId'];
        if ($byeFighterId !== null && $fid === $byeFighterId) continue;
        $players[] = $fid;
    }


    //matching
    $pairs = swissPerfectMatching($players, $ctx);

    if ($pairs === null) {
        return [
            'status' => 'error',
            'message' => "No valid Swiss pairing possible for round $roundNo"
        ];
    }

    return [
        'status' => 'success',
        'roundNo' => $roundNo,
        'byeFighterId' => $byeFighterId,
        'pairs' => $pairs
    ];
}

function createSwissNextRoundProper(int $eventId): array {
    $db = connect();
    $db->beginTransaction();

    try {
        ensureSwissBracket($db, $eventId);

        // Determine next round number
        $roundNo = getNextSwissRoundNo($db, $eventId);

        // Count fighters
        $stmt = $db->prepare("SELECT COUNT(*) FROM EventFighters WHERE EventId = ?");
        $stmt->execute([$eventId]);
        $fighterCount = (int)$stmt->fetchColumn();

        if ($fighterCount < 2) {
            throw new RuntimeException("Swiss requires at least 2 fighters.");
        }

        // Enforce round cap
        $maxRounds = defaultSwissRoundCount($fighterCount);
        if ($roundNo > $maxRounds) {
            throw new RuntimeException("Maximum Swiss rounds reached.");
        }

        // Ensure previous round complete
        if ($roundNo > 1) {
            if (!isSwissRoundComplete($db, $eventId, $roundNo - 1)) {
                throw new RuntimeException("Previous round not complete.");
            }
        }

        // Fetch ring count
        $stmt = $db->prepare("SELECT MaxRings FROM Events WHERE EventId = ?");
        $stmt->execute([$eventId]);
        $eventRow = $stmt->fetch(PDO::FETCH_ASSOC);
        $maxRings = max(1, (int)$eventRow['MaxRings']);

        // Create pool (round container)
        $stmt = $db->prepare("
            INSERT INTO Pools (EventId, PoolNo, MinFighters, MaxFighters)
            VALUES (?, ?, 2, 2)
        ");
        $stmt->execute([$eventId, $roundNo]);
        $poolId = (int)$db->lastInsertId();

        // Insert roster into PoolFighters
        $roster = loadSeededRoster($db, $eventId);
        $stmtPF = $db->prepare("
            INSERT INTO PoolFighters (PoolId, FighterId, HadBye)
            VALUES (?, ?, 0)
        ");
        foreach ($roster as $r) {
            $stmtPF->execute([$poolId, (int)$r['FighterId']]);
        }

        $byeFighterId = null;
        $pairs = [];

        /*
        ===========================================================
        ROUND 1 — SEEDED SPLIT
        ===========================================================
        */
        if ($roundNo === 1) {

            if ($fighterCount % 2 === 1) {
                $hadBye = loadByeHistory($db, $eventId);
                $fightersLowToHigh = array_reverse($roster);
                $byeFighterId = chooseByeFighterId($fightersLowToHigh, $hadBye);
            }

            if ($byeFighterId !== null) {
                $roster = array_values(array_filter(
                    $roster,
                    fn($r) => (int)$r['FighterId'] !== $byeFighterId
                ));
            }

            $n = count($roster);
            $half = (int)($n / 2);
            $top = array_slice($roster, 0, $half);
            $bottom = array_slice($roster, $half);

            for ($i = 0; $i < $half; $i++) {
                $pairs[] = [
                    (int)$top[$i]['FighterId'],
                    (int)$bottom[$i]['FighterId']
                ];
            }
        }

        /*
        ===========================================================
        ROUND >= 2 — PROPER SWISS MATCHING
        ===========================================================
        */
        else {
            $pairData = generateSwissPairingsProper($eventId, $roundNo);
            if ($pairData['status'] !== 'success') {
                throw new RuntimeException($pairData['message']);
            }

            $pairs = $pairData['pairs'];
            $byeFighterId = $pairData['byeFighterId'];
        }

        /*
        ===========================================================
        PERSIST MATCHES
        ===========================================================
        */

        $stmtMatch = $db->prepare("
            INSERT INTO Matches (EventId, PendingActiveDone, MatchRingNo, MatchQueueNumber)
            VALUES (?, 'P', ?, NULL)
        ");
        $stmtPoolMatch = $db->prepare("
            INSERT INTO PoolMatches (PoolId, MatchId)
            VALUES (?, ?)
        ");
        $stmtMF = $db->prepare("
            INSERT INTO MatchFighters (MatchId, FighterId, FighterColor)
            VALUES (?, ?, ?)
        ");

        $ringNo = 1;

        foreach ($pairs as [$a, $b]) {

            $stmtMatch->execute([$eventId, $ringNo]);
            $matchId = (int)$db->lastInsertId();

            $stmtPoolMatch->execute([$poolId, $matchId]);

            $stmtMF->execute([$matchId, $a, 'Red']);
            $stmtMF->execute([$matchId, $b, 'Blue']);

            $ringNo++;
            if ($ringNo > $maxRings) $ringNo = 1;
        }

        /*
        ===========================================================
        HANDLE BYE
        ===========================================================
        */
        if ($byeFighterId !== null) {
            $stmtBye = $db->prepare("
                UPDATE PoolFighters
                SET HadBye = 1
                WHERE PoolId = ? AND FighterId = ?
            ");
            $stmtBye->execute([$poolId, $byeFighterId]);
        }

        $db->commit();

        return [
            'status' => 'success',
            'roundNo' => $roundNo,
            'poolId' => $poolId,
            'byeFighterId' => $byeFighterId,
            'pairCount' => count($pairs)
        ];

    } catch (Throwable $e) {
        $db->rollBack();
        return [
            'status' => 'error',
            'message' => $e->getMessage()
        ];
    }
}

/**
 * Build Swiss constraint context for an Event THROUGH round N (Pools.PoolNo <= $throughRoundNo).
 *
 * Hard constraints:
 * - cannot be paired with an opponent already fought in this event THROUGH round N
 *   (matches are taken ONLY from pools linked via PoolMatches, so bracket matches won't pollute this)
 * - bye cannot be assigned to someone who already had a bye THROUGH round N (PoolFighters.HadBye = 1)
 *
 * Soft data:
 * - club id map (optional constraint)
 */
function buildSwissEligibilityContext(int $eventId, ?int $throughRoundNo = null): array {
    $db = connect();

    // Resolve throughRoundNo if null
    if ($throughRoundNo === null) {
        $stmt = $db->prepare("SELECT IFNULL(MAX(PoolNo), 0) AS MaxPoolNo FROM Pools WHERE EventId = ?");
        $stmt->execute([$eventId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $throughRoundNo = (int)$row['MaxPoolNo'];
    }
    if ($throughRoundNo < 0) $throughRoundNo = 0;

    // 1) Roster (authoritative)
    $stmt = $db->prepare("
        SELECT ef.FighterId
        FROM EventFighters ef
        WHERE ef.EventId = ?
        ORDER BY ef.FighterId ASC
    ");
    $stmt->execute([$eventId]);
    $roster = array_map(fn($r) => (int)$r['FighterId'], $stmt->fetchAll(PDO::FETCH_ASSOC));

    if (count($roster) === 0) {
        return ['status' => 'error', 'message' => "No fighters found for EventId=$eventId"];
    }

    // Initialize structures
    $opponentsByFighter = [];
    foreach ($roster as $fid) $opponentsByFighter[$fid] = [];

    // If throughRoundNo == 0, there can be no opponents/byes yet
    if ($throughRoundNo === 0) {
        // club map still useful
        $placeholders = implode(',', array_fill(0, count($roster), '?'));
        $stmt = $db->prepare("SELECT FighterId, ClubId FROM Fighters WHERE FighterId IN ($placeholders)");
        $stmt->execute($roster);

        $clubIdByFighter = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $clubIdByFighter[(int)$row['FighterId']] = $row['ClubId'] !== null ? (int)$row['ClubId'] : null;
        }

        $hadBye = [];
        foreach ($roster as $fid) $hadBye[$fid] = false;

        return [
            'status' => 'success',
            'eventId' => $eventId,
            'throughRoundNo' => $throughRoundNo,
            'roster' => $roster,
            'opponentsByFighter' => $opponentsByFighter,
            'hadBye' => $hadBye,
            'clubIdByFighter' => $clubIdByFighter,
        ];
    }

    // 2) Opponent history THROUGH round N:
    // Use Pools->PoolMatches so only Swiss-round matches count, and only up to N.
    $stmt = $db->prepare("
        SELECT m.MatchId, mf.FighterId
        FROM Pools p
        JOIN PoolMatches pm ON pm.PoolId = p.PoolId
        JOIN Matches m ON m.MatchId = pm.MatchId
        JOIN MatchFighters mf ON mf.MatchId = m.MatchId
        WHERE p.EventId = ?
          AND p.PoolNo <= ?
        ORDER BY m.MatchId ASC, mf.MatchFighterId ASC
    ");
    $stmt->execute([$eventId, $throughRoundNo]);

    $fightersByMatch = []; // matchId => [fighterId,...]
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $mid = (int)$row['MatchId'];
        $fid = (int)$row['FighterId'];
        if (!isset($fightersByMatch[$mid])) $fightersByMatch[$mid] = [];
        $fightersByMatch[$mid][] = $fid;
    }

    foreach ($fightersByMatch as $mid => $fids) {
        if (count($fids) !== 2) continue;
        $a = (int)$fids[0];
        $b = (int)$fids[1];
        if ($a === $b) continue;

        if (isset($opponentsByFighter[$a])) $opponentsByFighter[$a][$b] = true;
        if (isset($opponentsByFighter[$b])) $opponentsByFighter[$b][$a] = true;
    }

    // 3) Bye history THROUGH round N
    $stmt = $db->prepare("
        SELECT pf.FighterId, MAX(pf.HadBye) AS HadBye
        FROM Pools p
        JOIN PoolFighters pf ON pf.PoolId = p.PoolId
        WHERE p.EventId = ?
          AND p.PoolNo <= ?
        GROUP BY pf.FighterId
    ");
    $stmt->execute([$eventId, $throughRoundNo]);

    $hadBye = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $fid = (int)$row['FighterId'];
        $hadBye[$fid] = ((int)$row['HadBye'] === 1);
    }
    foreach ($roster as $fid) {
        if (!array_key_exists($fid, $hadBye)) $hadBye[$fid] = false;
    }

    // 4) Optional soft info: club ids
    $placeholders = implode(',', array_fill(0, count($roster), '?'));
    $stmt = $db->prepare("SELECT FighterId, ClubId FROM Fighters WHERE FighterId IN ($placeholders)");
    $stmt->execute($roster);

    $clubIdByFighter = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $clubIdByFighter[(int)$row['FighterId']] = $row['ClubId'] !== null ? (int)$row['ClubId'] : null;
    }

    return [
        'status' => 'success',
        'eventId' => $eventId,
        'throughRoundNo' => $throughRoundNo,
        'roster' => $roster,
        'opponentsByFighter' => $opponentsByFighter,
        'hadBye' => $hadBye,
        'clubIdByFighter' => $clubIdByFighter,
    ];
}

function isSwissRoundComplete(PDO $db, int $eventId, int $roundNo): bool {
    $stmt = $db->prepare("
        SELECT
            COUNT(*) AS Total,
            SUM(CASE WHEN m.PendingActiveDone <> 'D' THEN 1 ELSE 0 END) AS NotDone
        FROM Pools p
        JOIN PoolMatches pm ON pm.PoolId = p.PoolId
        JOIN Matches m ON m.MatchId = pm.MatchId
        WHERE p.EventId = ?
          AND p.PoolNo = ?
    ");
    $stmt->execute([$eventId, $roundNo]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $total = (int)($row['Total'] ?? 0);
    $notDone = (int)($row['NotDone'] ?? 0);

    // If there are no matches, treat round as NOT complete (integrity safeguard).
    if ($total === 0) return false;

    return ($notDone === 0);
}

function defaultSwissRoundCount(int $fighterCount): int {
    return (int)ceil(log($fighterCount, 2)) + 1;
}