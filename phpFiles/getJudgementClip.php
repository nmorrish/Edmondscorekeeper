<?php
/**
 * getJudgementClip.php
 *
 * Returns the list of video clips linked to a given ExchangeId from the
 * ExchangeVideos table. Each exchange may have multiple clips — one per
 * camera that uploaded footage for it.
 *
 * GET params:
 *   exchangeId (int)
 *
 * Responses:
 *   200  { status: 'ok',        clips: [{cameraNumber, relativePath, uploadedAt}, ...] }
 *   404  { status: 'not_found', message: 'No such exchange'    }   // exchange row missing
 *   404  { status: 'not_found', message: 'No clips linked yet' }   // exchange exists, no uploads
 *   400  { status: 'error',     message: 'Bad exchangeId'      }
 *
 * VideoFilename in ExchangeVideos holds the full relative path from judgementClips/ inward,
 * e.g. tournament_1/event_2/match_3/exchange_4/4-cam1.webm
 * The caller prepends the base URL for playback — no path construction needed client-side.
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'GET required']);
    exit;
}

$exchangeId = isset($_GET['exchangeId']) ? (int)$_GET['exchangeId'] : 0;
if ($exchangeId <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Bad exchangeId']);
    exit;
}

require_once('connect.php');

try {
    $db = connect();

    // Step 1: confirm the exchange exists at all. This lets us distinguish
    // "no such exchange" from "exchange exists but nothing uploaded yet,"
    // which matters for the replay page's polling loop.
    $checkStmt = $db->prepare("
        SELECT ExchangeId
        FROM Exchanges
        WHERE ExchangeId = :id
        LIMIT 1
    ");
    $checkStmt->execute([':id' => $exchangeId]);

    if (!$checkStmt->fetch(PDO::FETCH_ASSOC)) {
        http_response_code(404);
        echo json_encode(['status' => 'not_found', 'message' => 'No such exchange']);
        exit;
    }

    // Step 2: fetch every clip uploaded for this exchange, ordered by
    // camera number so the client always sees them in a consistent order.
    $stmt = $db->prepare("
        SELECT CameraNumber, VideoFilename, UploadedAt
        FROM ExchangeVideos
        WHERE ExchangeId = :id
        ORDER BY CameraNumber ASC
    ");
    $stmt->execute([':id' => $exchangeId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows)) {
        http_response_code(404);
        echo json_encode(['status' => 'not_found', 'message' => 'No clips linked yet']);
        exit;
    }

    $clips = array_map(function ($row) {
        return [
            'cameraNumber' => (int)$row['CameraNumber'],
            'relativePath' => $row['VideoFilename'],  // full path from judgementClips/ inward
            'uploadedAt'   => $row['UploadedAt'],
        ];
    }, $rows);

    echo json_encode(['status' => 'ok', 'clips' => $clips]);

} catch (PDOException $e) {
    error_log("getJudgementClip failed: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Query failed']);
}