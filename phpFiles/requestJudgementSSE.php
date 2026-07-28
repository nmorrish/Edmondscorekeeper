<?php
/**
 * requestJudgementSSE.php
 *
 * SSE endpoint that watches for updates to `Matches.lastMatchJudgement`
 * for matches in a specific ring.
 *
 * Features:
 * - Heartbeat every 5s to keep the connection alive.
 * - Detects when the browser disconnects and terminates the loop.
 * - (Added) 204 for non-GET requests (preflight/HEAD).
 * - (Added) Disable proxy buffering and set retry directive.
 * - (Added) Unlimited execution time to avoid timeouts.
 * - (Added) judgesSubmitted list (per exchange), so clients know who already sent scores.
 */

// --- short-circuit non-GET requests (preflight/HEAD, etc.) ---
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(204);
    exit;
}

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

set_time_limit(0);
ignore_user_abort(false);

// Prevent buffering
@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', 0);
@ini_set('implicit_flush', 1);
@ini_set('max_execution_time', 0);
@set_time_limit(0);
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', '1');
}
while (ob_get_level() > 0) ob_end_flush();
ob_implicit_flush(1);

require_once("connect.php");

// --- util: send SSE packet ---
function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "retry: 5000\n";           // tell browser to auto-reconnect after 5s
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    @ob_flush();
    @flush();
}

// --- util: send heartbeat ---
function sendHeartbeat() {
    echo "event: heartbeat\n";
    echo "data: " . json_encode([
        'time'      => date('H:i:s'),
        'serverNow' => (int) round(microtime(true) * 1000),
    ]) . "\n\n";
    @ob_flush();
    @flush();
}
// --- validate input ---
$ringNumber = isset($_GET['ringNumber']) ? intval($_GET['ringNumber']) : null;
if ($ringNumber === null || $ringNumber <= 0) {
    sendSSEData(['status' => 'error', 'message' => 'Ring number not provided']);
    exit;
}

try {
    $db = connect();
} catch (PDOException $e) {
    error_log("DB connect failed: " . $e->getMessage());
    sendSSEData(['status' => 'error', 'message' => 'Database connection failed']);
    exit;
}

$lastJudgement = null;
$lastHeartbeat = time();

// --- prepared query: get most recent judgement in this ring ---
$stmtLatest = $db->prepare("
    SELECT m.MatchId, m.lastMatchJudgement
    FROM Matches m
    WHERE m.MatchRingNo = :ring
    ORDER BY m.lastMatchJudgement DESC
    LIMIT 1
");
$stmtLatest->bindParam(':ring', $ringNumber, PDO::PARAM_INT);

// --- main loop ---
while (true) {
    // --- detect disconnect ---
    if (connection_aborted() || connection_status() != CONNECTION_NORMAL) {
        error_log("SSE connection aborted for ring $ringNumber");
        exit;
    }

    try {
        $stmtLatest->execute();
        $result = $stmtLatest->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            $matchId = (int)$result['MatchId'];
            $currentJudgement = $result['lastMatchJudgement'];

            if ($lastJudgement !== null && $currentJudgement !== $lastJudgement) {
                // --- fetch match + fighter details ---
                $stmtDetails = $db->prepare("
                    SELECT 
                        m.MatchId, 
                        m.MatchRingNo,
                        m.ExchangeDurationMs, 
                        mf1.FighterId AS fighter1Id,
                        f1.FighterName AS fighter1Name,
                        mf1.FighterColor AS fighter1Color,
                        mf2.FighterId AS fighter2Id,
                        f2.FighterName AS fighter2Name,
                        mf2.FighterColor AS fighter2Color,
                        m.lastMatchJudgement,
                        m.LastUpdateType,
                        CAST(UNIX_TIMESTAMP(m.lastMatchJudgement) * 1000 AS UNSIGNED) AS lastJudgementEpochMs,
                        (
                            SELECT e.ExchangeId
                            FROM Exchanges e
                            JOIN MatchFighters mf ON e.MatchFighterId = mf.MatchFighterId
                            WHERE mf.MatchId = m.MatchId
                            ORDER BY e.ExchangeId DESC
                            LIMIT 1
                        ) AS latestExchangeId
                    FROM Matches m
                    LEFT JOIN MatchFighters mf1 ON m.MatchId = mf1.MatchId AND mf1.FighterColor = 'Red'
                    LEFT JOIN Fighters f1 ON mf1.FighterId = f1.FighterId
                    LEFT JOIN MatchFighters mf2 ON m.MatchId = mf2.MatchId AND mf2.FighterColor = 'Blue'
                    LEFT JOIN Fighters f2 ON mf2.FighterId = f2.FighterId
                    WHERE m.MatchId = :mid
                ");
                $stmtDetails->execute([':mid' => $matchId]);
                $row = $stmtDetails->fetch(PDO::FETCH_ASSOC);

                // --- fetch judges who have submitted scores for the most recent exchange in this match ---
                $stmtJudges = $db->prepare("
                    SELECT DISTINCT es.JudgeName
                    FROM ExchangeScores es
                    WHERE es.ExchangeId = (
                        SELECT e.ExchangeId
                        FROM Exchanges e
                        JOIN MatchFighters mf ON e.MatchFighterId = mf.MatchFighterId
                        WHERE mf.MatchId = :mid
                        ORDER BY e.ExchangeId DESC
                        LIMIT 1
                    )
                ");
                $stmtJudges->execute([':mid' => $matchId]);
                $judges = $stmtJudges->fetchAll(PDO::FETCH_COLUMN);

                if ($row) {
                    $payload = [
                        'matchId'         => $row['MatchId'],
                        'matchRing'       => $row['MatchRingNo'],
                        'fighter1Id'      => $row['fighter1Id'],
                        'fighter1Name'    => $row['fighter1Name'],
                        'fighter1Color'   => $row['fighter1Color'],
                        'fighter2Id'      => $row['fighter2Id'],
                        'fighter2Name'    => $row['fighter2Name'],
                        'fighter2Color'   => $row['fighter2Color'],
                        'lastJudgement'   => $currentJudgement,
                        'updateType'      => $row['LastUpdateType'],
                        'judgesSubmitted' => $judges,
                        'sentAt'          => (int) $row['lastJudgementEpochMs'],  // referee press time, epoch ms
                        'serverNow'       => (int) round(microtime(true) * 1000), // dispatch time, epoch ms
                        'exchangeId'      => $row['latestExchangeId'] !== null
                          ? (int) $row['latestExchangeId']
                          : null,
                        'exchangeDurationMs'  => $row['ExchangeDurationMs'] !== null
                            ? (int) $row['ExchangeDurationMs']
                            : null,
                    ];
                    sendSSEData($payload);
                    $lastJudgement = $currentJudgement;
                }
            }

            if ($lastJudgement === null) {
                // signal connection is live (first init)
                sendSSEData(null);
                $lastJudgement = $currentJudgement;
            }
        }

    } catch (PDOException $e) {
        error_log("Loop query failed: " . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Query failed in loop']);
    }

    // --- send heartbeat every 5s ---
    if (time() - $lastHeartbeat >= 5) {
        sendHeartbeat();
        $lastHeartbeat = time();
    }

    sleep(5); // poll interval
}
