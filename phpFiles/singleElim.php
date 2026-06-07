<?php
/**
 * phpFiles/singleElim.php
 *
 * === Single Elimination Tree Builder ===
 *
 * buildSingleElim(seededFighters, withBronze) -> ['matches'=>[...]]
 *
 * Consumed by bracketSeeding.php. Returns matches in the shared builder
 * contract; persistence + fetchRounds live in the orchestrator.
 *
 * Column layout (BracketNo / 'round'):
 *   real rounds 1 .. F-1  → their own columns
 *   bronze                → BracketNo F      (its own column)
 *   final (gold/silver)   → BracketNo F + 1  (its own column)
 *
 * When withBronze is false, the final keeps round F and there is no bronze.
 *
 * Requires seedSlots() from bracketSeeding.php.
 *
 * Match shape (shared contract):
 *   [
 *     'id'      => int,
 *     'round'   => int,            // BracketNo (all positive for single elim)
 *     'section' => 'W',
 *     'left'    => SLOT,
 *     'right'   => SLOT,
 *   ]
 *   SLOT = ['fighterId'=>int] | ['fromMatch'=>int, 'as'?=>'loser'] | null (BYE)
 *
 * Roles (final/bronze) are NOT flagged here; the orchestrator derives them
 * structurally from wiring at fetch time.
 */

/**
 * Build a seeded single-elimination bracket.
 *
 * @param array $seededFighters fighterIds in seed order (index 0 = top seed)
 * @param bool  $withBronze
 * @return array ['matches'=>[...]]
 */
function buildSingleElim(array $seededFighters, bool $withBronze = true): array {
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
            $matches[] = [
                'id'      => $id,
                'round'   => 1,
                'section' => 'W',
                'left'    => ['fighterId'=>$a],
                'right'   => ['fighterId'=>$b],
            ];
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
            $matches[] = [
                'id'      => $id,
                'round'   => $round,
                'section' => 'W',
                'left'    => $left,
                'right'   => $right,
            ];
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

    if ($withBronze && count($semis) === 2) {
        // Shift the final into its own column above bronze.
        foreach ($matches as &$m) {
            if ($m['round'] === $finalRound) {
                $m['round'] = $finalRound + 1;
            }
        }
        unset($m);

        $bronzeId = $matchId++;
        $matches[] = [
            'id'      => $bronzeId,
            'round'   => $finalRound,   // own column, directly left of the final
            'section' => 'W',
            'left'    => ['fromMatch'=>$semis[0], 'as'=>'loser'],
            'right'   => ['fromMatch'=>$semis[1], 'as'=>'loser'],
        ];
    }

    return ['matches' => $matches];
}