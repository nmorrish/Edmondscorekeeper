<?php
/**
 * phpFiles/doubleElim.php
 *
 * === Double Elimination Tree Builder ===
 *
 * buildDoubleElim(seededFighters, withGrandFinalReset) -> ['matches'=>[...]]
 *
 * Consumed by bracketSeeding.php. Returns matches in the shared builder
 * contract; persistence + fetchRounds live in the orchestrator.
 *
 * Column layout (BracketNo / 'round'):
 *   Winners' bracket (WB) : positive 1..F
 *   Losers'  bracket (LB) : negative -1..-(2F-2)
 *   Grand final (GF1)     : F + 1
 *   Grand final reset GF2 : F + 2  (only when withGrandFinalReset)
 *
 * Sections:
 *   WB + GF -> 'W'
 *   LB      -> 'L'
 *
 * Requires seedSlots() from bracketSeeding.php.
 *
 * Match shape (shared contract):
 *   [
 *     'id'      => int,
 *     'round'   => int,                  // BracketNo
 *     'section' => 'W' | 'L',
 *     'left'    => SLOT,
 *     'right'   => SLOT,
 *   ]
 *   SLOT = ['fighterId'=>int] | ['fromMatch'=>int, 'as'?=>'loser'] | null (BYE)
 *
 * Loser routing: a WB match's loser feeds an LB slot via
 *   ['fromMatch'=>wbId, 'as'=>'loser'].
 * LB-internal advancement uses ['fromMatch'=>lbId] (winner).
 */

/**
 * Build a seeded double-elimination bracket.
 *
 * @param array $seededFighters fighterIds in seed order (index 0 = top seed)
 * @param bool  $withGrandFinalReset  add the optional GF2 reset match
 * @return array ['matches'=>[...]]
 */
