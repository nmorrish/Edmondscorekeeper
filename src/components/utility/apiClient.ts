/**
 * src/components/utility/apiClient.ts
 *
 * == Drop-in Fetch Wrapper ==
 * Behaves like fetch(), but mirrors requests to a backup server.
 * - Accepts same args as fetch(input, init?)
 * - Optional toggle for adding X-Api-Key header
 */

import { backend_uri, backup_server_uri, API_KEY } from "../utility/endpoints";

// 🔹 flip this to true/false depending on environment
const USE_API_KEY = false;

export async function apiQuery(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});

  if (USE_API_KEY) {
    headers.set("X-Api-Key", API_KEY);
  }

  const inputStr =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  const mainUrl = inputStr;
  const backupUrl = mainUrl.replace(backend_uri, backup_server_uri);

  if (backupUrl !== mainUrl) {
    fetch(backupUrl, { ...init, headers }).catch(() => {});
  }

  return fetch(mainUrl, { ...init, headers });
}
