<?php
/**
 * uploadJudgementClip.php
 *
 * Accepts a rolling-buffer video upload from EyeOfJudgement.tsx, trims it
 * server-side with FFmpeg, then registers the result in ExchangeVideos.
 *
 * The client uploads a coarse window (slightly more footage than needed) and
 * passes `trimSecs` — the exact seconds to keep from the END of the clip.
 * FFmpeg's -sseof flag handles the precise trim without re-encoding.
 *
 * Expected POST fields:
 *   - clip          (file)   the rolling-buffer video blob
 *   - exchangeId    (int)    required; used to derive match/event/tournament and for DB linkage
 *   - cameraNumber  (int)    required; determines subfolder + DB row
 *   - mimeType      (str)    used to pick file extension
 *   - trimSecs      (float)  seconds to keep from the end (PRE + exchange + POST)
 *
 * Storage layout:
 *   ../judgementClips/
 *     tournament_[TournamentId]/
 *       event_[EventId]/
 *         match_[MatchId]/
 *           exchange_[ExchangeId]/
 *             [ExchangeId]-cam[CameraNumber].[ext]
 *
 * VideoFilename stored in DB is the full relative path from judgementClips/ inward,
 * e.g. tournament_1/event_2/match_3/exchange_4/4-cam1.webm
 * The caller prepends the base URL for playback.
 *
 * DB behaviour:
 *   INSERT INTO ExchangeVideos with ON DUPLICATE KEY UPDATE on
 *   (ExchangeId, CameraNumber). Re-uploads overwrite in place.
 *
 * If FFmpeg is unavailable or fails, the raw upload is stored as a fallback
 * so footage is never lost.
 */

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'POST required']);
    exit;
}

// ---------- Validate file ----------
if (!isset($_FILES['clip'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'No clip in request']);
    exit;
}

$file = $_FILES['clip'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Upload error', 'code' => $file['error']]);
    exit;
}

if ($file['size'] <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Empty file']);
    exit;
}

// ---------- Validate fields ----------
$exchangeId   = isset($_POST['exchangeId'])   ? (int)$_POST['exchangeId']   : 0;
$cameraNumber = isset($_POST['cameraNumber']) ? (int)$_POST['cameraNumber'] : 0;
$mimeType     = isset($_POST['mimeType'])     ? (string)$_POST['mimeType']  : '';
$trimSecs     = isset($_POST['trimSecs'])     ? (float)$_POST['trimSecs']   : 0.0;

if ($exchangeId <= 0 || $cameraNumber <= 0) {
    http_response_code(400);
    echo json_encode([
        'status'   => 'error',
        'message'  => 'Bad exchangeId or cameraNumber',
        'received' => compact('exchangeId', 'cameraNumber', 'mimeType', 'trimSecs'),
        'post_keys'      => array_keys($_POST),
        'files_keys'     => array_keys($_FILES),
        'content_length' => (int)($_SERVER['CONTENT_LENGTH'] ?? 0),
    ]);
    exit;
}

// Sanity-cap trimSecs to avoid runaway seeks on corrupted input
if ($trimSecs < 0)   $trimSecs = 0.0;
if ($trimSecs > 300) $trimSecs = 300.0;

// ---------- Derive MatchId, EventId, TournamentId from ExchangeId ----------
// Everything we need for the folder path lives in the DB. ExchangeId is the
// canonical anchor — walk up through MatchFighters → Matches → Events → Tournaments.
require_once('connect.php');

try {
    $db = connect();

    $pathStmt = $db->prepare("
        SELECT
            m.MatchId,
            m.EventId,
            e.TournamentId
        FROM Exchanges ex
        JOIN MatchFighters mf ON ex.MatchFighterId = mf.MatchFighterId
        JOIN Matches       m  ON mf.MatchId        = m.MatchId
        JOIN Events        e  ON m.EventId          = e.EventId
        WHERE ex.ExchangeId = :exchangeId
        LIMIT 1
    ");
    $pathStmt->execute([':exchangeId' => $exchangeId]);
    $pathRow = $pathStmt->fetch(PDO::FETCH_ASSOC);

} catch (PDOException $e) {
    error_log("Path lookup failed for exchangeId=$exchangeId: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'DB path lookup failed']);
    exit;
}

if (!$pathRow) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'Exchange not found', 'exchangeId' => $exchangeId]);
    exit;
}

