<?php
/**
 * addFighters.php
 * 
 * Accepts a list of fighters and inserts them into the Fighters table in the database.
 * Each fighter is initialized with 0 strikes.
 * 
 * Expects a POST request with a JSON array in the following format:
 * [
 *   { "name": "Fighter1" },
 *   { "name": "Fighter2" },
 *   ...
 *   { "name": "FighterN" }
 * ]
 * 
 * On success returns:
 * {
 *   "status": "success",
 *   "received": [
 *     { "name": "Fighter1" },
 *     { "name": "Fighter2" },
 *     ...
 *     { "name": "FighterN" }
 *   ]
 * }
 * 
 * On error returns:
 * {
 *   "status": "error",
 *   "message": "Descriptive error message"
 * }
 */

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