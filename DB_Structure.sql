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
-- Table structure for table `Matches`
-- Statuses are 'Pending', 'Active', 'Done' 

DROP TABLE IF EXISTS `Matches`;
CREATE TABLE `Matches` (
  `MatchId` int(11) NOT NULL AUTO_INCREMENT,
  `EventId` int(11) NOT NULL,
  `PendingActiveDone` ENUM('P','A','D') NOT NULL DEFAULT 'P',
  `MatchRingNo` int(11) NOT NULL,
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
  CONSTRAINT `FK_Bracket_Events` FOREIGN KEY (`EventId`) REFERENCES `Events` (`EventId`)
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
  `MatchNo` int(11) NOT NULL,
  `NextMatchWin` int(11) NULL,
  `NextMatchLoss` int(11) NULL,
  PRIMARY KEY (`BracketId`, `MatchId`),
  CONSTRAINT `FK_BracketMatches_Brackets` FOREIGN KEY (`BracketId`) REFERENCES `Brackets` (`BracketId`),
  CONSTRAINT `FK_BracketMatches_Matches` FOREIGN KEY (`MatchId`) REFERENCES `Matches` (`MatchId`) ON DELETE CASCADE,
  CONSTRAINT `FK_BracketMatches_NextWinMatch` FOREIGN KEY (`NextMatchWin`) REFERENCES `Matches` (`MatchId`),
  CONSTRAINT `FK_BracketMatches_NextLossMatch` FOREIGN KEY (`NextMatchLoss`) REFERENCES `Matches` (`MatchId`)
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
  CONSTRAINT `FK_Pools_Events` FOREIGN KEY (`EventId`) REFERENCES `Events` (`EventId`),
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
