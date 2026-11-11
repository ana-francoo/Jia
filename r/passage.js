// Shared passage: fetch and open (PRD #353, ADR-0064 in ana-francoo/jia-app).
//
// The page at tryjia.app/r/{id}#{key} fetches the ciphertext for {id} and opens it here, in the
// reader's browser, with the key from the #fragment — which the browser never sends to a server.
// This mirrors the app's PassageSealer (SharedPassageKit) exactly:
//
//   ciphertext = base64( nonce[12] || AES-256-GCM ciphertext || tag[16] )
//   key        = unpadded base64url of 32 bytes
//   plaintext  = UTF-8 JSON { v: 1, runs: [{ text, voice: "writer"|"companion" }], date: "yyyy-MM-dd",
//                             paperStyleID, paperToneID, inkToneID }
//
// Both sides are pinned by the committed test vector (test/passage-test-vector-v1.json, a
// byte-identical copy of jia-app's docs/shared-passages/passage-test-vector-v1.json).
//
// No DOM here: the module runs in the browser and under `node --test` alike.

export const PAYLOAD_VERSION = 1;

export const SHARED_PASSAGES_ENDPOINT =
  "https://soavgjuymxtnlgiaspmd.supabase.co/functions/v1/shared-passages";

/** Why a passage could not be opened. Every one shows the "doesn't exist" notice. */
export class PassageOpenError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason; // "invalid_key" | "cannot_open" | "unsupported_version" | "malformed_payload"
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decodes an unpadded base64url key; `null` unless it is exactly 32 bytes. */
export function decodeKey(base64url) {
  if (typeof base64url !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(base64url)) return null;
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  base64 += "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const bytes = base64ToBytes(base64);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Opens a sealed passage. Resolves to the payload, or rejects with a PassageOpenError for a bad
 * key, a wrong key or tampered bytes, another payload version, or anything that isn't a Passage.
 */
export async function openPassage(ciphertextBase64, keyBase64url, subtle = globalThis.crypto.subtle) {
  const rawKey = decodeKey(keyBase64url);
  if (!rawKey) throw new PassageOpenError("invalid_key");

  let plaintext;
  try {
    const combined = base64ToBytes(ciphertextBase64);
    if (combined.length < 12 + 16) throw new Error("short");
    const key = await subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) },
      key,
      combined.slice(12),
    );
  } catch {
    throw new PassageOpenError("cannot_open");
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new PassageOpenError("malformed_payload");
  }
  if (!payload || typeof payload.v !== "number") throw new PassageOpenError("malformed_payload");
  if (payload.v !== PAYLOAD_VERSION) throw new PassageOpenError("unsupported_version");
  const runsOK = Array.isArray(payload.runs) && payload.runs.every(
    (run) => run && typeof run.text === "string" && (run.voice === "writer" || run.voice === "companion"),
  );
  if (!runsOK || typeof payload.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    throw new PassageOpenError("malformed_payload");
  }
  return payload;
}

/** The id from a `/r/{id}` path, or null. */
export function idFromPath(pathname) {
  const match = /^\/r\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname);
  return match ? match[1] : null;
}

/** The key from a location hash (`#key`), or null. */
export function keyFromHash(hash) {
  const key = (hash || "").replace(/^#/, "");
  return key.length > 0 ? key : null;
}

/**
 * Asks the edge function for a passage's state: `{ state: "live", ciphertext }`, `{ state: "expired" }`
 * (past its 24 hours, ciphertext gone or withheld) or `{ state: "unknown" }`.
 */
export async function fetchPassageState(id, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${SHARED_PASSAGES_ENDPOINT}/${encodeURIComponent(id)}`, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return await res.json();
}

/**
 * Everything the page needs to decide what to show, from its location alone:
 *   { kind: "passage", payload } | { kind: "expired" } | { kind: "unknown" } | { kind: "error" }
 * A missing id or fragment, an unknown id, or a passage that won't open are all "unknown" — the
 * "doesn't exist" notice. A passage past its 24 hours (or a tombstone) is "expired" — the expired
 * notice (#355). A link with a missing or malformed key is "unknown" before any fetch, expired or not.
 */
export async function resolvePassage(location, deps = {}) {
  const id = idFromPath(location.pathname);
  const key = keyFromHash(location.hash);
  if (!id || !key || !decodeKey(key)) return { kind: "unknown" };
  let state;
  try {
    state = await fetchPassageState(id, deps.fetch);
  } catch {
    return { kind: "error" };
  }
  if (state?.state === "expired") return { kind: "expired" };
  if (state?.state !== "live" || typeof state.ciphertext !== "string") return { kind: "unknown" };
  try {
    return { kind: "passage", payload: await openPassage(state.ciphertext, key) };
  } catch {
    return { kind: "unknown" };
  }
}

/** "Tuesday, November 10, 2026" for "2026-11-10", read as a calendar day (no time zone shift). */
export function formatPassageDate(isoDate, locale = "en-US") {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * The class a run's span wears: "run run-companion" for the Companion's words (#360), set apart in
 * passage.css, and "run run-writer" for the writer's own. Each run's text goes into its span verbatim,
 * so the voice boundary adds no whitespace and the newlines inside the runs are the paragraph breaks.
 */
export function runClassName(voice) {
  return voice === "companion" ? "run run-companion" : "run run-writer";
}
