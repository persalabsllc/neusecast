import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventBuffer } from "../src/event-buffer.mjs";

function rejection(status, message = "rejected") {
  return Object.assign(new Error(message), { status, retryable: false });
}

test("one scope-invalid event is durably quarantined without blocking later heartbeat", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-events-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "events.json");
  const deadLetterFile = path.join(directory, "dead.json");
  const send = async (events) => {
    if (events.some((event) => event.type === "media_ready")) throw rejection(403, "archived media version");
    return { accepted: events.length };
  };
  const buffer = new EventBuffer({ filename, deadLetterFile, send });
  await buffer.initialize();
  buffer.add("media_ready", { mediaVersionId: "old" });
  buffer.add("heartbeat", { status: "healthy" });
  const result = await buffer.flush();
  assert.deepEqual(result, { accepted: 1, quarantined: 1 });
  assert.equal(buffer.size, 0);
  assert.equal(buffer.quarantinedSize, 1);
  const persisted = JSON.parse(await readFile(deadLetterFile, "utf8"));
  assert.equal(persisted.events[0].event.type, "media_ready");
});

test("authentication failures remain queued", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-auth-events-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const buffer = new EventBuffer({ filename: path.join(directory, "events.json"), send: async () => { throw rejection(401); } });
  await buffer.initialize();
  buffer.add("heartbeat", { status: "healthy" });
  await assert.rejects(() => buffer.flush(), /rejected/);
  assert.equal(buffer.size, 1);
  await buffer.persist();
});

test("an outage retains only the newest heartbeat while preserving audit events", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-heartbeat-events-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const buffer = new EventBuffer({ filename: path.join(directory, "events.json"), send: async () => ({ accepted: 0 }) });
  await buffer.initialize();
  buffer.add("now_playing", { programItemId: "item-1" });
  buffer.add("heartbeat", { status: "degraded", sequence: 1 });
  buffer.add("as_run", { programItemId: "item-1" });
  buffer.add("heartbeat", { status: "healthy", sequence: 2 });
  await buffer.persist();
  assert.equal(buffer.size, 3);
  const persisted = JSON.parse(await readFile(path.join(directory, "events.json"), "utf8"));
  assert.deepEqual(persisted.events.map((event) => event.type), ["now_playing", "as_run", "heartbeat"]);
  assert.equal(persisted.events.at(-1).sequence, 2);
});