$matchId      = (int)$pathRow['MatchId'];
$eventId      = (int)$pathRow['EventId'];
$tournamentId = (int)$pathRow['TournamentId'];

// ---------- Build storage path ----------
const CLIPS_DIRNAME = 'judgementClips';
$baseStorageDir = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . CLIPS_DIRNAME;

$relativeDir = implode(DIRECTORY_SEPARATOR, [
    "tournament_{$tournamentId}",
    "event_{$eventId}",
    "match_{$matchId}",
    "exchange_{$exchangeId}",
]);

$fullDir = $baseStorageDir . DIRECTORY_SEPARATOR . $relativeDir;

// Create the full directory tree in one shot
if (!is_dir($fullDir)) {
    if (!@mkdir($fullDir, 0755, true) && !is_dir($fullDir)) {
        error_log("Failed to create directory: $fullDir");
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Storage directory init failed']);
        exit;
    }
}
@chown($fullDir, 'www-data');
@chmod($fullDir, 0755);

// ---------- Determine extension + filename ----------
$ext      = (stripos($mimeType, 'mp4') !== false) ? 'mp4' : 'webm';
$filename = "{$exchangeId}-cam{$cameraNumber}.{$ext}";

// Relative path stored in DB — base URL prepended by the caller
$relativePath = str_replace(DIRECTORY_SEPARATOR, '/', $relativeDir) . '/' . $filename;
$targetPath   = $fullDir . DIRECTORY_SEPARATOR . $filename;

// ---------- Move raw upload into place ----------
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    error_log("move_uploaded_file failed for $targetPath");
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Could not save file']);
    exit;
}

// ---------- FFmpeg trim ----------
// Keep only the last $trimSecs from the clip. The client already waited
// POST_PADDING_MS before uploading, so the very end of the blob is the
// end of the replay window. -sseof with a negative value seeks from EOF;
// -c copy avoids a re-encode (fast, lossless quality).
$trimmed     = false;
$trimWarning = null;

if ($trimSecs > 0) {
    $rawPath = $targetPath . '.raw';
    error_log("[trim] trimSecs=$trimSecs rawPath=$rawPath");

    if (!rename($targetPath, $rawPath)) {
        $trimWarning = 'Rename to .raw failed; FFmpeg trim skipped, raw upload stored';
        error_log($trimWarning);

    } elseif (!function_exists('exec')) {
        rename($rawPath, $targetPath);
        $trimWarning = 'exec() is disabled on this server; raw upload stored';
        error_log($trimWarning);

    } else {
        // MediaRecorder WebM has no duration header, so -sseof fails on the raw upload.
        // Pass 1: remux to a temp file so FFmpeg writes a proper duration.
        // Pass 2: -sseof now works; trim and reset timestamps to start at 0.

        $fixedPath = $rawPath . '.fixed.webm';

        exec(sprintf(
            '/usr/bin/ffmpeg -y -i %s -c copy %s 2>&1',
            escapeshellarg($rawPath),
            escapeshellarg($fixedPath)
        ), $out1, $code1);

        $sourceForTrim = (file_exists($fixedPath) && filesize($fixedPath) > 0)
            ? $fixedPath
            : $rawPath;

        $ffOut  = [];
        $ffCode = 0;
        exec(sprintf(
            '/usr/bin/ffmpeg -y -sseof %.3f -i %s -c copy -avoid_negative_ts make_zero %s 2>&1',
            -(float)abs($trimSecs),
            escapeshellarg($sourceForTrim),
            escapeshellarg($targetPath)
        ), $ffOut, $ffCode);

        if ($sourceForTrim === $fixedPath) unlink($fixedPath);

        error_log("[trim] ffmpeg exit=$ffCode out=" . implode('|', $ffOut));

        $outputOk = file_exists($targetPath) && filesize($targetPath) > 0;

        if ($ffCode !== 0 || !$outputOk) {
            if (!$outputOk) rename($rawPath, $targetPath);
            else            unlink($rawPath);
            $trimWarning = "FFmpeg trim failed (exit $ffCode); raw upload stored";
        } else {
            unlink($rawPath);
            $trimmed = true;
        }
    }
}

