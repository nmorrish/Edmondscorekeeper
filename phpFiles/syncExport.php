<?php
/**
 * phpFiles/syncExport.php
 *
 * === Full DB snapshot for backup resync ===
 * GET only. Returns every base table's rows plus its AUTO_INCREMENT counter,
 * read from a single consistent snapshot so a mid-exchange write can't
 * produce a half-captured state.
 * Requires X-Api-Key matching syncKey in dblogin.json.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/connect.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$config = json_decode(file_get_contents(__DIR__ . '/dblogin.json'), true);
if (empty($config['syncKey']) || !hash_equals($config['syncKey'], $_SERVER['HTTP_X_API_KEY'] ?? '')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Forbidden']);
    exit;
}

$db = connect();

try {
    // UTC on both ends so TIMESTAMP values don't shift between servers
    $db->exec("SET time_zone = '+00:00'");
    // MySQL 8 caches information_schema AUTO_INCREMENT values; force fresh reads
    $db->exec("SET SESSION information_schema_stats_expiry = 0");

    $meta = $db->query("
        SELECT TABLE_NAME, AUTO_INCREMENT
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
    ")->fetchAll();

    $db->exec("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    $db->exec("START TRANSACTION WITH CONSISTENT SNAPSHOT");

    $tables = [];
    foreach ($meta as $t) {
        $name = $t['TABLE_NAME'];
        $tables[$name] = [
            'autoIncrement' => $t['AUTO_INCREMENT'] !== null ? (int)$t['AUTO_INCREMENT'] : null,
            'rows'          => $db->query("SELECT * FROM `$name`")->fetchAll(),
        ];
    }

    $db->exec("COMMIT");

    echo json_encode(['status' => 'success', 'tables' => $tables], JSON_THROW_ON_ERROR);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}