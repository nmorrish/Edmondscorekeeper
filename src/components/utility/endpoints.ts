/**
 * src/components/utility/constants.ts
 *
 * Dynamically loads endpoints.json from the same folder as the built JS assets.
 * Falls back to local URIs automatically if endpoints.json is not found.
 */

interface Config {
  backend_uri: string;
  backup_server_uri: string;
}

const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const isDev = import.meta.env.DEV;

// Use localhost for dev testing
const config: Config = isDev
  ? {
      // backend_uri: "https://scorecard.swordsmanship.ca/ec-receiver",
      // backup_server_uri: "http://localhost/Edmondscorekeeper/phpFiles",
      backend_uri: "http://localhost/Edmondscorekeeper/phpFiles",
      backup_server_uri: "http://0.0.0.0/phpFiles",
    }
  : {
      backend_uri: "http://192.168.1.2/phpFiles",
      backup_server_uri: "https://scorecard.swordsmanship.ca/ec-receiver",
    };

/**
 * Example endpoints.json (place in same folder as npm build JS)
 * {
 *   "backend_uri": "http://68.149.96.12:25566/ec-receiver",
 *   "backup_server_uri": "http://174.3.211.213:25566/ec-receiver"
 * }
 */


const scriptBase = window.location.pathname.replace(/\/[^/]*$/, "");

export const configPromise: Promise<Config> = isDev || isLocalhost
  ? Promise.resolve(config)
  : fetch(`${scriptBase}/endpoints.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject("endpoints.json not found")))
      .then((json): Config => {
        console.log("Loaded endpoints.json");
        return {
          backend_uri: json.backend_uri,
          backup_server_uri: json.backup_server_uri,
        };
      })
      .catch((err) => {
        console.warn("Failed to load endpoints.json:", err);
        return config;
      });

export const backend_uri = config.backend_uri;
export const backup_server_uri = config.backup_server_uri;

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
export const bracket_api = "bracketSeeding.php";

export const API_KEY = "FberbFBD5432hSFGNacmoywemvoeIVAEnvwelnb23423";