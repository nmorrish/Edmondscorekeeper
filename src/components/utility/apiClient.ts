/**
 * src/components/utility/apiClient.ts
 *
 * == Drop-in Fetch Wrapper ==
 * Behaves like fetch(), but mirrors requests to a backup server.
 * - Accepts same args as fetch(input, init?)
 * - Optional toggle for adding X-Api-Key header
 * - Triggers a full backup resync whenever a match is marked Done
 */

import { backend_uri, backup_server_uri, API_KEY } from "../utility/endpoints";

// 🔹 flip this to true/false depending on environment
const USE_API_KEY = false;

let syncing = false;
let syncQueued = false;

// Pull a snapshot from the primary and push it to the backup.
// Plain fetch on purpose so these calls are never mirrored.
async function resyncBackup(): Promise<void> {
  if (syncing) {
    syncQueued = true;
    return;
  }
  syncing = true;

  try {
    const exp = await fetch(`${backend_uri}/syncExport.php`, {
      headers: { "X-Api-Key": API_KEY },
    });
    if (!exp.ok) return;

    await fetch(`${backup_server_uri}/syncImport.php`, {
      method: "POST",
      headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
      body: await exp.text(),
    });
  } catch {
    // Best-effort; the next completed match retries
  } finally {
    syncing = false;
    if (syncQueued) {
      syncQueued = false;
      resyncBackup();
    }
  }
}

// A match reaches 'D' via complete, via activate (which closes the ring's
// previous active match), or via a full update with status 'D'.
function completesMatch(url: string, init: RequestInit): boolean {
  if (!url.includes("matchesApi.php") || typeof init.body !== "string") return false;
  try {
    const body = JSON.parse(init.body);
    return body.action === "complete" || body.action === "activate" || body.status === "D";
  } catch {
    return false;
  }
}

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

  const response = await fetch(mainUrl, { ...init, headers });

  if (response.ok && completesMatch(mainUrl, init)) {
    resyncBackup();
  }

  return response;
}