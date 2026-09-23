<?php
/**
 * videoExportCommon.php
 *
 * Shared paths/helpers for the video export subsystem.
 * Zips of renamed video trees live under judgementClips/exports/.
 */

const EXPORT_BASE   = '/var/www/html/judgementClips';
const EXPORT_SUBDIR = 'exports';
const EXPORT_STALE_SECS = 21600; // 6h: a "building" status older than this is treated as a dead worker

function veExportsDir(): string {
    $dir = EXPORT_BASE . '/' . EXPORT_SUBDIR;
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
        @chmod($dir, 0755);
    }
    return $dir;
}

/** Absolute paths for a tournament's export artifacts. */
function vePaths(int $tid): array {
    $dir = veExportsDir();
    return [
        'src'    => EXPORT_BASE . '/tournament_' . $tid,
        'zip'    => "$dir/tournament_{$tid}.zip",
        'zipTmp' => "$dir/tournament_{$tid}.building.zip",
        'status' => "$dir/tournament_{$tid}.status.json",
        'spawn'  => "$dir/tournament_{$tid}.spawn.lock",
        'log'    => "$dir/tournament_{$tid}.worker.log",
    ];
}

/** Make one path segment safe for filesystem + zip entry. */
function veSanitize(string $name): string {
    $name = preg_replace('/[\/\\\\:\*\?"<>\|]/', '-', $name); // illegal fs/zip chars
    $name = preg_replace('/[\x00-\x1F]/', '', $name);         // control chars
    $name = preg_replace('/\s+/', ' ', trim($name));
    $name = trim($name, '. ');                                // no leading/trailing dot/space
    return $name === '' ? 'unnamed' : $name;
}

function veReadStatus(int $tid): ?array {
    $p = vePaths($tid)['status'];
    if (!is_file($p)) return null;
    $j = json_decode((string)file_get_contents($p), true);
    return is_array($j) ? $j : null;
}

function veWriteStatus(int $tid, array $status): void {
    $p = vePaths($tid)['status'];
    file_put_contents($p, json_encode($status), LOCK_EX);
    @chmod($p, 0644);
}