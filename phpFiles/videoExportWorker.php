<?php
/**
 * videoExportWorker.php   (CLI only)
 *
 * Usage: php videoExportWorker.php <tournamentId>
 *
 * Walks judgementClips/tournament_<id>/ and builds a zip whose folders are
 * renamed to human-readable terms:
 *
 *   <TournamentName>/
 *     <EventName>/
 *       Match <Queue> - <Red> vs <Blue>/
 *         Exchange <n>/
 *           Cam<n>.<ext>
 *
 * No compression (files are already-encoded video). Re-checks the end-date
 * guard before doing any work.
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only'); }

require_once __DIR__ . '/videoExportCommon.php';
require_once __DIR__ . '/connect.php';

$tid = (int)($argv[1] ?? 0);
if ($tid <= 0) { fwrite(STDERR, "Bad tournamentId\n"); exit(1); }

$paths = vePaths($tid);

function veFail(int $tid, string $msg): void {
    veWriteStatus($tid, ['state' => 'error', 'message' => $msg, 'finishedAt' => time()]);
    fwrite(STDERR, "$msg\n");
    exit(1);
}

try {
    $db = connect();
} catch (Throwable $e) {
    veFail($tid, 'DB connection failed');
}

// --- Guard (authoritative, re-checked here) ---
$g = $db->prepare("
    SELECT TournamentName, (NOW() > TournamentEndDate) AS Ended
    FROM Tournaments WHERE TournamentId = :tid LIMIT 1
");
$g->execute([':tid' => $tid]);
$trow = $g->fetch(PDO::FETCH_ASSOC);
if (!$trow)                         veFail($tid, 'Tournament not found');
if ((int)$trow['Ended'] !== 1)      veFail($tid, 'Tournament has not ended');
if (!is_dir($paths['src']))         veFail($tid, 'No videos found for this tournament');

$tournamentName = veSanitize($trow['TournamentName']);

// --- Preload lookups (few queries, group in PHP) ---
$evStmt = $db->prepare("SELECT EventId, EventName FROM Events WHERE TournamentId = :tid");
$evStmt->execute([':tid' => $tid]);
$eventNames = [];
foreach ($evStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $eventNames[(int)$r['EventId']] = $r['EventName'];
}

$mStmt = $db->prepare("
    SELECT m.MatchId, m.MatchQueueNumber,
           MAX(CASE WHEN mf.FighterColor = 'Red'  THEN f.FighterName END) AS Red,
           MAX(CASE WHEN mf.FighterColor = 'Blue' THEN f.FighterName END) AS Blue
    FROM Matches m
    JOIN Events e            ON e.EventId  = m.EventId
    LEFT JOIN MatchFighters mf ON mf.MatchId = m.MatchId
    LEFT JOIN Fighters f       ON f.FighterId = mf.FighterId
    WHERE e.TournamentId = :tid
    GROUP BY m.MatchId, m.MatchQueueNumber
");
$mStmt->execute([':tid' => $tid]);
$matchMeta = [];
foreach ($mStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $matchMeta[(int)$r['MatchId']] = $r;
}

function veMatchLabel(array $matchMeta, int $matchId): string {
    $meta = $matchMeta[$matchId] ?? null;
    $q    = $meta['MatchQueueNumber'] ?? $matchId;
    $vs   = [];
    if (!empty($meta['Red']))  $vs[] = $meta['Red'];
    if (!empty($meta['Blue'])) $vs[] = $meta['Blue'];
    $label = "Match {$q}" . ($vs ? ' - ' . implode(' vs ', $vs) : '');
    return veSanitize($label);
}

/** "<exId>-cam2.mp4" -> "Cam2.mp4"; unknown patterns kept as-is. */
function veCamName(string $basename): string {
    if (preg_match('/^\d+-cam(\d+)\.([A-Za-z0-9]+)$/i', $basename, $m)) {
        return "Cam{$m[1]}.{$m[2]}";
    }
    return veSanitize($basename);
}

// --- Build the zip ---
$zip = new ZipArchive();
if ($zip->open($paths['zipTmp'], ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    veFail($tid, 'Could not open zip for writing');
}

$fileCount = 0;

foreach (glob($paths['src'] . '/event_*', GLOB_ONLYDIR) ?: [] as $eventDir) {
    $eventId   = (int)substr(basename($eventDir), strlen('event_'));
    $eventName = veSanitize($eventNames[$eventId] ?? "Event {$eventId}");

    foreach (glob($eventDir . '/match_*', GLOB_ONLYDIR) ?: [] as $matchDir) {
        $matchId    = (int)substr(basename($matchDir), strlen('match_'));
        $matchLabel = veMatchLabel($matchMeta, $matchId);

        // Number exchange folders sequentially by id (creation order).
        $exDirs = glob($matchDir . '/exchange_*', GLOB_ONLYDIR) ?: [];
        usort($exDirs, fn($a, $b) =>
            (int)substr(basename($a), strlen('exchange_'))
          <=> (int)substr(basename($b), strlen('exchange_'))
        );

        $ordinal = 1;
        foreach ($exDirs as $exDir) {
            $exLabel = "Exchange {$ordinal}";
            $ordinal++;

            foreach (glob($exDir . '/*') ?: [] as $filePath) {
                if (!is_file($filePath)) continue;
                $entry = implode('/', [
                    $tournamentName,
                    $eventName,
                    $matchLabel,
                    $exLabel,
                    veCamName(basename($filePath)),
                ]);
                if ($zip->addFile($filePath, $entry)) {
                    $zip->setCompressionName($entry, ZipArchive::CM_STORE);
                    $fileCount++;
                }
            }
        }
    }
}

if ($fileCount === 0) {
    $zip->close();
    @unlink($paths['zipTmp']);
    veFail($tid, 'No video files found to export');
}

veWriteStatus($tid, ['state' => 'building', 'startedAt' => time(), 'message' => "Zipping {$fileCount} files"]);

if ($zip->close() !== true) {
    @unlink($paths['zipTmp']);
    veFail($tid, 'Zip finalize failed');
}

if (!rename($paths['zipTmp'], $paths['zip'])) {
    @unlink($paths['zipTmp']);
    veFail($tid, 'Could not move finished zip into place');
}
@chmod($paths['zip'], 0644);

veWriteStatus($tid, [
    'state'      => 'ready',
    'finishedAt' => time(),
    'files'      => $fileCount,
    'bytes'      => filesize($paths['zip']),
]);

echo "OK: {$fileCount} files, " . filesize($paths['zip']) . " bytes\n";