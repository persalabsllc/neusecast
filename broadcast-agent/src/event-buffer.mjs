import path from "node:path";
import { readFile } from "node:fs/promises";
import { atomicWriteJson, newEventId } from "./util.mjs";

export class EventBuffer {
  constructor({ filename, deadLetterFile = path.join(path.dirname(filename), "events-dead-letter.json"), send, maximum = 10000, batchSize = 50 }) {
    this.filename = filename;
    this.deadLetterFile = deadLetterFile;
    this.send = send;
    this.maximum = maximum;
    this.batchSize = batchSize;
    this.events = [];
    this.deadLetters = [];
    this.flushing = null;
    this.persistChain = Promise.resolve();
    this.lastPersist = Promise.resolve();
  }

  async initialize() {
    try {
      const parsed = JSON.parse(await readFile(this.filename, "utf8"));
      if (Array.isArray(parsed?.events)) this.events = parsed.events.slice(-this.maximum);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      const parsed = JSON.parse(await readFile(this.deadLetterFile, "utf8"));
      if (Array.isArray(parsed?.events)) this.deadLetters = parsed.events.slice(-this.maximum);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  add(type, details = {}, occurredAt = new Date().toISOString()) {
    const event = { eventId: newEventId(), type, occurredAt, ...details };
    // During a control-plane outage only the newest heartbeat is useful; keep
    // audit-bearing now-playing/as-run/command events instead of spending the
    // bounded durable queue on repeated liveness snapshots.
    if (type === "heartbeat") this.events = this.events.filter((candidate) => candidate.type !== "heartbeat");
    this.events.push(event);
    if (this.events.length > this.maximum) {
      const heartbeat = this.events.findIndex((candidate) => candidate.type === "heartbeat");
      this.events.splice(heartbeat === -1 ? 0 : heartbeat, 1);
    }
    void this.#persist().catch(() => undefined);
    return event;
  }

  async flush() {
    if (this.flushing) return this.flushing;
    if (!this.events.length) return { accepted: 0 };
    this.flushing = this.#flushBatch().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async #flushBatch() {
    const batch = this.events.slice(0, this.batchSize);
    try {
      const result = await this.send(batch);
      await this.#remove(batch);
      return result;
    } catch (error) {
      if (error?.retryable !== false || error?.status === 401) throw error;
      return this.#isolateInvalidEvents(batch, error);
    }
  }

  async #isolateInvalidEvents(batch, batchError) {
    const completed = [];
    const quarantined = [];
    for (const event of batch) {
      try {
        await this.send([event]);
        completed.push(event);
      } catch (error) {
        const protectedFromDrop = error?.status === 401
          || (error?.status === 403 && new Set(["heartbeat", "command_ack", "error"]).has(event.type));
        if (error?.retryable !== false || protectedFromDrop) {
          if (completed.length || quarantined.length) await this.#commitIsolation(completed, quarantined);
          throw error;
        }
        quarantined.push({
          event,
          quarantinedAt: new Date().toISOString(),
          error: {
            name: String(error?.name ?? "Error"),
            message: String(error?.message ?? batchError?.message ?? "Control plane rejected event").slice(0, 2000),
            status: Number.isInteger(error?.status) ? error.status : null
          }
        });
      }
    }
    await this.#commitIsolation(completed, quarantined);
    return { accepted: completed.length, quarantined: quarantined.length };
  }

  async #commitIsolation(completed, quarantined) {
    if (quarantined.length) {
      const existingIds = new Set(this.deadLetters.map((entry) => entry.event?.eventId));
      for (const entry of quarantined) if (!existingIds.has(entry.event?.eventId)) this.deadLetters.push(entry);
      this.deadLetters = this.deadLetters.slice(-this.maximum);
      // Write the quarantine first. A crash before queue removal may duplicate a
      // later send, but cannot silently lose the rejected event.
      await atomicWriteJson(this.deadLetterFile, { version: 1, events: this.deadLetters });
    }
    await this.#remove([...completed, ...quarantined.map((entry) => entry.event)]);
  }

  async #remove(events) {
    const sent = new Set(events.map((event) => event.eventId));
    this.events = this.events.filter((event) => !sent.has(event.eventId));
    await this.#persist();
  }

  #persist() {
    const task = this.persistChain.then(() => atomicWriteJson(this.filename, { version: 1, events: this.events }));
    this.lastPersist = task;
    this.persistChain = task.catch((error) => {
      process.stderr.write(`${JSON.stringify({ level: "error", message: "event_buffer_persist_failed", error: error.message })}\n`);
    });
    return task;
  }

  persist() {
    return this.lastPersist;
  }

  get size() {
    return this.events.length;
  }

  get quarantinedSize() {
    return this.deadLetters.length;
  }

  hasType(type) {
    return this.events.some((event) => event.type === type);
  }
}
