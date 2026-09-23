<?php
/**
 * phpFiles/syncImport.php
 *
 * === Force backup to match a primary snapshot ===
 * POST only. Replaces every table in the payload with the primary's rows,
 * original IDs intact, inside one transaction. Then aligns AUTO_INCREMENT
 * counters with the primary so future mirrored inserts get matching IDs.
 * Refuses to run unless dblogin.json has "allowImport": true.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/connect.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$config = json_decode(file_get_contents(__DIR__ . '/dblogin.json'), true);
if (empty($config['allowImport'])
    || empty($config['syncKey'])
    || !hash_equals($config['syncKey'], $_SERVER['HTTP_X_API_KEY'] ?? '')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Forbidden']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload['tables'] ?? null)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
    exit;
}

$db = connect();

try {
    $db->exec("SET time_zone = '+00:00'");
    $db->exec("SET FOREIGN_KEY_CHECKS = 0");

    // Whitelist of local tables/columns; payload names are never trusted directly
    $columns = [];
    $colRows = $db->query("
        SELECT c.TABLE_NAME, c.COLUMN_NAME
        FROM information_schema.COLUMNS c
        JOIN information_schema.TABLES t
          ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        WHERE c.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'
    ")->fetchAll();
    foreach ($colRows as $r) {
        $columns[$r['TABLE_NAME']][] = $r['COLUMN_NAME'];
    }

    // DELETE rather than TRUNCATE: TRUNCATE implicitly commits
    $db->beginTransaction();
    foreach ($payload['tables'] as $name => $data) {
        if (!isset($columns[$name])) continue;

        $db->exec("DELETE FROM `$name`");

        $rows = $data['rows'] ?? [];
        if (!$rows) continue;

        $cols    = array_values(array_intersect(array_keys($rows[0]), $columns[$name]));
        $colList = '`' . implode('`,`', $cols) . '`';
        $rowPh   = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';

        foreach (array_chunk($rows, 200) as $chunk) {
            $sql = "INSERT INTO `$name` ($colList) VALUES "
                 . implode(',', array_fill(0, count($chunk), $rowPh));
            $params = [];
            foreach ($chunk as $r) {
                foreach ($cols as $c) $params[] = $r[$c] ?? null;
            }
            $db->prepare($sql)->execute($params);
        }
    }
    $db->commit();

    // ALTER is DDL (implicit commit), so it runs after the transaction
    foreach ($payload['tables'] as $name => $data) {
        if (isset($columns[$name]) && isset($data['autoIncrement'])) {
            $db->exec("ALTER TABLE `$name` AUTO_INCREMENT = " . (int)$data['autoIncrement']);
        }
    }

    $db->exec("SET FOREIGN_KEY_CHECKS = 1");

    echo json_encode(['status' => 'success', 'tables' => count($payload['tables'])]);
} catch (Exception $e) {
    if ($db->inTransaction()) $db->rollBack();
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}