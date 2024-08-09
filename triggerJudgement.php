<?php
// triggerJudgement.php

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Set the execution time to infinite so the script keeps running
set_time_limit(0);

// File to store the latest data
$dataFile = '/tmp/judgementData.json';

// Function to send JSON data via SSE
function sendJsonData($data) {
    // Encode the data as JSON
    $jsonData = json_encode($data);

    // Send the JSON data as an SSE event
    echo "data: {$jsonData}\n\n";

    // Flush the output buffer to send the data immediately
    ob_flush();
    flush();
}

// Handle POST requests to update the stored data
if ($_SERVER['REQUEST_METHOD'] === 'POST' && strpos($_SERVER['CONTENT_TYPE'], 'application/json') !== false) {
    // Get the raw POST data
    $postData = file_get_contents('php://input');
    
    // Decode the JSON data
    $data = json_decode($postData, true);

    // If JSON is valid, store it in the file
    if ($data !== null) {
        file_put_contents($dataFile, json_encode($data));
    } else {
        // Store an error message if JSON is invalid
        file_put_contents($dataFile, json_encode(['error' => 'Invalid JSON received']));
    }

    // Exit the script to prevent further processing
    exit;
}

// Main loop to maintain the SSE connection
$lastData = null;
while (true) {
    // Check if there's new data to send
    if (file_exists($dataFile)) {
        $newData = file_get_contents($dataFile);

        // Only send the data if it's new
        if ($newData !== $lastData) {
            $lastData = $newData;
            sendJsonData(json_decode($newData, true));
        }
    }

    // Send a keep-alive event every 30 seconds to avoid timeouts
    echo "event: keep-alive\n";
    echo "data: {}\n\n";
    ob_flush();
    flush();

    // Wait for a few seconds before checking for new data again
    sleep(5);
}
