/**
 * src/components/utility/constants.ts
 * 
 * == Constants File ==
 * 
 * Place any variable that will remain constant through project development, 
 * but may need to be changed at a later date, here.
 * 
 * For a given constant, const, you may use anywhere in the project by declaring:
 * import { const } from "../contants";
 *  
 */


/* the domain path containing the server side execution scripts is declared here. Comment/uncomment whichever host is being used. */
// export const backend_uri = "https://ec-reciever.m-is.net";
// export const backend_uri = "https://ec2-receiver.m-is.net";
export const backend_uri = "http://localhost/Edmondscorekeeper/phpFiles";
// export const backend_uri = "http://68.149.96.12:25565/ec-receiver";
export const backup_server_uri = "http://174.3.211.213:25566/ec-receiver"

export const event_api = "eventApi.php"
export const fighter_api = "fighterAPI.php"
export const tournament_api = "tournamentApi.php"
export const weapon_api = "weaponApi.php"
export const club_api = "clubsAPI.php"
export const tournament_fighters_api = "tournamentFightersApi.php"
export const match_fighters_manual_api = "manualMatchesApi.php"
export const match_api = "matchApi.php"
export const sse_send_to_to_judge_api = "requestJudgementSSE.php"
export const judge_score_submit_api = "judgementScoreSubmit.php"
export const score_api = "scoresApi.php"
export const event_fighters_api = "eventFighters.php"
export const round_robin_pool_api = "poolsRoundRobinApi.php"
export const single_elimination_api = "eliminationBrackets.php"
export const tournament_view_api = "tournamentView.php"

export const API_KEY = "FberbFBD5432hSFGNacmoywemvoeIVAEnvwelnb23423";