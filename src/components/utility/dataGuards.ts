/**
 * src/components/utility/dataGuards.ts
 *
 * Centralized defensive helpers to keep React from dying on bad/mismatched data.
 */

// --- Core JSON/Array/ID utilities ---

/** Safe JSON.parse — never throws; returns null on invalid JSON */
export const safeParseJson = (text: string | null): any | null => {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Guarantee array output */
export const ensureArray = <T = any>(v: any): T[] =>
  Array.isArray(v) ? v : [];

/** Alias for ensureArray (semantic) */
export const sanitizeArray = <T = any>(v: any): T[] => ensureArray<T>(v);

/** Force numeric ID or null */
export const coerceId = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// --- Match format normalization ---

export type MatchType =
  | "manual"
  | "roundRobinPools"
  | "singleElimination"
  | "doubleElimination";

/** Normalize API → UI match type */
export const normalizeMatchType = (format: any): MatchType => {
  const f = String(format ?? "").toLowerCase().replace(/[_-]/g, "");
  switch (f) {
    case "manual":
      return "manual";
    case "r":
    case "roundrobinpools":
      return "roundRobinPools";
    case "s":
    case "singleelimination":
      return "singleElimination";
    case "d":
    case "doubleelimination":
      return "doubleElimination";
    default:
      return "manual";
  }
};

/** Alias for clarity in MatchManagement */
export const normalizeMatchFormat = normalizeMatchType;

/** Normalize API format to single/double letter used in SE/DE flows */
export const normalizeFormatLetter = (
  format: any
): "S" | "D" | undefined => {
  const f = String(format ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (f === "S" || f === "SINGLEELIMINATION") return "S";
  if (f === "D" || f === "DOUBLEELIMINATION") return "D";
  return undefined;
};

/** Normalize bracket format for SE/DE components */
export const normalizeBracketFormat = (
  format: any
): "S" | "D" | undefined => normalizeFormatLetter(format);

// --- Data sanitizers ---

/** Sanitize rounds: guarantee { [roundNo:string]: Match[] } with arrays */
export const sanitizeRounds = (rounds: any): Record<string, any[]> => {
  const out: Record<string, any[]> = {};
  if (!rounds || typeof rounds !== "object") return out;
  for (const [k, v] of Object.entries(rounds)) {
    const key = String(parseInt(k as string, 10)); // normalize numeric keys to "N"
    out[key] = ensureArray(v).filter(Boolean);
  }
  return out;
};

/** Alias for bracket-specific clarity */
export const sanitizeBracketRounds = sanitizeRounds;

/** Normalize a fighter-ish object to commonly used fields in FE */
export const normalizeFighterUpper = (f: any) => {
  const id = coerceId(f?.FighterId ?? f?.fighterId);
  return {
    FighterId: id!,
    FighterName: String(f?.FighterName ?? f?.fighterName ?? ""),
    ClubId: coerceId(f?.ClubId ?? f?.clubId),
    ClubName: f?.ClubName ?? f?.clubName ?? null,
    ClubAcronym: f?.ClubAcronym ?? f?.clubAcronym ?? null,
  };
};

/** Guarantee fighters[] with normalized fields */
export const sanitizeFighters = (fighters: any): ReturnType<typeof normalizeFighterUpper>[] => {
  return ensureArray(fighters)
    .map((f) => normalizeFighterUpper(f))
    .filter((f) => f.FighterId !== null && f.FighterId !== undefined);
};
