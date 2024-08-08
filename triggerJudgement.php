<?php
// triggerJudgement.php

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('Access-Control-Allow-Origin: *'); // Add CORS header
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Handle preflight request
    http_response_code(200);
    exit();
}

// Function to send data to the SSE stream
function sendSSE($data) {
    echo "data: " . json_encode($data) . "\n\n";
    ob_flush();
    flush();
}

// Check if the request method is POST to receive JSON data
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postData = file_get_contents('php://input');
    $data = json_decode($postData, true);

    // Validate and process the received data as needed
    if (isset($data['matchId']) && isset($data['fighters'])) {
        // Store the received data in a file or database
        file_put_contents('judgement_data.json', json_encode($data));
        sendSSE($data);
        exit();
    }
}

// Function to get the latest judgement data
function getLatestJudgementData() {
    if (file_exists('judgement_data.json')) {
        $data = file_get_contents('judgement_data.json');
        return json_decode($data, true);
    }
    return null;
}

// Infinite loop to keep the SSE stream open
while (true) {
    $data = getLatestJudgementData();
    if ($data) {
        sendSSE($data);
        // Remove the file to prevent sending the same data repeatedly
        unlink('judgement_data.json');
    }

    // Sleep for a while before checking for new data
    sleep(5);
}
