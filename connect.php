<?php
// Database configuration


function connect(){

    $host = 'localhost';   // Database host
    $dbname = 'Edmondscores'; // Database name
    $user = 'admin';      // Database username
    $password = 'V8MLH8Zef3pxWmo'; // Database password

    // Set Data Source Name (DSN)
    $dsn = 'mysql:host=' . $host . ';dbname=' . $dbname;

    // Instantiate a class for PHP Data Objects (PDO)
    $pdo = new PDO($dsn, $user, $password);
    

    // Set default attribute for retrieving data to Associative Arrays
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    return $pdo;
}

?>
