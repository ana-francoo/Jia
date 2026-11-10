// Tests for the passage page's open (PRD #353). Run: node --test r/
//
// The committed vector (test/passage-test-vector-v1.json) is a byte-identical copy of jia-app's
// docs/shared-passages/passage-test-vector-v1.json, which the Swift PassageSealer tests open too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeKey,
  formatPassageDate,
  idFromPath,
  keyFromHash,
  openPassage,
  PassageOpenError,
  resolvePassage,
} from "./passage.js";

const vector = JSON.parse(readFileSync(new URL("./test/passage-test-vector-v1.json", import.meta.url)));

test("the committed vector opens to its payload", async () => {
  const payload = await openPassage(vector.ciphertext, vector.key);
  assert.deepEqual(payload, vector.payload);
});

test("a wrong key fails to open", async () => {
  await assert.rejects(openPassage(vector.ciphertext, vector.wrongKey), (e) =>
    e instanceof PassageOpenError && e.reason === "cannot_open");
});

test("tampered ciphertext fails to open", async () => {
  await assert.rejects(openPassage(vector.tamperedCiphertext, vector.key), (e) =>
    e instanceof PassageOpenError && e.reason === "cannot_open");
  await assert.rejects(openPassage("AAAA", vector.key), (e) => e.reason === "cannot_open");
});

test("a malformed key is refused before decrypting", async () => {
  await assert.rejects(openPassage(vector.ciphertext, "short"), (e) => e.reason === "invalid_key");
  assert.equal(decodeKey(""), null);
  assert.equal(decodeKey(vector.key).length, 32);
});

async function sealJSON(json, rawKey) {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json)));
  return Buffer.from(new Uint8Array([...iv, ...ct])).toString("base64");
}

test("another payload version is refused", async () => {
  const sealed = await sealJSON(JSON.stringify({ ...vector.payload, v: 2 }), decodeKey(vector.key));
  await assert.rejects(openPassage(sealed, vector.key), (e) => e.reason === "unsupported_version");
});

test("a payload that isn't a Passage is refused", async () => {
  const sealed = await sealJSON(JSON.stringify({ v: 1, runs: [{ text: 1, voice: "x" }], date: "x" }), decodeKey(vector.key));
  await assert.rejects(openPassage(sealed, vector.key), (e) => e.reason === "malformed_payload");
});

test("the id comes from /r/{id} and the key from the fragment", () => {
  assert.equal(idFromPath("/r/AbCdEfGhIjKlMnOpQrStUv"), "AbCdEfGhIjKlMnOpQrStUv");
  assert.equal(idFromPath("/r/short"), null);
  assert.equal(idFromPath("/elsewhere/AbCdEfGhIjKlMnOpQrStUv"), null);
  assert.equal(keyFromHash("#abc"), "abc");
  assert.equal(keyFromHash(""), null);
});

const location = (id, key) => ({ pathname: `/r/${id}`, hash: key ? `#${key}` : "" });
const okFetch = (body) => async () => ({ ok: true, json: async () => body });

test("a live passage resolves to its payload", async () => {
  const result = await resolvePassage(location("AbCdEfGhIjKlMnOpQrStUv", vector.key), {
    fetch: okFetch({ state: "live", ciphertext: vector.ciphertext }),
  });
  assert.deepEqual(result, { kind: "passage", payload: vector.payload });
});

test("unknown ids, missing fragments and wrong keys all show the doesn't-exist notice", async () => {
  const live = okFetch({ state: "live", ciphertext: vector.ciphertext });
  assert.equal((await resolvePassage(location("AbCdEfGhIjKlMnOpQrStUv", null), { fetch: live })).kind, "unknown");
  assert.equal((await resolvePassage(location("AbCdEfGhIjKlMnOpQrStUv", vector.wrongKey), { fetch: live })).kind, "unknown");
  assert.equal(
    (await resolvePassage(location("AbCdEfGhIjKlMnOpQrStUv", vector.key), { fetch: okFetch({ state: "unknown" }) })).kind,
    "unknown",
  );
});

test("a missing fragment never reaches the network", async () => {
  let called = false;
  await resolvePassage(location("AbCdEfGhIjKlMnOpQrStUv", null), { fetch: async () => { called = true; } });
  assert.equal(called, false);
});

test("a failed fetch is an error, not a missing passage", async () => {
  const result = await resolvePassage(location("AbCdEfGhIjKlMnOpQrStUv", vector.key), {
    fetch: async () => ({ ok: false, status: 500 }),
  });
  assert.equal(result.kind, "error");
});

test("the date reads as the writer's calendar day", () => {
  assert.equal(formatPassageDate("2026-11-10"), "Tuesday, November 10, 2026");
});
