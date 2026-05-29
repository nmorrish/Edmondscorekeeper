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
 *   - matchId       (int)    used in filename
 *   - ringNumber    (int)    used in filename
 *   - cameraNumber  (int)    required; determines subfolder + DB row
 *   - pressTime     (int)    epoch ms; used in filename
 *   - mimeType      (str)    used to pick extension
 *   - exchangeId    (int)    required for DB linkage
 *   - trimSecs      (float)  seconds to keep from the end (PRE + exchange + POST)
 *
 * Storage layout:
 *   ../judgementClips/cam-<N>/match-<id>-ring-<r>-press-<ts>.<ext>
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
$matchId      = isset($_POST['matchId'])      ? (int)$_POST['matchId']      : 0;
$ringNumber   = isset($_POST['ringNumber'])   ? (int)$_POST['ringNumber']   : 0;
$cameraNumber = isset($_POST['cameraNumber']) ? (int)$_POST['cameraNumber'] : 0;
$pressTime    = isset($_POST['pressTime'])    ? (int)$_POST['pressTime']    : 0;
$exchangeId   = isset($_POST['exchangeId'])   ? (int)$_POST['exchangeId']   : 0;
$mimeType     = isset($_POST['mimeType'])     ? (string)$_POST['mimeType']  : '';
$trimSecs     = isset($_POST['trimSecs'])     ? (float)$_POST['trimSecs']   : 0.0;

if ($matchId <= 0 || $pressTime <= 0 || $cameraNumber <= 0) {
    http_response_code(400);
    echo json_encode([
        'status'   => 'error',
        'message'  => 'Bad matchId, pressTime, or cameraNumber',
        'received' => compact('matchId', 'ringNumber', 'cameraNumber', 'pressTime', 'exchangeId', 'mimeType', 'trimSecs'),
        'post_keys'      => array_keys($_POST),
        'files_keys'     => array_keys($_FILES),
        'content_length' => (int)($_SERVER['CONTENT_LENGTH'] ?? 0),
    ]);
    exit;
}

// Sanity-cap trimSecs to avoid runaway seeks on corrupted input
if ($trimSecs < 0)   $trimSecs = 0.0;
if ($trimSecs > 300) $trimSecs = 300.0;

// ---------- Storage path (per-camera subfolder) ----------
const CLIPS_DIRNAME = 'judgementClips';
$baseStorageDir = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . CLIPS_DIRNAME;

if (!is_dir($baseStorageDir)) {
    if (!@mkdir($baseStorageDir, 0755, true) && !is_dir($baseStorageDir)) {
        error_log("Failed to create $baseStorageDir");
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Storage init failed']);
        exit;
    }
    chown($baseStorageDir, 'www-data');
}
@chown($baseStorageDir, 'www-data');
@chmod($baseStorageDir, 0755);

$camStorageDir = $baseStorageDir . DIRECTORY_SEPARATOR . 'cam-' . $cameraNumber;
if (!is_dir($camStorageDir)) {
    if (!@mkdir($camStorageDir, 0755, true) && !is_dir($camStorageDir)) {
        error_log("Failed to create $camStorageDir");
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Camera folder init failed']);
        exit;
    }
    chown($camStorageDir, 'www-data');
}
@chown($camStorageDir, 'www-data');
@chmod($camStorageDir, 0755);

// ---------- Determine extension + filename ----------
$ext = (stripos($mimeType, 'mp4') !== false) ? 'mp4' : 'webm';

$filename = preg_replace(
    '/[^A-Za-z0-9\.\-_]/', '_',
    sprintf('match-%d-ring-%d-press-%d.%s', $matchId, $ringNumber, $pressTime, $ext)
);

$targetPath = $camStorageDir . DIRECTORY_SEPARATOR . $filename;

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

        error_log("[trim] rename FAILED"); 

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
require_once('connect.php');

$linked      = false;
$linkWarning = null;

if ($exchangeId <= 0) {
    $linkWarning = "Missing exchangeId; file saved but not linked. matchId=$matchId cam=$cameraNumber filename=$filename";
    error_log($linkWarning);
} else {
    try {
        $db = connect();

        // INSERT or refresh the row for (ExchangeId, CameraNumber).
        // The UNIQUE KEY uq_exchange_camera makes re-uploads idempotent.
        $stmt = $db->prepare("
            INSERT INTO ExchangeVideos (ExchangeId, CameraNumber, VideoFilename)
            VALUES (:exchangeId, :cameraNumber, :filename)
            ON DUPLICATE KEY UPDATE
                VideoFilename = VALUES(VideoFilename),
                UploadedAt    = current_timestamp(3)
        ");
        $stmt->execute([
            ':exchangeId'   => $exchangeId,
            ':cameraNumber' => $cameraNumber,
            ':filename'     => $filename,
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
                VALUES (:exchangeId, :cameraNumber, :filename)
                ON DUPLICATE KEY UPDATE
                    VideoFilename = VALUES(VideoFilename),
                    UploadedAt    = current_timestamp(3)
            ");
            $partnerInsert->execute([
                ':exchangeId'   => $partnerRow['ExchangeId'],
                ':cameraNumber' => $cameraNumber,
                ':filename'     => $filename,
            ]);
        }

    } catch (PDOException $e) {
        error_log("DB link failed for $filename: " . $e->getMessage());
        echo json_encode([
            'status'       => 'partial',
            'message'      => 'Clip saved but DB linkage failed',
            'filename'     => $filename,
            'cameraNumber' => $cameraNumber,
            'storagePath'  => 'cam-' . $cameraNumber . '/' . $filename,
            'size'         => filesize($targetPath),
            'trimmed'      => $trimmed,
            'trimWarning'  => $trimWarning,
        ]);
        exit;
    }
}

// ---------- Done ----------
echo json_encode([
    'status'       => 'ok',
    'filename'     => $filename,
    'cameraNumber' => $cameraNumber,
    'storagePath'  => 'cam-' . $cameraNumber . '/' . $filename,
    'size'         => filesize($targetPath),
    'linked'       => $linked,
    'trimmed'      => $trimmed,
    'warning'      => $trimWarning ?? $linkWarning,
]);