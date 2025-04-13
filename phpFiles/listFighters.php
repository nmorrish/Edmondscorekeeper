<?php
/**
 * listFighters.php
 * 
 * Retrieves and returns all fighters from the database, including their ID, name, and current strike count.
 * 
 * Accessed via a GET request. No input parameters are required.
 * 
 * On success returns a JSON array:
 * [
 *   {
 *     "fighterId": 1,
 *     "fighterName": "Fighter1",
 *     "strikes": 0
 *   },
 *   {
 *     "fighterId": 2,
 *     "fighterName": "Fighter2",
 *     "strikes": 0
 *   },
 *   {
 *     "fighterId": 3,
 *     "fighterName": "Etc",
 *     "strikes": 2
 *   }
 * ]
 * 
 * On error returns:
 * {
 *   "status": "error",
 *   "message": "Descriptive error message"
 * }
 */

require_once("connect.php");

try {
    $db = connect();

    // Set the content type to application/json
    header('Content-Type: application/json');

    // Prepare and execute the SQL query
    $stmt = $db->prepare("SELECT fighterId, fighterName, strikes FROM Fighters");
    $stmt->execute();

    // Fetch all results as an associative array
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Output the results as JSON
    echo json_encode($results);

} catch (PDOException $e) {
    // Handle any errors
    $response = [
        'status' => 'error',
        'message' => $e->getMessage()
    ];
    echo json_encode($response);

} finally {
    // Ensure the database connection is closed
    $db = null;
}
