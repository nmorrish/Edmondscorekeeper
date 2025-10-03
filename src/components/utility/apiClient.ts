/**
 * src/components/utility/apiClient.ts
 *
 * == Universal API Client ==
 * Takes a full API path (already built, with query params if needed)
 * and a method string ("GET" | "POST" | "PUT" | "DELETE").
 *
 * - Always attaches X-Api-Key
 * - Always mirrors to backup server (fire-and-forget)
 * - Returns parsed JSON
 */

import { backup_server_uri, API_KEY } from "../utility/endpoints";

/**
 * Universal API query
 * @param method - HTTP method ("GET", "POST", "PUT", "DELETE", etc)
 * @param url - Full API path (e.g. `${event_fighters_api}?eventId=5`)
 * @param payload - Optional payload (for POST/PUT/DELETE)
 */
export async function apiQuery<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: Record<string, any>
): Promise<T> {
  const headers: HeadersInit = { "X-Api-Key": API_KEY };
  let body: string | undefined;

  if (method !== "GET" && payload) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }

  // Main call
  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body } : {}),
  });

  // Fire-and-forget mirror
  const mirrorUrl = url.replace(/^(https?:\/\/[^/]+)/, backup_server_uri);
  fetch(mirrorUrl, {
    method,
    headers,
    ...(body ? { body } : {}),
  }).catch(() => {});

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
