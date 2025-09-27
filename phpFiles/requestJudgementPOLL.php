<?php
/**
 * requestJudgementPOLL.php
 * 
 * Polling fallback for judges if SSE fails.
 * Returns the most recent match in a given ring with its fighter details
 * only if lastMatchJudgement has changed since the client’s last known value.
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache');

require_once("connect.php");

// --- validate input ---
$ringNumber = isset($_GET['ringNumber']) ? intval($_GET['ringNumber']) : null;
$lastKnown  = isset($_GET['lastKnown']) ? $_GET['lastKnown'] : null;

if ($ringNumber === null || $ringNumber <= 0) {
    echo json_encode(['status' => 'error', 'message' => 'Ring number not provided.']);
    exit;
}

try {
    $db = connect();
} catch (PDOException $e) {
    error_log("Database connection failed: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed.']);
    exit;
}

try {
    // Get the most recent match for this ring (exclude NULL judgements)
    $stmt = $db->prepare("
        SELECT MatchId, lastMatchJudgement
        FROM Matches
        WHERE MatchRingNo = :ring
          AND lastMatchJudgement IS NOT NULL
        ORDER BY lastMatchJudgement DESC
        LIMIT 1
    ");
    $stmt->execute([':ring' => $ringNumber]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($result) {
        $matchId            = (int)$result['MatchId'];
        $lastMatchJudgement = $result['lastMatchJudgement'];

        // --- compare client vs server timestamps ---
        if ($lastKnown !== null && $lastMatchJudgement !== null) {
            $clientTs = strtotime($lastKnown);
            $serverTs = strtotime($lastMatchJudgement);

            if ($clientTs !== false && $serverTs !== false && $clientTs >= $serverTs) {
                echo json_encode(['status' => 'no_update', 'message' => 'No new judgement.']);
                exit;
            }
        }

        // Get match + fighter details
        $stmtDetails = $db->prepare("
            SELECT 
                m.MatchId, 
                m.MatchRingNo,
                mf1.FighterId AS fighter1Id,
                f1.FighterName AS fighter1Name,
                mf1.FighterColor AS fighter1Color,
                mf2.FighterId AS fighter2Id,
                f2.FighterName AS fighter2Name,
                mf2.FighterColor AS fighter2Color,
                m.lastMatchJudgement
            FROM Matches m
            LEFT JOIN MatchFighters mf1 ON m.MatchId = mf1.MatchId AND mf1.FighterColor = 'Red'
            LEFT JOIN Fighters f1 ON mf1.FighterId = f1.FighterId
            LEFT JOIN MatchFighters mf2 ON m.MatchId = mf2.MatchId AND mf2.FighterColor = 'Blue'
            LEFT JOIN Fighters f2 ON mf2.FighterId = f2.FighterId
            WHERE m.MatchId = :mid
        ");
        $stmtDetails->execute([':mid' => $matchId]);

        if ($row = $stmtDetails->fetch(PDO::FETCH_ASSOC)) {
            $payload = [
                'status'        => 'success',
                'matchId'       => $row['MatchId'],
                'matchRing'     => $row['MatchRingNo'],
                'fighter1Id'    => $row['fighter1Id'],
                'fighter1Name'  => $row['fighter1Name'],
                'fighter1Color' => $row['fighter1Color'],
                'fighter2Id'    => $row['fighter2Id'],
                'fighter2Name'  => $row['fighter2Name'],
                'fighter2Color' => $row['fighter2Color'],
                'lastJudgement' => $row['lastMatchJudgement']
            ];
            echo json_encode($payload);
        } else {
            echo json_encode(['status' => 'no_update', 'message' => 'No fighters linked to this match.']);
        }
    } else {
        // Nothing with lastMatchJudgement set
        echo json_encode(['status' => 'no_update', 'message' => 'No judged matches found for this ring.']);
    }
} catch (PDOException $e) {
    error_log("Query failed: " . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => 'Query failed.']);
} finally {
    $db = null;
}
