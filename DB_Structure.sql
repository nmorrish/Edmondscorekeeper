-- phpMyAdmin SQL Dump
-- version 5.1.1deb5ubuntu1
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Aug 13, 2024 at 01:17 AM
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
  `fighterColor` varchar(20) DEFAULT NULL,
  `fighterId` int(11) DEFAULT NULL,
  `matchId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Bout_Score`
--

DROP TABLE IF EXISTS `Bout_Score`;
CREATE TABLE `Bout_Score` (
  `scoreId` int(11) NOT NULL,
  `contact` bit(1) DEFAULT b'0',
  `target` bit(1) DEFAULT b'0',
  `control` bit(1) DEFAULT b'0',
  `boutId` int(11) DEFAULT 0,
  `timeStamp` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `afterBlow` bit(1) DEFAULT b'0',
  `doubleHit` bit(1) DEFAULT b'0',
  `opponentSelfCall` bit(1) DEFAULT b'0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `data_dump`
--

DROP TABLE IF EXISTS `data_dump`;
CREATE TABLE `data_dump` (
  `pk` int(11) NOT NULL,
  `data` varchar(255) NOT NULL
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
  `lastJudgement` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `Bouts`
--
ALTER TABLE `Bouts`
  ADD PRIMARY KEY (`boutId`),
  ADD UNIQUE KEY `fighterId` (`fighterId`,`matchId`),
  ADD KEY `matchId` (`matchId`),
  ADD KEY `idx_fighter_match` (`fighterId`,`matchId`);

--
-- Indexes for table `Bout_Score`
--
ALTER TABLE `Bout_Score`
  ADD PRIMARY KEY (`scoreId`),
  ADD KEY `boutId` (`boutId`);

--
-- Indexes for table `data_dump`
--
ALTER TABLE `data_dump`
  ADD PRIMARY KEY (`pk`);

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
  ADD PRIMARY KEY (`matchId`);

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
-- AUTO_INCREMENT for table `data_dump`
--
ALTER TABLE `data_dump`
  MODIFY `pk` int(11) NOT NULL AUTO_INCREMENT;

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
  ADD CONSTRAINT `Bouts_ibfk_1` FOREIGN KEY (`fighterId`) REFERENCES `Fighters` (`fighterId`),
  ADD CONSTRAINT `Bouts_ibfk_2` FOREIGN KEY (`matchId`) REFERENCES `Matches` (`matchId`);

--
-- Constraints for table `Bout_Score`
--
ALTER TABLE `Bout_Score`
  ADD CONSTRAINT `Bout_Score_ibfk_1` FOREIGN KEY (`boutId`) REFERENCES `Bouts` (`boutId`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
