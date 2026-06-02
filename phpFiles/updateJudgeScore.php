<?php
/**
 * phpFiles/updateJudgeScore.php
 *
 * === Update Judge Score API ===
 * Expects JSON: { scoreId, field, value }
 * Maps lowercase field names from frontend to DB column names.
 */

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/connect.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method !== 'PUT') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'PUT required']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!$data || !isset($data['scoreId'], $data['field'], $data['value'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
    exit;
}

$scoreId = (int)$data['scoreId'];
$field   = $data['field'];
$value   = (int)$data['value'];

// map frontend → DB columns
$fieldMap = [
    'contact'              => 'Contact',
    'target'               => 'Target',
    'control'              => 'Control',
    'afterBlow'            => 'AfterBlow',
    'doubleHit'            => 'DoubleHit',
    'opponentSelfCall'     => 'OpponentSelfCall',
    'contactUncertainty'   => 'ContactUncertainty',
    'targetUncertainty'    => 'TargetUncertainty',
    'controlUncertainty'   => 'ControlUncertainty',
    'doubleHitUncertainty' => 'DoubleHitUncertainty',
    'afterBlowUncertainty' => 'AfterBlowUncertainty',
];

if (!isset($fieldMap[$field])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid field']);
    exit;
}

$dbField = $fieldMap[$field];

try {
    $db = connect();

    $sql = "UPDATE ExchangeScores SET $dbField = :val, ScoreTimeStamp = NOW() WHERE ExchangeScoresId = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute([':val' => $value, ':id' => $scoreId]);

    echo json_encode(['status' => 'success', 'updatedId' => $scoreId, 'field' => $dbField, 'value' => $value]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    $db = null;
}
