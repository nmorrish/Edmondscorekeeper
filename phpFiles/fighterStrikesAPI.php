<?php
/**
 * API Handler for Fighter Strikes
 * 
 * Supports:
 *  - GET    /api.php?resource=strikes&fighterId=1&tournamentId=2   → Get strikes for a fighter in a tournament
 *  - GET    /api.php?resource=strikes&tournamentId=2               → List all fighters + strikes in a tournament
 *  - POST   /api.php?resource=strikes                              → Create new strike record for fighter/tournament
 *  - PUT    /api.php?resource=strikes&fighterId=1&tournamentId=2   → Update strike count
 *  - DELETE /api.php?resource=strikes&fighterId=1&tournamentId=2   → Remove strike record
 * 
 * POST / PUT request body format:
 * {
 *   "fighterId": 1,
 *   "tournamentId": 2,
 *   "strikes": 3
 * }
 */
function handleFighterStrikes($method, $id, $input, $db) {
    $fighterId    = $_GET['fighterId']    ?? $input['fighterId']    ?? null;
    $tournamentId = $_GET['tournamentId'] ?? $input['tournamentId'] ?? null;

    switch ($method) {
        case 'GET':
            if ($fighterId && $tournamentId) {
                // Get strikes for a single fighter in this tournament
                $stmt = $db->prepare("
                    SELECT tf.FighterId, tf.TournamentId, tf.Strikes, f.FighterName
                    FROM TournamentFighters tf
                    JOIN Fighters f ON tf.FighterId = f.FighterId
                    WHERE tf.FighterId = :fighterId AND tf.TournamentId = :tournamentId
                ");
                $stmt->execute([
                    ':fighterId' => $fighterId,
                    ':tournamentId' => $tournamentId
                ]);
                echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));
            } elseif ($tournamentId) {
                // List all fighters + strikes in the tournament
                $stmt = $db->prepare("
                    SELECT tf.FighterId, tf.TournamentId, tf.Strikes, f.FighterName
                    FROM TournamentFighters tf
                    JOIN Fighters f ON tf.FighterId = f.FighterId
                    WHERE tf.TournamentId = :tournamentId
                ");
                $stmt->execute([':tournamentId' => $tournamentId]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            } else {
                throw new Exception("tournamentId is required");
            }
            break;

        case 'POST':
            if (!$fighterId || !$tournamentId) {
                throw new Exception("fighterId and tournamentId are required");
            }

            $strikes = $input['strikes'] ?? 0;

            $stmt = $db->prepare("
                INSERT INTO TournamentFighters (FighterId, TournamentId, Strikes)
                VALUES (:fighterId, :tournamentId, :strikes)
                ON DUPLICATE KEY UPDATE Strikes = VALUES(Strikes)
            ");
            $stmt->execute([
                ':fighterId' => $fighterId,
                ':tournamentId' => $tournamentId,
                ':strikes' => $strikes
            ]);

            echo json_encode(['status' => 'success']);
            break;

        case 'PUT':
            if (!$fighterId || !$tournamentId) {
                throw new Exception("fighterId and tournamentId are required");
            }

            if (!isset($input['strikes'])) {
                throw new Exception("strikes is required for update");
            }

            $stmt = $db->prepare("
                UPDATE TournamentFighters
                SET Strikes = :strikes
                WHERE FighterId = :fighterId AND TournamentId = :tournamentId
            ");
            $stmt->execute([
                ':strikes' => $input['strikes'],
                ':fighterId' => $fighterId,
                ':tournamentId' => $tournamentId
            ]);

            echo json_encode(['status' => 'success']);
            break;

        case 'DELETE':
            if (!$fighterId || !$tournamentId) {
                throw new Exception("fighterId and tournamentId are required");
            }

            $stmt = $db->prepare("
                DELETE FROM TournamentFighters
                WHERE FighterId = :fighterId AND TournamentId = :tournamentId
            ");
            $stmt->execute([
                ':fighterId' => $fighterId,
                ':tournamentId' => $tournamentId
            ]);

            echo json_encode(['status' => 'success']);
            break;
    }
}
?>
