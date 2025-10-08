--
-- SQL create statement for database.
--

SET NAMES utf8mb4;
SET sql_mode = 'STRICT_ALL_TABLES';

-- --------------------------------------------------------
--
-- Table structure for table `Tournament`
-- Table for the tournament. All other aspects of this project are encompased under 'tournament'

DROP TABLE IF EXISTS `Tournaments`;
CREATE TABLE `Tournaments` (
  `TournamentId` int(11) NOT NULL AUTO_INCREMENT,
  `TournamentName` varchar(50) NOT NULL,
  `TournamentStartDate` datetime NOT NULL,
  `TournamentEndDate` datetime NOT NULL,
  `TournamentDescription` TEXT NOT NULL,
  `TournamentRules` TEXT NOT NULL,
  PRIMARY KEY (`TournamentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

-- --------------------------------------------------------

--
-- Table structure for table `Club`
-- Holds info on clubs

DROP TABLE IF EXISTS `Clubs`;
CREATE TABLE `Clubs` (
  `ClubId` int(11) NOT NULL AUTO_INCREMENT,
  `ClubName` varchar(50) NOT NULL,
  `ClubLogo` varchar(255) NULL,
  `ClubAcronym` VARCHAR(10) NULL,
  PRIMARY KEY (`ClubId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `Fighter`
-- Holds fighter data.

DROP TABLE IF EXISTS `Fighters`;
CREATE TABLE `Fighters` (
  `FighterId` int(11) NOT NULL AUTO_INCREMENT,
  `ClubId` int(11) NULL,
  `FighterName` varchar(120) NOT NULL,
  `FighterPortrait` varchar(120) NULL,
  PRIMARY KEY (`FighterId`),
  CONSTRAINT `FK_Fighter_Club` FOREIGN KEY (`ClubId`) REFERENCES `Clubs` (`ClubId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `TournamentFighters`
-- Primarily for holding fighter strikes. Strikes are accumulated tournament-wide, but do not carry over across tournaments.

DROP TABLE IF EXISTS `TournamentFighters`;
CREATE TABLE `TournamentFighters` (
  `FighterId` int(11) NOT NULL,
  `TournamentId` int(11) NOT NULL,
  `Strikes` int(11) DEFAULT NULL,
  PRIMARY KEY (`FighterId`,`TournamentId`),
  CONSTRAINT `FK_TournamentFighters_Tournament` FOREIGN KEY (`TournamentId`) REFERENCES `Tournaments` (`TournamentId`),
  CONSTRAINT `FK_TournamentFighters_Fighter` FOREIGN KEY (`FighterId`) REFERENCES `Fighters` (`FighterId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `Weapons`
-- Table for specifying weapons used in events

DROP TABLE IF EXISTS `Weapons`;
CREATE TABLE `Weapons` (
  `WeaponId` int(11) NOT NULL AUTO_INCREMENT,
  `WeaponName` varchar(30) NOT NULL,
  `WeaponRequirements` TEXT NOT NULL,
  `GearRequirements` TEXT NOT NULL,
  PRIMARY KEY (`WeaponId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 


-- --------------------------------------------------------

--
-- Table structure for table `Events`
--

DROP TABLE IF EXISTS `Events`;
CREATE TABLE `Events` (
  `EventId` int(11) NOT NULL AUTO_INCREMENT,
  `EventName` varchar(30) NOT NULL,
  `EventRules` TEXT NOT NULL,
  `WeaponId` int(11) NOT NULL,
  `TournamentId` int(11) NOT NULL,
  `MaxRings` int(11) NOT NULL,
  PRIMARY KEY (`EventId`),
  CONSTRAINT `FK_Event_Tournament` FOREIGN KEY (`TournamentId`) REFERENCES `Tournaments` (`TournamentId`),
  CONSTRAINT `FK_Event_Weapon` FOREIGN KEY (`WeaponId`) REFERENCES `Weapons` (`WeaponId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

-- --------------------------------------------------------

--
-- Table structure for table `EventFighters`

DROP TABLE IF EXISTS `EventFighters`;
CREATE TABLE `EventFighters` (
  `EventId` int(11) NOT NULL,
  `FighterId` int(11) NOT NULL,
  PRIMARY KEY (`EventId`, `FighterId`),
  CONSTRAINT `FK_EventFighter_Event` FOREIGN KEY (`EventId`) REFERENCES `Events` (`EventId`) ON DELETE CASCADE,
  CONSTRAINT `FK_EventFighter_Fighter` FOREIGN KEY (`FighterId`) REFERENCES `Fighters` (`FighterId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



-- --------------------------------------------------------

--
-- Table structure for table `Matches`
-- Statuses are 'Pending', 'Active', 'Done' 

DROP TABLE IF EXISTS `Matches`;
CREATE TABLE `Matches` (
  `MatchId` int(11) NOT NULL AUTO_INCREMENT,
  `EventId` int(11) NOT NULL,
  `PendingActiveDone` ENUM('P','A','D') NOT NULL DEFAULT 'P',
  `MatchRingNo` int(11) NOT NULL,
  `MatchQueueNumber` int(11) DEFAULT NULL,
  `lastMatchJudgement` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`MatchId`),
  CONSTRAINT `FK_Match_Event` FOREIGN KEY (`EventId`) REFERENCES `Events` (`EventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `MatchFighter`
-- Creates a link to Match for when no exchanges exist yet and assigns fighter color.
-- Holds derived values for easy access after match. (FinalScore + Win/Loss/Draw)
-- Score Modifier is for adding/subtracting points to correct mistakes or on order from Referee

DROP TABLE IF EXISTS `MatchFighters`;
CREATE TABLE `MatchFighters` (
  `MatchFighterId` int(11) NOT NULL AUTO_INCREMENT,
  `MatchId` int(11) NOT NULL,
  `FighterId` int(11) NOT NULL,
  `FighterColor` varchar(15) NOT NULL,
  `FinalScore` decimal(6,2) NULL,
  `ScoreModifier` decimal(6,2) NULL,
  `WinLossDraw` ENUM('W','L','D') NULL,
  PRIMARY KEY (`MatchFighterId`),
  CONSTRAINT `FK_MatchFighter_Match` FOREIGN KEY (`MatchId`) REFERENCES `Matches` (`MatchId`) ON DELETE CASCADE,
  CONSTRAINT `FK_MatchFighter_Fighter` FOREIGN KEY (`FighterId`) REFERENCES `Fighters` (`FighterId`),
  UNIQUE KEY uq_match_color (`MatchId`, `FighterColor`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- --------------------------------------------------------

--
-- Table structure for table `Exchange`
--

CREATE TABLE `Exchanges` (
  `ExchangeId` int(11) NOT NULL AUTO_INCREMENT,
  `MatchFighterId` int(11) NOT NULL,
  `ExchangeTimeStamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`ExchangeId`),
  CONSTRAINT `FK_Exchange_MatchFighter` FOREIGN KEY (`MatchFighterId`) REFERENCES `MatchFighters` (`MatchFighterId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `ExchangeScores`
--

DROP TABLE IF EXISTS `ExchangeScores`;
CREATE TABLE `ExchangeScores` (
  `ExchangeScoresId` int(11) NOT NULL AUTO_INCREMENT,
  `ExchangeId` int(11) NOT NULL,
  `JudgeName` varchar(50) NOT NULL,
  `Contact` boolean DEFAULT false,
  `Target` boolean DEFAULT false,
  `Control` boolean DEFAULT false,
  `DoubleHit` boolean NOT NULL DEFAULT false,
  `AfterBlow` boolean DEFAULT false,
  `OpponentSelfCall` boolean DEFAULT false,
  `ScoreTimeStamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`ExchangeScoresId`),
  CONSTRAINT `FK_ExchangeScores_Exchanges` FOREIGN KEY (`ExchangeId`) REFERENCES `Exchanges` (`ExchangeId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- --------------------------------------------------------

--
-- Table structure for table `Brackets`
-- Bracket table will handle single and double elimination formats (S or D), 

DROP TABLE IF EXISTS `Brackets`;
CREATE TABLE `Brackets` (
  `BracketId` int(11) NOT NULL AUTO_INCREMENT,
  `EventId` int(11) NOT NULL,
  `BracketFormat` ENUM('S','D') NOT NULL,
  PRIMARY KEY (`BracketId`),
  CONSTRAINT `FK_Bracket_Events` FOREIGN KEY (`EventId`) REFERENCES `Events` (`EventId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

-- --------------------------------------------------------

--
-- Table structure for table `BracketMatches`
-- Table for ordering matches within single/double elimination events
-- NextMatchWin points to the next match where the winners fight
-- NextMatchLoss points to the next match fought for double elimination

DROP TABLE IF EXISTS `BracketMatches`;
CREATE TABLE `BracketMatches` (
  `BracketId` int(11) NOT NULL,
  `MatchId` int(11) NOT NULL,
  `BracketNo` int(11) NOT NULL,
  `NextMatchWin` int(11) NULL,
  `NextMatchLoss` int(11) NULL,
  `BracketSection` ENUM('W','L') NOT NULL,
  PRIMARY KEY (`BracketId`, `MatchId`),
  CONSTRAINT `FK_BracketMatches_Brackets` FOREIGN KEY (`BracketId`) REFERENCES `Brackets` (`BracketId`),
  CONSTRAINT `FK_BracketMatches_Matches` FOREIGN KEY (`MatchId`) REFERENCES `Matches` (`MatchId`) ON DELETE CASCADE,
  CONSTRAINT `FK_BracketMatches_NextWinMatch` FOREIGN KEY (`NextMatchWin`) REFERENCES `Matches` (`MatchId`) ON DELETE SET NULL,
  CONSTRAINT `FK_BracketMatches_NextLossMatch` FOREIGN KEY (`NextMatchLoss`) REFERENCES `Matches` (`MatchId`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

-- --------------------------------------------------------

--
-- Table structure for table `Pools`
-- Table for specifying pools

DROP TABLE IF EXISTS `Pools`;
CREATE TABLE `Pools` (
  `PoolId` int(11) NOT NULL AUTO_INCREMENT,
  `EventId` int(11) NOT NULL,
  `PoolNo` int(11) NOT NULL,
  `MinFighters` int(11) NOT NULL DEFAULT 4,
  `MaxFighters` int(11) NOT NULL DEFAULT 5,
  PRIMARY KEY (`PoolId`),
  CONSTRAINT `FK_Pools_Events` FOREIGN KEY (`EventId`) REFERENCES `Events` (`EventId`)  ON DELETE CASCADE,
  UNIQUE KEY uq_event_poolno (`EventId`, `PoolNo`),
  CONSTRAINT chk_pool_sizes CHECK (`MinFighters` > 0 AND `MaxFighters` >= `MinFighters`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

-- --------------------------------------------------------

--
-- Table structure for table `PoolMatches`
-- Table for grouping matches inside pools

DROP TABLE IF EXISTS `PoolMatches`;
CREATE TABLE `PoolMatches` (
  `PoolId` int(11) NOT NULL,
  `MatchId` int(11) NOT NULL,
  PRIMARY KEY (`PoolId`,`MatchId`),
  CONSTRAINT `FK_PoolMatches_Pools` FOREIGN KEY (`PoolId`) REFERENCES `Pools` (`PoolId`),
  CONSTRAINT `FK_PoolMatches_Match` FOREIGN KEY (`MatchId`) REFERENCES `Matches` (`MatchId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4; 

-- --------------------------------------------------------

--
-- Table structure for table `PoolFighters`
-- Holds an list of fighters in pools separate from matches.

DROP TABLE IF EXISTS `PoolFighters`;
CREATE TABLE PoolFighters (
    `PoolFighterId` INT AUTO_INCREMENT PRIMARY KEY,
    `PoolId` INT NOT NULL,
    `FighterId` INT NOT NULL,
    UNIQUE (`PoolId`, `FighterId`),
    FOREIGN KEY (`PoolId`) REFERENCES `Pools` (`PoolId`) ON DELETE CASCADE,
    FOREIGN KEY (`FighterId`) REFERENCES `Fighters` (`FighterId`) ON DELETE CASCADE
);

--
-- Create FK Indexes
-- 

CREATE INDEX idx_fighters_club ON Fighters(ClubId);
CREATE INDEX idx_tf_tournament ON TournamentFighters(TournamentId);
CREATE INDEX idx_events_tournament ON Events(TournamentId);
CREATE INDEX idx_events_weapon ON Events(WeaponId);
CREATE INDEX idx_matches_event ON Matches(EventId);
CREATE INDEX idx_mf_fighter ON MatchFighters(FighterId);
CREATE INDEX idx_pools_event ON Pools(EventId);
CREATE INDEX idx_poolmatches_match ON PoolMatches(MatchId);
CREATE INDEX idx_exchanges_matchfighter ON Exchanges(MatchFighterId);
CREATE INDEX idx_bm_nextwin  ON BracketMatches(NextMatchWin);
CREATE INDEX idx_bm_nextloss ON BracketMatches(NextMatchLoss);

-- --------------------------------------------------------

--
-- Triggers
-- 
-- --------------------------------------------------------
-- Trigger: trg_finalize_match
-- When a match is marked Done ('D'), compute FinalScore and W/L/D
-- Rules:
--   - Criteria that yield points: Contact, Target, Control, AfterBlow, OpponentSelfCall
--   - Doubles are ignored
--   - For each exchange, each criterion = AVG over judges (1 for true, 0 for false)
--   - FinalScore = SUM over exchanges of (avgContact + avgTarget + avgControl + avgAfterBlow + avgSelfCall)
--   - Then add ScoreModifier (if any) and ROUND(2)
-- --------------------------------------------------------
DROP TRIGGER IF EXISTS trg_finalize_match;
DELIMITER $$

CREATE TRIGGER trg_finalize_match
AFTER UPDATE ON Matches
FOR EACH ROW
BEGIN
  -- Only act on transition to 'D'
  IF NEW.PendingActiveDone = 'D' AND (OLD.PendingActiveDone IS NULL OR OLD.PendingActiveDone <> 'D') THEN

    /* 1) Compute FinalScore for each fighter in this match
          - LEFT JOIN ExchangeScores so exchanges with no scores contribute 0s
          - IFNULL around AVG() to turn NULL (no rows) into 0
    */
    UPDATE MatchFighters mf
    LEFT JOIN (
      SELECT
        px.MatchFighterId,
        SUM(
          IFNULL(px.avgContact,0)
        + IFNULL(px.avgTarget,0)
        + IFNULL(px.avgControl,0)
        + IFNULL(px.avgAfterBlow,0)
        + IFNULL(px.avgSelfCall,0)
        ) AS GrandTotal
      FROM (
        SELECT
          e.MatchFighterId,
          e.ExchangeId,
          IFNULL(AVG(CASE WHEN s.Contact            = 1 THEN 1 ELSE 0 END), 0) AS avgContact,
          IFNULL(AVG(CASE WHEN s.Target             = 1 THEN 1 ELSE 0 END), 0) AS avgTarget,
          IFNULL(AVG(CASE WHEN s.Control            = 1 THEN 1 ELSE 0 END), 0) AS avgControl,
          IFNULL(AVG(CASE WHEN s.AfterBlow          = 1 THEN 1 ELSE 0 END), 0) AS avgAfterBlow,
          IFNULL(AVG(CASE WHEN s.OpponentSelfCall   = 1 THEN 1 ELSE 0 END), 0) AS avgSelfCall
          -- NOTE: DoubleHit intentionally ignored per spec
        FROM Exchanges e
        LEFT JOIN ExchangeScores s ON s.ExchangeId = e.ExchangeId
        WHERE e.MatchFighterId IN (
          SELECT mf2.MatchFighterId FROM MatchFighters mf2 WHERE mf2.MatchId = NEW.MatchId
        )
        GROUP BY e.MatchFighterId, e.ExchangeId
      ) px
      GROUP BY px.MatchFighterId
    ) calc ON calc.MatchFighterId = mf.MatchFighterId
    SET mf.FinalScore = ROUND(IFNULL(calc.GrandTotal, 0) + IFNULL(mf.ScoreModifier, 0), 2)
    WHERE mf.MatchId = NEW.MatchId;

    /* 2) Set Win/Loss/Draw via self-join comparison within the same match */
    UPDATE MatchFighters mf
    JOIN MatchFighters other
      ON other.MatchId = mf.MatchId
     AND other.MatchFighterId <> mf.MatchFighterId
    SET mf.WinLossDraw = CASE
      WHEN COALESCE(mf.FinalScore,0) > COALESCE(other.FinalScore,0) THEN 'W'
      WHEN COALESCE(mf.FinalScore,0) < COALESCE(other.FinalScore,0) THEN 'L'
      ELSE 'D'
    END
    WHERE mf.MatchId = NEW.MatchId;

    -- 3) Advance in rank if using brackets.

    INSERT INTO MatchFighters (MatchId, FighterId, FighterColor)
    SELECT bm.NextMatchWin, mf.FighterId,
           CASE 
             WHEN NOT EXISTS (
               SELECT 1 FROM MatchFighters WHERE MatchId = bm.NextMatchWin AND FighterColor = 'Red'
             ) THEN 'Red'
             ELSE 'Blue'
           END
    FROM BracketMatches bm
    JOIN MatchFighters mf ON mf.MatchId = NEW.MatchId
    WHERE bm.MatchId = NEW.MatchId
      AND bm.NextMatchWin IS NOT NULL
      AND mf.WinLossDraw = 'W'
      AND NOT EXISTS (
        SELECT 1 FROM MatchFighters mf2
        WHERE mf2.MatchId = bm.NextMatchWin
          AND mf2.FighterId = mf.FighterId
      );

    /* 4) Advance Losers if using brackets */
    INSERT INTO MatchFighters (MatchId, FighterId, FighterColor)
    SELECT bm.NextMatchLoss, mf.FighterId,
           CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM MatchFighters WHERE MatchId = bm.NextMatchLoss AND FighterColor = 'Red'
             ) THEN 'Red'
             ELSE 'Blue'
           END
    FROM BracketMatches bm
    JOIN MatchFighters mf ON mf.MatchId = NEW.MatchId
    WHERE bm.MatchId = NEW.MatchId
      AND bm.NextMatchLoss IS NOT NULL
      AND mf.WinLossDraw = 'L'
      AND NOT EXISTS (
        SELECT 1 FROM MatchFighters mf2
        WHERE mf2.MatchId = bm.NextMatchLoss
          AND mf2.FighterId = mf.FighterId
      );

  END IF;
END$$

DELIMITER ;

-- --------------------------------------------------------
-- Trigger: trg_finalize_match
-- Increments a matches Queue Number if not specified in the match insert statement
-- --------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_matches_queue_default
BEFORE INSERT ON Matches
FOR EACH ROW
BEGIN
  IF NEW.MatchQueueNumber IS NULL THEN
    SET NEW.MatchQueueNumber = (
      SELECT IFNULL(MAX(MatchQueueNumber), 0) + 1
      FROM Matches
      WHERE EventId = NEW.EventId
    );
  END IF;
END$$

DELIMITER ;
