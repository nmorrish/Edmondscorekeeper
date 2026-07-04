<?php
/**
 * uploadOBSClip.php
 *
 * Accepts a pre-trimmed (or optionally raw) video upload from the OBS
 * Python middleware and registers it in ExchangeVideos.
 *
 * Simpler than uploadJudgementClip.php because:
 *  - OBS outputs valid MP4/MKV containers with proper duration headers,
 *    so no two-pass FFmpeg remux is needed.
 *  - The middleware trims locally before uploading, so trimSecs is
 *    usually 0. If the middleware trim failed it sends the raw file
 *    with trimSecs > 0 as a fallback — handled here with a single
 *    FFmpeg pass.
 *
 * Expected POST fields:
 *   - clip          (file)   the video blob from OBS (mp4 or mkv)
 *   - exchangeId    (int)    required
 *   - cameraNumber  (int)    required
 *   - mimeType      (str)    video/mp4 or video/x-matroska
 *   - trimSecs      (float)  seconds to keep from end; 0 = already trimmed
 *
 * Storage layout (same as uploadJudgementClip.php):
 *   ../judgementClips/
 *     tournament_[TournamentId]/
 *       event_[EventId]/
 *         match_[MatchId]/
 *           exchange_[ExchangeId]/
 *             [ExchangeId]-cam[CameraNumber].[ext]
 *
 * VideoFilename stored in DB is the relative path from judgementClips/ inward.
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
        'status'    => 'error',
        'message'   => 'Bad exchangeId or cameraNumber',
        'received'  => compact('exchangeId', 'cameraNumber', 'mimeType', 'trimSecs'),
    ]);
    exit;
}

if ($trimSecs < 0)   $trimSecs = 0.0;
if ($trimSecs > 300) $trimSecs = 300.0;

// ---------- Determine extension ----------
// OBS outputs mp4 or mkv depending on Source Record settings.
if (stripos($mimeType, 'mp4') !== false) {
    $ext = 'mp4';
} elseif (stripos($mimeType, 'matroska') !== false || stripos($mimeType, 'mkv') !== false) {
    $ext = 'mkv';
} else {
    // Fall back to inspecting the original filename
    $origExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $ext = in_array($origExt, ['mp4', 'mkv']) ? $origExt : 'mp4';
}

// ---------- Derive MatchId, EventId, TournamentId ----------
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
// $baseStorageDir = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . CLIPS_DIRNAME;
//hard code path for now as Debian does not handle dynamic pathing gracefully
$baseStorageDir = '/var/www/html/judgementClips';

$relativeDir = implode(DIRECTORY_SEPARATOR, [
    "tournament_{$tournamentId}",
    "event_{$eventId}",
    "match_{$matchId}",
    "exchange_{$exchangeId}",
]);

$fullDir = $baseStorageDir . DIRECTORY_SEPARATOR . $relativeDir;

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

// ---------- Filename ----------
$filename     = "{$exchangeId}-cam{$cameraNumber}.{$ext}";
$relativePath = str_replace(DIRECTORY_SEPARATOR, '/', $relativeDir) . '/' . $filename;
$targetPath   = $fullDir . DIRECTORY_SEPARATOR . $filename;

// ---------- Move raw upload ----------
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    error_log("move_uploaded_file failed for $targetPath");
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Could not save file']);
    exit;
}

// ---------- FFmpeg trim (fallback only) ----------
// OBS produces valid containers so a single -sseof pass is sufficient.
// This only runs if the middleware failed to trim locally (trimSecs > 0).
$trimmed     = false;
$trimWarning = null;

if ($trimSecs > 0) {
    $rawPath = $targetPath . '.raw';

    if (!rename($targetPath, $rawPath)) {
        $trimWarning = 'Rename to .raw failed; FFmpeg trim skipped';
        error_log($trimWarning);

    } elseif (!function_exists('exec')) {
        rename($rawPath, $targetPath);
        $trimWarning = 'exec() disabled; raw upload stored';
        error_log($trimWarning);

    } else {
        $ffOut  = [];
        $ffCode = 0;
        exec(sprintf(
            '/usr/bin/ffmpeg -y -sseof %.3f -i %s -c copy -avoid_negative_ts make_zero %s 2>&1',
            -(float)abs($trimSecs),
            escapeshellarg($rawPath),
            escapeshellarg($targetPath)
        ), $ffOut, $ffCode);

        error_log("[obs-trim] exit=$ffCode out=" . implode('|', $ffOut));

        $outputOk = file_exists($targetPath) && filesize($targetPath) > 0;

        if ($ffCode !== 0 || !$outputOk) {
            if (!$outputOk) rename($rawPath, $targetPath);
            else            unlink($rawPath);
            $trimWarning = "FFmpeg trim failed (exit $ffCode); raw upload stored";
            error_log($trimWarning);
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
    $linked = $stmt->rowCount() > 0;

    // Link to partner exchange (same match, same timestamp, other fighter)
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