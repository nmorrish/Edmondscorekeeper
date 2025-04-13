<?php
// Database configuration
// Upload to server and change the login credentials
// If it works, don't re-upload this file

function connect(){
    $host = 'localhost';   // Database host
    $dbname = 'Edmondscores';       // Database name
    $user = 'admin';       // Database username
    $password = 'V8MLH8Zef3pxWmo';   // Database password. Change to the one used on your network.

    // Set Data Source Name (DSN)
    $dsn = 'mysql:host=' . $host . ';dbname=' . $dbname . ';charset=utf8mb4'; // Added charset for security and compatibility

    try {
        // Instantiate a class for PHP Data Objects (PDO)
        $pdo = new PDO($dsn, $user, $password);

        // Set default attribute for error mode to exceptions
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // Set default attribute for retrieving data to Associative Arrays
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        return $pdo;
    } catch (PDOException $e) {
        // Log the error message or display it for debugging (you can change this to logging if necessary)
        error_log("Connection failed: " . $e->getMessage());
        die("Database connection failed. Please try again later.");
    }
}

?>
