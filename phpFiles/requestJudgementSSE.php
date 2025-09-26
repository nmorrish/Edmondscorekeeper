<?php
/**
 * requestJudgementSSE.php
 *
 * SSE endpoint that watches for updates to `Matches.lastJudgement`
 * for matches in a specific ring.
 *
 * Features:
 * - Heartbeat every 15s to keep the connection alive.
 * - Detects when the browser disconnects and terminates the loop.
 */

header("Access-Control-Allow-Origin: http://localhost:5173");
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Make sure buffering doesn’t block SSE output
@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', 0);
@ini_set('implicit_flush', 1);
while (ob_get_level() > 0) ob_end_flush();
ob_implicit_flush(1);

require_once("connect.php");

// --- util: send SSE packet ---
function sendSSEData($data) {
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo "id: " . time() . "\n";
    echo "data: " . $jsonData . "\n\n";
    @ob_flush();
    @flush();
}

// --- util: send heartbeat (ignored by client) ---
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
    SELECT m.matchId, m.lastJudgement
    FROM Matches m
    WHERE m.matchRing = :ring
    ORDER BY m.lastJudgement DESC
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
            $matchId = (int)$result['matchId'];
            $currentJudgement = $result['lastJudgement'];

            if ($lastJudgement !== null && $currentJudgement !== $lastJudgement) {
                // --- fetch match + fighter details ---
                $stmtDetails = $db->prepare("
                    SELECT 
                        m.matchId, 
                        m.matchRing, 
                        m.fighter1Id,
                        m.fighter2Id,
                        m.fighter1Color,
                        m.fighter2Color,
                        f1.fighterName AS fighter1Name,
                        f2.fighterName AS fighter2Name,
                        b.boutId
                    FROM Matches m
                    LEFT JOIN Fighters f1 ON m.fighter1Id = f1.fighterId
                    LEFT JOIN Fighters f2 ON m.fighter2Id = f2.fighterId
                    LEFT JOIN Bouts b ON m.matchId = b.matchId
                    WHERE m.matchId = :mid
                    AND b.boutId = (SELECT MAX(boutId) FROM Bouts WHERE matchId = :mid)
                ");
                $stmtDetails->execute([':mid' => $matchId]);

                if ($row = $stmtDetails->fetch(PDO::FETCH_ASSOC)) {
                    $payload = [
                        'matchId' => $row['matchId'],
                        'matchRing' => $row['matchRing'],
                        'fighter1Id' => $row['fighter1Id'],
                        'fighter1Name' => $row['fighter1Name'],
                        'fighter1Color' => $row['fighter1Color'],
                        'fighter2Id' => $row['fighter2Id'],
                        'fighter2Name' => $row['fighter2Name'],
                        'fighter2Color' => $row['fighter2Color'],
                        'boutId' => $row['boutId'] ?? null,
                        'lastJudgement' => $currentJudgement
                    ];
                    sendSSEData($payload);
                    $lastJudgement = $currentJudgement;
                }
            }

            if ($lastJudgement === null) {
                sendSSEData(null); // signal connection is live
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