function buildDoubleElim(array $seededFighters, bool $withGrandFinalReset = false): array {
    $N = count($seededFighters);
    if ($N < 2) throw new InvalidArgumentException("Need at least 2 fighters");

    $M = 1; while ($M < $N) $M <<= 1;     // bracket size (power of two)
    $rounds = (int)round(log($M, 2));      // number of WB rounds

    $bySeed = [];
    for ($s = 1; $s <= $M; $s++) {
        $bySeed[$s] = ($s <= $N) ? $seededFighters[$s - 1] : null;
    }
    $order = seedSlots($M);

    $matchId = 1;
    $matches = [];

    // =========================================================
    // WINNERS' BRACKET
    // Build round by round. Track, per WB round, the ordered list
    // of match ids (for loser drops). BYE auto-passes carry a fighter
    // forward and produce NO loser.
    // =========================================================
    $wbRoundMatchIds = [];   // wbRoundMatchIds[r] = [matchId, ...] for WB round r (1-based)
    $carry = [];             // slots feeding the next WB round

    // --- WB Round 1 ---
    $r1 = [];
    for ($i = 0; $i < $M; $i += 2) {
        $a = $bySeed[$order[$i]];
        $b = $bySeed[$order[$i + 1]];

        if ($a !== null && $b !== null) {
            $id = $matchId++;
            $matches[] = [
                'id'=>$id, 'round'=>1, 'section'=>'W',
                'left'=>['fighterId'=>$a], 'right'=>['fighterId'=>$b],
            ];
            $r1[] = $id;
            $carry[] = ['fromMatch'=>$id];
        } else {
            // auto-pass: fighter advances, no match, no loser
            $fid = $a ?? $b;
            $carry[] = ['fighterId'=>$fid];
        }
    }
    $wbRoundMatchIds[1] = $r1;

    // --- WB Rounds 2..F ---
    $round = 2;
    while (count($carry) > 1) {
        $next = [];
        $thisRound = [];
        for ($i = 0; $i < count($carry); $i += 2) {
            $id = $matchId++;
            $matches[] = [
                'id'=>$id, 'round'=>$round, 'section'=>'W',
                'left'=>$carry[$i], 'right'=>$carry[$i + 1],
            ];
            $thisRound[] = $id;
            $next[] = ['fromMatch'=>$id];
        }
        $wbRoundMatchIds[$round] = $thisRound;
        $carry = $next;
        $round++;
    }
    $finalRound = $round - 1;            // WB final BracketNo
    $wbFinalId  = $wbRoundMatchIds[$finalRound][0];

    // =========================================================
    // LOSERS' BRACKET
    // Standard structure: LB has 2*(F-1) rounds, alternating
    //   - "major" round: existing LB survivors vs a fresh batch of WB losers
    //   - "minor" round: LB survivors play each other (halving)
    //
    // WB round r (r = 1..F) produces losers that drop into the LB:
    //   - WB round 1 losers seed LB round 1 (pair them directly).
    //   - WB round r>=2 losers drop into LB "major" rounds, against the
    //     survivors of the previous LB round.
    //
    // Drop order is reversed on alternating major rounds to reduce the
    // chance of an immediate WB rematch.
    //
    // LB BracketNo is negative: LB round k -> -k.
    // =========================================================
    $lbNo = 0;                            // LB round counter (we negate for BracketNo)
    $lbCarry = [];                        // winner-slots advancing within LB

    // helper to push an LB match
    $pushLB = function (array $left, array $right) use (&$matches, &$matchId, &$lbNo) {
        $id = $matchId++;
        $matches[] = [
            'id'=>$id, 'round'=>-($lbNo), 'section'=>'L',
            'left'=>$left, 'right'=>$right,
        ];
        return $id;
    };

    // ---- LB Round 1: pair WB round-1 losers among themselves ----
    // Losers come from wbRoundMatchIds[1], in bracket order. Pair adjacent.
    $lbNo = 1;
    $wb1Losers = $wbRoundMatchIds[1];     // each yields a loser via 'as'=>'loser'
    $roundIds = [];
    for ($i = 0; $i < count($wb1Losers); $i += 2) {
        $leftSrc  = $wb1Losers[$i] ?? null;
        $rightSrc = $wb1Losers[$i + 1] ?? null;

        if ($leftSrc !== null && $rightSrc !== null) {
            $id = $pushLB(
                ['fromMatch'=>$leftSrc,  'as'=>'loser'],
                ['fromMatch'=>$rightSrc, 'as'=>'loser']
            );
            $roundIds[] = $id;
            $lbCarry[]  = ['fromMatch'=>$id];
        } elseif ($leftSrc !== null) {
            // odd loser out: carries the single WB loser forward as an LB entrant
            $lbCarry[] = ['fromMatch'=>$leftSrc, 'as'=>'loser'];
        }
    }

    // ---- LB Rounds 2.. : alternate major (vs WB losers) / minor (internal) ----
    // After seeding LB R1 from WB R1 losers, WB rounds 2..F each feed a major round.
    // Pattern per incoming WB round r (r = 2..F):
    //   major round: pair current $lbCarry survivors against WB-r losers
    //   minor round: halve the survivors among themselves (if >1)
    $reverse = false;
    for ($r = 2; $r <= $finalRound; $r++) {
        // ----- MAJOR ROUND: LB survivors vs WB round-r losers -----
        $lbNo++;
        $wbLosers = $wbRoundMatchIds[$r];          // sources for 'as'=>'loser'
        if ($reverse) $wbLosers = array_reverse($wbLosers);
        $reverse = !$reverse;

        $survivors = $lbCarry;
        $lbCarry   = [];
        $count     = max(count($survivors), count($wbLosers));

        for ($i = 0; $i < $count; $i++) {
            $surv = $survivors[$i] ?? null;        // winner-slot from prior LB round
            $drop = isset($wbLosers[$i])
                ? ['fromMatch'=>$wbLosers[$i], 'as'=>'loser']
                : null;

            if ($surv !== null && $drop !== null) {
                $id = $pushLB($surv, $drop);
                $lbCarry[] = ['fromMatch'=>$id];
            } elseif ($surv !== null) {
                // no incoming WB loser to face (bye) -> survivor carries on
                $lbCarry[] = $surv;
            } elseif ($drop !== null) {
                // no LB survivor to face -> WB loser enters and carries on
                $lbCarry[] = $drop;
            }
        }

        // ----- MINOR ROUND: halve survivors among themselves -----
        if (count($lbCarry) > 1) {
            $lbNo++;
            $survivors = $lbCarry;
            $lbCarry   = [];
            for ($i = 0; $i < count($survivors); $i += 2) {
                $l = $survivors[$i] ?? null;
                $rr = $survivors[$i + 1] ?? null;
                if ($l !== null && $rr !== null) {
                    $id = $pushLB($l, $rr);
                    $lbCarry[] = ['fromMatch'=>$id];
                } elseif ($l !== null) {
                    $lbCarry[] = $l;   // odd one out advances
                }
            }
        }
    }

    // LB winner: the single slot left in $lbCarry.
    $lbWinnerSlot = !empty($lbCarry) ? $lbCarry[0] : null;

    // =========================================================
    // GRAND FINAL
    // GF1: WB winner (left) vs LB winner (right)
    // GF2 (reset, optional): both GF1 fighters advance into it
    //   (GF1 NextMatchWin -> GF2 AND NextMatchLoss -> GF2)
    // =========================================================
    $gf1 = $matchId++;
    $matches[] = [
        'id'=>$gf1, 'round'=>$finalRound + 1, 'section'=>'W',
        'left'  => ['fromMatch'=>$wbFinalId],                    // WB winner
        'right' => $lbWinnerSlot ?? null,                        // LB winner
    ];

    if ($withGrandFinalReset) {
        $gf2 = $matchId++;
        // GF2 receives BOTH of GF1's fighters: winner via NextMatchWin,
        // loser via NextMatchLoss. Both resolve through the existing trigger.
        $matches[] = [
            'id'=>$gf2, 'round'=>$finalRound + 2, 'section'=>'W',
            'left'  => ['fromMatch'=>$gf1],                      // GF1 winner
            'right' => ['fromMatch'=>$gf1, 'as'=>'loser'],       // GF1 loser
        ];
    }

    return ['matches' => $matches];
}