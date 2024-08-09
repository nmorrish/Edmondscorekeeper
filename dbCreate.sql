CREATE TABLE Fighters (
    fighterId int PRIMARY KEY AUTO_INCREMENT,
    fighterName varchar(120) UNIQUE,
    strikes int,
    INDEX idx_fighterData (fighterId,fighterName,strikes)
);

CREATE TABLE Matches (
    matchId int PRIMARY KEY AUTO_INCREMENT,
    matchRing int
);

CREATE TABLE Bouts (
    boutId int PRIMARY KEY AUTO_INCREMENT,
    fighterColor varchar(20),
    fighterId int,
    matchId int,
    UNIQUE (fighterId, matchId),
    FOREIGN KEY (fighterId) REFERENCES Fighters(fighterId),
    FOREIGN KEY (matchId) REFERENCES Matches(matchId),
    INDEX idx_fighter_match (fighterId, matchId)
);

CREATE TABLE Bout_Score(
    scoreId int PRIMARY KEY AUTO_INCREMENT,
    contact bit,
    target bit,
    control bit,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (boutId) REFERENCES Bouts(boutId)
);


