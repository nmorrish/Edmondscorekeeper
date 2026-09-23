<?php
/**
 * videoExportApi.php
 *
 * Front-facing endpoint for the tournament video export.
 * Actions (?action=, tournamentId):
 *   status   GET  - guard state + current build state (for enabling/polling the button)
 *   start    POST - guarded, idempotent: spawns the worker or reports ready/building
 *   download GET  - streams the saved zip once ready
 *
 * The build runs in a detached CLI worker so Apache timeouts don't apply.
 */

require_once __DIR__ . '/videoExportCommon.php';
require_once __DIR__ . '/connect.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$tid    = (int)($_GET['tournamentId'] ?? $_POST['tournamentId'] ?? 0);

if ($tid <= 0) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Bad tournamentId']);
    exit;
}

/** Look up name + whether the scheduled end has passed (server clock, authoritative). */
function veTournamentGuard(PDO $db, int $tid): ?array {
    $stmt = $db->prepare("
        SELECT TournamentName, TournamentEndDate, (NOW() > TournamentEndDate) AS Ended
        FROM Tournaments WHERE TournamentId = :tid LIMIT 1
    ");
    $stmt->execute([':tid' => $tid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Current build state derived from status file + zip presence, with stale detection. */
function veBuildState(int $tid): array {
    $paths  = vePaths($tid);
    $status = veReadStatus($tid);

    if (is_file($paths['zip']) && (!$status || ($status['state'] ?? '') !== 'error')) {
        return ['state' => 'ready', 'bytes' => filesize($paths['zip'])];
    }
    if ($status && ($status['state'] ?? '') === 'building') {
        $age = time() - (int)($status['startedAt'] ?? 0);
        if ($age <= EXPORT_STALE_SECS) return ['state' => 'building'];
        return ['state' => 'none']; // dead worker; allow respawn
    }
    if ($status && ($status['state'] ?? '') === 'error') {
        return ['state' => 'error', 'message' => $status['message'] ?? 'Build failed'];
    }
    return ['state' => 'none'];
}

try {
    $db = connect();
} catch (Throwable $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'DB connection failed']);
    exit;
}

// ---------- download ----------
if ($action === 'download') {
    $paths = vePaths($tid);
    $build = veBuildState($tid);
    if ($build['state'] !== 'ready' || !is_file($paths['zip'])) {
        header('Content-Type: application/json');
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'Zip not ready']);
        exit;
    }

    $guard = veTournamentGuard($db, $tid);
    $dlName = veSanitize(($guard['TournamentName'] ?? "tournament_$tid")) . '.zip';

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $dlName . '"');
    header('Content-Length: ' . filesize($paths['zip']));
    header('X-Accel-Buffering: no');
    readfile($paths['zip']);
    exit;
}

// ---------- status / start share the guard ----------
header('Content-Type: application/json');

$guard = veTournamentGuard($db, $tid);
if (!$guard) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'Tournament not found']);
    exit;
}
$ended = (int)$guard['Ended'] === 1;
$build = veBuildState($tid);

if ($action === 'status') {
    echo json_encode([
        'status'         => 'ok',
        'allowed'        => $ended,
        'endDate'        => $guard['TournamentEndDate'],
        'tournamentName' => $guard['TournamentName'],
        'build'          => $build,
    ]);
    exit;
}

if ($action === 'start') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'POST required']);
        exit;
    }
    if (!$ended) {
        http_response_code(403);
        echo json_encode([
            'status'  => 'error',
            'allowed' => false,
            'message' => 'Export is locked until the tournament end time has passed',
            'endDate' => $guard['TournamentEndDate'],
        ]);
        exit;
    }

    if ($build['state'] === 'ready')    { echo json_encode(['status' => 'ok', 'build' => $build]); exit; }
    if ($build['state'] === 'building') { echo json_encode(['status' => 'ok', 'build' => $build]); exit; }

    // Serialize spawning so two rapid clicks don't launch two workers.
    $paths = vePaths($tid);
    $lock  = fopen($paths['spawn'], 'c');
    if ($lock && flock($lock, LOCK_EX | LOCK_NB)) {
        $recheck = veBuildState($tid);
        if (in_array($recheck['state'], ['ready', 'building'], true)) {
            flock($lock, LOCK_UN); fclose($lock);
            echo json_encode(['status' => 'ok', 'build' => $recheck]);
            exit;
        }

        veWriteStatus($tid, [
            'state'     => 'building',
            'startedAt' => time(),
            'message'   => 'Queued',
        ]);

        $cmd = sprintf(
            'nohup %s %s %d >> %s 2>&1 &',
            escapeshellarg('/usr/bin/php'),
            escapeshellarg(__DIR__ . '/videoExportWorker.php'),
            $tid,
            escapeshellarg($paths['log'])
        );
        exec($cmd);

        flock($lock, LOCK_UN); fclose($lock);
        echo json_encode(['status' => 'ok', 'build' => ['state' => 'building']]);
        exit;
    }

    // Another request holds the spawn lock right now.
    echo json_encode(['status' => 'ok', 'build' => ['state' => 'building']]);
    exit;
}

http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action']);