// ---------- Link to ExchangeVideos ----------
$linked      = false;
$linkWarning = null;

try {
    // INSERT or refresh the row for (ExchangeId, CameraNumber).
    // VideoFilename holds the full relative path from judgementClips/ inward.
    // The UNIQUE KEY uq_exchange_camera makes re-uploads idempotent.
    $stmt = $db->prepare("
        INSERT INTO ExchangeVideos (ExchangeId, CameraNumber, VideoFilename)
        VALUES (:exchangeId, :cameraNumber, :relativePath)
        ON DUPLICATE KEY UPDATE
            VideoFilename = VALUES(VideoFilename),
            UploadedAt    = current_timestamp(3)
    ");
    $stmt->execute([
        ':exchangeId'   => $exchangeId,
        ':cameraNumber' => $cameraNumber,
        ':relativePath' => $relativePath,
    ]);

    // rowCount: 1 = inserted, 2 = updated existing, 0 = no change
    $linked = $stmt->rowCount() > 0;

    // --- Also link to the partner exchange (same match, same timestamp, other fighter) ---
    $partnerStmt = $db->prepare("
        SELECT e2.ExchangeId
        FROM Exchanges e1
        JOIN MatchFighters mf1 ON e1.MatchFighterId = mf1.MatchFighterId
        JOIN MatchFighters mf2 ON mf2.MatchId = mf1.MatchId
                              AND mf2.MatchFighterId != mf1.MatchFighterId
        JOIN Exchanges e2 ON e2.MatchFighterId = mf2.MatchFighterId
                         AND e2.ExchangeTimeStamp = e1.ExchangeTimeStamp
        WHERE e1.ExchangeId = :exchangeId
        LIMIT 1
    ");
    $partnerStmt->execute([':exchangeId' => $exchangeId]);
    $partnerRow = $partnerStmt->fetch(PDO::FETCH_ASSOC);

    if ($partnerRow) {
        $partnerInsert = $db->prepare("
            INSERT INTO ExchangeVideos (ExchangeId, CameraNumber, VideoFilename)
            VALUES (:exchangeId, :cameraNumber, :relativePath)
            ON DUPLICATE KEY UPDATE
                VideoFilename = VALUES(VideoFilename),
                UploadedAt    = current_timestamp(3)
        ");
        $partnerInsert->execute([
            ':exchangeId'   => $partnerRow['ExchangeId'],
            ':cameraNumber' => $cameraNumber,
            ':relativePath' => $relativePath,
        ]);
    }

} catch (PDOException $e) {
    error_log("DB link failed for $relativePath: " . $e->getMessage());
    echo json_encode([
        'status'       => 'partial',
        'message'      => 'Clip saved but DB linkage failed',
        'relativePath' => $relativePath,
        'cameraNumber' => $cameraNumber,
        'size'         => filesize($targetPath),
        'trimmed'      => $trimmed,
        'trimWarning'  => $trimWarning,
    ]);
    exit;
}

// ---------- Done ----------
echo json_encode([
    'status'       => 'ok',
    'relativePath' => $relativePath,
    'cameraNumber' => $cameraNumber,
    'size'         => filesize($targetPath),
    'linked'       => $linked,
    'trimmed'      => $trimmed,
    'warning'      => $trimWarning ?? $linkWarning,
]);