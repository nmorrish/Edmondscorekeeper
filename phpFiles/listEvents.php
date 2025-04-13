<?php
/**
 * listEvents.php
 * 
 * Retrieves and returns all registered events in the tournament.
 * 
 * Accessed via a GET request. No input parameters are required.
 * 
 * On success returns:
 * {
 *   "status": "success",
 *   "events": [
 *     { "eventId": 1, "eventName": "Longsword" },
 *     { "eventId": 2, "eventName": "Longsword Finals" },
 *     { "eventId": 3, "eventName": "Mixed Weapons" }
 *   ]
 * }
 * 
 * On error returns:
 * {
 *   "status": "error",
 *   "message": "error message"
 * }
 */
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
