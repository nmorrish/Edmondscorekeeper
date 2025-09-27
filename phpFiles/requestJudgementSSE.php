<?php
/**
 * requestJudgementSSE.php
 *
 * SSE endpoint that watches for updates to `Matches.lastMatchJudgement`
 * for matches in a specific ring.
 *
 * Features:
 * - Heartbeat every 15s to keep the connection alive.
 * - Detects when the browser disconnects and terminates the loop.
 * - (Added) 204 for non-GET requests (preflight/HEAD).
 * - (Added) Disable proxy buffering and set retry directive.
 * - (Added) Unlimited execution time to avoid timeouts.
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
// NOTE: preserves original shape: only id + data lines (no event:).
function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "retry: 5000\n";           // (Added) tell browser to auto-reconnect after 5s
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    @ob_flush();
    @flush();
}

// --- util: send heartbeat ---
// NOTE: preserves original comment-style heartbeat so onmessage doesn't fire.
function sendHeartbeat() {
    echo ": heartbeat " . date('H:i:s') . "\n\n";
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
                        'matchId'       => $row['MatchId'],
                        'matchRing'     => $row['MatchRingNo'],
                        'fighter1Id'    => $row['fighter1Id'],
                        'fighter1Name'  => $row['fighter1Name'],
                        'fighter1Color' => $row['fighter1Color'],
                        'fighter2Id'    => $row['fighter2Id'],
                        'fighter2Name'  => $row['fighter2Name'],
                        'fighter2Color' => $row['fighter2Color'],
                        'lastJudgement' => $currentJudgement
                    ];
                    sendSSEData($payload);
                    $lastJudgement = $currentJudgement;
                }
            }

            if ($lastJudgement === null) {
                // signal connection is live (preserved behavior)
                sendSSEData(null);
                $lastJudgement = $currentJudgement;
            }
        }

    } catch (PDOException $e) {
        error_log("Loop query failed: " . $e->getMessage());
        sendSSEData(['status' => 'error', 'message' => 'Query failed in loop']);
    }

    // --- send heartbeat every 15s ---
    if (time() - $lastHeartbeat >= 15) {
        sendHeartbeat();
        $lastHeartbeat = time();
    }

    sleep(5); // poll interval
}
