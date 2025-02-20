<?php

require_once("connect.php");
$db = connect();

// Set the content type to application/json
header('Content-Type: application/json');

// Get the raw POST data
$jsonData = file_get_contents('php://input');

// Decode the JSON data into a PHP array
$data = json_decode($jsonData, true);

// Check if JSON decoding was successful
if (json_last_error() === JSON_ERROR_NONE) {
    // Check if the data is an array
    if (is_array($data)) {
        // Loop through each object in the array
        foreach ($data as $item) {
            // Extract the 'name' value
            $name = $item['name'] ?? null;
            
            // Insert the name into the database if it's not null
            if ($name) {
                $stmt = $db->prepare("INSERT INTO Fighters (fighterName, strikes) VALUES (:name, 0)");
                $stmt->bindParam(':name', $name);
                $stmt->execute();
            }
        }

        // Prepare the response array
        $response = [
            'status' => 'success',
            'received' => $data
        ];
    } else {
        // Handle the case where the data is not an array
        $response = [
            'status' => 'error',
            'message' => 'Data should be an array'
        ];
    }
} else {
    // Handle JSON decoding error
    $response = [
        'status' => 'error',
        'message' => 'Invalid JSON'
    ];
}

// Close the database connection
$db = null;

// Encode the response as JSON and output it
echo json_encode($response);

?>