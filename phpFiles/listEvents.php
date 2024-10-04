<?php
header('Content-Type: application/json');

require_once("connect.php");

try {
    $db = connect();

    // Prepare and execute the query to fetch all events
    $stmt = $db->prepare("SELECT eventId, eventName FROM Event");
    $stmt->execute();

    // Fetch all results as an associative array
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Return the result as JSON
    echo json_encode(['status' => 'success', 'events' => $events]);
} catch (PDOException $e) {
    // Handle any errors by returning a JSON response
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}

// Close the database connection
$db = null;
?>
