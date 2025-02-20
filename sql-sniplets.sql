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
