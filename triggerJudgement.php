<?php
// server.php

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');

// Simulate incoming data (in a real scenario, this could be from a database or other sources)
function getIncomingData() {
    return [
        'judgement' => 'Approved',
        'timestamp' => time()
    ];
}

while (true) {
    // Fetch data (this could be replaced with actual data fetching logic)
    $data = getIncomingData();

    // Send data to the client
    echo "data: " . json_encode($data) . "\n\n";

    // Flush the output buffer to ensure the data is sent immediately
    ob_flush();
    flush();

    // Sleep for a while before sending the next update (adjust as needed)
    sleep(5);
}