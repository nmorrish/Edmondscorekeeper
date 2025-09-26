<?php
/**
 * connect.php
 * 
 * Be sure to create a file called dblogin.json in the same directory.
 * 
 * Loads credentials from dblogin.json in the same directory.
 * 
 * Example dblogin.json (keep this file out of version control):
 * {
 *   "host": "localhost",
 *   "dbname": "the_db_name",
 *   "user": "your_username",
 *   "password": "your_password"
 * }
 */

function connect() {
    $configFile = __DIR__ . '/dblogin.json';

    if (!file_exists($configFile)) {
        error_log("Database config file not found: " . $configFile);
        die("Database configuration file missing. Please create dblogin.json.");
    }

    $config = json_decode(file_get_contents($configFile), true);

    if (!$config || !isset($config['host'], $config['dbname'], $config['user'], $config['password'])) {
        error_log("Database config file is invalid or missing keys.");
        die("Invalid database configuration. Please check dblogin.json.");
    }

    $host = $config['host'];
    $dbname = $config['dbname'];
    $user = $config['user'];
    $password = $config['password'];

    $dsn = "mysql:host={$host};dbname={$dbname};charset=utf8mb4";

    try {
        $pdo = new PDO($dsn, $user, $password);

        // Set PDO attributes
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        return $pdo;
    } catch (PDOException $e) {
        error_log("Database connection failed: " . $e->getMessage());
        die("Database connection failed. Please try again later.");
    }
}
?>
