-- phpMyAdmin SQL Dump
-- version 5.1.1deb5ubuntu1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Aug 17, 2024 at 02:15 AM
-- Server version: 10.6.18-MariaDB-0ubuntu0.22.04.1
-- PHP Version: 8.1.2-1ubuntu2.18

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `Edmondscores`
--

-- --------------------------------------------------------

--
-- Table structure for table `Bouts`
--

DROP TABLE IF EXISTS `Bouts`;
CREATE TABLE `Bouts` (
  `boutId` int(11) NOT NULL,
  `matchId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Bout_Score`
--

DROP TABLE IF EXISTS `Bout_Score`;
CREATE TABLE `Bout_Score` (
  `scoreId` int(11) NOT NULL,
  `fighterId` int(11) NOT NULL,
  `judgeName` varchar(50) NOT NULL,
  `doubleHit` bit(1) NOT NULL,
  `boutId` int(11) DEFAULT NULL,
  `contact` bit(1) DEFAULT b'0',
  `target` bit(1) DEFAULT b'0',
  `control` bit(1) DEFAULT b'0',
  `afterBlow` bit(1) DEFAULT b'0',
  `opponentSelfCall` bit(1) DEFAULT b'0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Fighters`
--

DROP TABLE IF EXISTS `Fighters`;
CREATE TABLE `Fighters` (
  `fighterId` int(11) NOT NULL,
  `fighterName` varchar(120) DEFAULT NULL,
  `strikes` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Matches`
--

DROP TABLE IF EXISTS `Matches`;
CREATE TABLE `Matches` (
  `matchId` int(11) NOT NULL,
  `matchRing` int(11) DEFAULT NULL,
  `fighter1Id` int(11) DEFAULT NULL,
  `fighter2Id` int(11) DEFAULT NULL,
  `fighter1Color` varchar(10) DEFAULT NULL,
  `fighter2Color` varchar(10) DEFAULT NULL,
  `lastJudgement` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `Bouts`
--
ALTER TABLE `Bouts`
  ADD PRIMARY KEY (`boutId`),
  ADD KEY `matchId` (`matchId`);

--
-- Indexes for table `Bout_Score`
--
ALTER TABLE `Bout_Score`
  ADD PRIMARY KEY (`scoreId`),
  ADD KEY `Bout_Score_ibfk` (`boutId`),
  ADD KEY `Bout_Score_bsf_1` (`fighterId`);

--
-- Indexes for table `Fighters`
--
ALTER TABLE `Fighters`
  ADD PRIMARY KEY (`fighterId`),
  ADD UNIQUE KEY `fighterName` (`fighterName`),
  ADD KEY `idx_fighterData` (`fighterId`,`fighterName`,`strikes`);

--
-- Indexes for table `Matches`
--
ALTER TABLE `Matches`
  ADD PRIMARY KEY (`matchId`),
  ADD KEY `Matches_mffk_1` (`fighter1Id`),
  ADD KEY `Matches_mffk_2` (`fighter2Id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `Bouts`
--
ALTER TABLE `Bouts`
  MODIFY `boutId` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Bout_Score`
--
ALTER TABLE `Bout_Score`
  MODIFY `scoreId` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Fighters`
--
ALTER TABLE `Fighters`
  MODIFY `fighterId` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Matches`
--
ALTER TABLE `Matches`
  MODIFY `matchId` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `Bouts`
--
ALTER TABLE `Bouts`
  ADD CONSTRAINT `Bouts_ibfk_2` FOREIGN KEY (`matchId`) REFERENCES `Matches` (`matchId`);

--
-- Constraints for table `Bout_Score`
--
ALTER TABLE `Bout_Score`
  ADD CONSTRAINT `Bout_Score_bsf_1` FOREIGN KEY (`fighterId`) REFERENCES `Fighters` (`fighterId`),
  ADD CONSTRAINT `Bout_Score_ibfk` FOREIGN KEY (`boutId`) REFERENCES `Bouts` (`boutId`);

--
-- Constraints for table `Matches`
--
ALTER TABLE `Matches`
  ADD CONSTRAINT `Matches_mffk_1` FOREIGN KEY (`fighter1Id`) REFERENCES `Fighters` (`fighterId`),
  ADD CONSTRAINT `Matches_mffk_2` FOREIGN KEY (`fighter2Id`) REFERENCES `Fighters` (`fighterId`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;