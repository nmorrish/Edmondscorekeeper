--the following SQL returns the fighters who conceded the most points:
SELECT 
    CASE 
        WHEN m.fighter1Id = bs.fighterId THEN f2.fighterName
        WHEN m.fighter2Id = bs.fighterId THEN f1.fighterName
    END AS fighterWhoSelfCalled,
    COUNT(bs.scoreId) AS selfCallsGiven
FROM 
    Bout_Score bs
JOIN 
    Bouts b ON bs.boutId = b.boutId
JOIN 
    Matches m ON b.matchId = m.matchId
JOIN 
    Fighters f1 ON m.fighter1Id = f1.fighterId
JOIN 
    Fighters f2 ON m.fighter2Id = f2.fighterId
WHERE 
    bs.opponentSelfCall = 1
GROUP BY 
    fighterWhoSelfCalled
ORDER BY 
    selfCallsGiven DESC;


--the following SQL returns total bouts fought and total points scored:
SELECT 
    f.fighterName,
    COUNT(DISTINCT bs.boutId) AS boutsFought,
    SUM(
        bs.contact + bs.target + bs.control + bs.afterBlow + bs.opponentSelfCall
    ) AS totalScore
FROM 
    Fighters f
JOIN 
    Bout_Score bs ON f.fighterId = bs.fighterId
GROUP BY 
    f.fighterName
ORDER BY 
    totalScore DESC;

--the following SQL returns the amount of double hits by each fighter:
SELECT 
    f.fighterName,
    COUNT(bs.scoreId) AS doubleHits
FROM 
    Fighters f
JOIN 
    Bout_Score bs ON f.fighterId = bs.fighterId
WHERE 
    bs.doubleHit = 1
GROUP BY 
    f.fighterName
ORDER BY 
    doubleHits DESC;


/* -----------------------------------------------------------
   Fighter standings: points, wins, losses
   Matches are considered only when matchComplete = 1.
   Grand total excludes doubleHit (matches TotalsCalculator.tsx).
------------------------------------------------------------ */
WITH
/* 1) Average judge scores per fighter per bout */
bout_avgs AS (
  SELECT
    bs.boutId,
    b.matchId,
    bs.fighterId,
    AVG(CAST(bs.contact           AS UNSIGNED)) AS avgContact,
    AVG(CAST(bs.target            AS UNSIGNED)) AS avgTarget,
    AVG(CAST(bs.control           AS UNSIGNED)) AS avgControl,
    AVG(CAST(bs.afterBlow         AS UNSIGNED)) AS avgAfterBlow,
    AVG(CAST(bs.opponentSelfCall  AS UNSIGNED)) AS avgSelfCall
    /* NOTE: doubleHit intentionally excluded from grand total,
             mirroring the React component. */
  FROM Bout_Score bs
  JOIN Bouts b ON b.boutId = bs.boutId
  GROUP BY bs.boutId, b.matchId, bs.fighterId
),

/* 2) Sum those averages across all bouts in a match for each fighter */
match_totals AS (
  SELECT
    ba.matchId,
    ba.fighterId,
    SUM(
      ba.avgContact +
      ba.avgTarget +
      ba.avgControl +
      ba.avgAfterBlow +
      ba.avgSelfCall
    ) AS matchPoints
  FROM bout_avgs ba
  GROUP BY ba.matchId, ba.fighterId
),

/* 3) Place the two fighters' totals side by side per match */
match_pairs AS (
  SELECT
    m.matchId,
    m.fighter1Id,
    COALESCE(mt1.matchPoints, 0) AS f1Points,
    m.fighter2Id,
    COALESCE(mt2.matchPoints, 0) AS f2Points
  FROM Matches m
  LEFT JOIN match_totals mt1
    ON mt1.matchId = m.matchId AND mt1.fighterId = m.fighter1Id
  LEFT JOIN match_totals mt2
    ON mt2.matchId = m.matchId AND mt2.fighterId = m.fighter2Id
  WHERE m.matchComplete = b'1'  /* only completed matches count */
),

/* 4) Expand to per-fighter rows with win/loss flags and earned points */
wins_losses AS (
  /* Fighter 1 row */
  SELECT
    mp.matchId,
    mp.fighter1Id AS fighterId,
    CASE WHEN mp.f1Points > mp.f2Points THEN 1 ELSE 0 END AS win,
    CASE WHEN mp.f1Points < mp.f2Points THEN 1 ELSE 0 END AS loss,
    mp.f1Points AS earnedPoints
  FROM match_pairs mp

  UNION ALL

  /* Fighter 2 row */
  SELECT
    mp.matchId,
    mp.fighter2Id AS fighterId,
    CASE WHEN mp.f2Points > mp.f1Points THEN 1 ELSE 0 END AS win,
    CASE WHEN mp.f2Points < mp.f1Points THEN 1 ELSE 0 END AS loss,
    mp.f2Points AS earnedPoints
  FROM match_pairs mp
),

/* 5) Aggregate per fighter across all completed matches */
final AS (
  SELECT
    f.fighterId,
    f.fighterName,
    ROUND(COALESCE(SUM(wl.earnedPoints), 0), 2) AS pointsEarned,
    COALESCE(SUM(wl.win),  0) AS wins,
    COALESCE(SUM(wl.loss), 0) AS losses
  FROM Fighters f
  LEFT JOIN wins_losses wl
    ON wl.fighterId = f.fighterId
  GROUP BY f.fighterId, f.fighterName
)

SELECT
  fighterName,
  pointsEarned,
  wins,
  losses
FROM final
ORDER BY fighterName;
