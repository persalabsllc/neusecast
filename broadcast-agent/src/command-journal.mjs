import { readFile } from "node:fs/promises";
import { atomicWriteJson } from "./util.mjs";

export class CommandJournal {
  constructor({ filename, maximum = 10000 }) {
    this.filename = filename;
    this.maximum = maximum;
    this.entries = [];
    this.byKey = new Map();
  }

  async initialize() {
    try {
      const parsed = JSON.parse(await readFile(this.filename, "utf8"));
      if (parsed?.version === 1 && Array.isArray(parsed.entries)) this.entries = parsed.entries.slice(-this.maximum);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    this.#reindex();
  }

  find(command) {
    return this.byKey.get(`id:${command.id}`)
      ?? (command.idempotencyKey ? this.byKey.get(`key:${command.idempotencyKey}`) : null)
      ?? null;
  }

  async record(command, status, message) {
    const entry = {
      commandId: String(command.id),
      idempotencyKey: command.idempotencyKey ? String(command.idempotencyKey) : null,
      status,
      message,
      handledAt: new Date().toISOString()
    };
    this.entries.push(entry);
    this.entries = this.entries.slice(-this.maximum);
    this.#reindex();
    await atomicWriteJson(this.filename, { version: 1, entries: this.entries });
    return entry;
  }

  #reindex() {
    this.byKey.clear();
    for (const entry of this.entries) {
      this.byKey.set(`id:${entry.commandId}`, entry);
      if (entry.idempotencyKey) this.byKey.set(`key:${entry.idempotencyKey}`, entry);
    }
  }
}
