import { EventEmitter } from "node:events";
import net from "node:net";
import { withoutControlCharacters } from "./util.mjs";

export class AmcpError extends Error {
  constructor(message, { code, command, response } = {}) {
    super(message);
    this.name = "AmcpError";
    this.code = code;
    this.command = command;
    this.response = response;
  }
}

export function amcpQuote(value) {
  const text = withoutControlCharacters(value, "AMCP argument");
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function layerAddress(channel, layer) {
  if (!Number.isInteger(channel) || channel < 1 || !Number.isInteger(layer) || layer < 0) {
    throw new Error("Invalid CasparCG channel-layer address");
  }
  return `${channel}-${layer}`;
}

export class AmcpResponseParser {
  #buffer = "";
  #header = null;
  #body = [];

  push(chunk) {
    this.#buffer += chunk;
    const responses = [];
    while (true) {
      const boundary = this.#buffer.indexOf("\r\n");
      if (boundary === -1) break;
      const line = this.#buffer.slice(0, boundary);
      this.#buffer = this.#buffer.slice(boundary + 2);

      if (!this.#header) {
        const match = /^(\d{3})\s?(.*)$/.exec(line);
        if (!match) continue;
        const code = Number(match[1]);
        const header = { code, message: match[2], lines: [] };
        if (code === 200 || code === 101) {
          this.#header = header;
          this.#body = [];
        } else if (code === 201) {
          this.#header = header;
          this.#body = [];
        } else {
          responses.push(header);
        }
        continue;
      }

      if (this.#header.code === 201) {
        this.#header.lines = [line];
        responses.push(this.#header);
        this.#header = null;
        this.#body = [];
      } else if (line === "") {
        this.#header.lines = this.#body;
        responses.push(this.#header);
        this.#header = null;
        this.#body = [];
      } else {
        this.#body.push(line);
      }
    }
    return responses;
  }
}

export class AmcpClient extends EventEmitter {
  constructor({ host = "127.0.0.1", port = 5250, connectTimeoutMs = 5000, commandTimeoutMs = 5000 } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.connectTimeoutMs = connectTimeoutMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.socket = null;
    this.parser = new AmcpResponseParser();
    this.pending = [];
    this.connectPromise = null;
    this.commandChain = Promise.resolve();
    this.connected = false;
    this.lastResponseAt = null;
  }

  async connect() {
    if (this.connected && this.socket && !this.socket.destroyed) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const parser = new AmcpResponseParser();
      let didConnect = false;
      const timeout = setTimeout(() => socket.destroy(new Error("AMCP connect timeout")), this.connectTimeoutMs);
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 5000);
      socket.on("connect", () => {
        clearTimeout(timeout);
        didConnect = true;
        this.socket = socket;
        this.parser = parser;
        this.connected = true;
        this.emit("connect");
        resolve();
      });
      socket.on("data", (chunk) => {
        if (this.socket === socket) this.#onData(parser, chunk);
      });
      socket.on("error", (error) => {
        if (!didConnect) reject(error);
        this.emit("socket-error", error);
      });
      socket.on("close", () => {
        clearTimeout(timeout);
        if (this.socket !== socket) return;
        const wasConnected = didConnect && this.connected;
        this.connected = false;
        this.socket = null;
        this.parser = new AmcpResponseParser();
        this.#rejectPending(new AmcpError("AMCP connection closed", { code: "CONNECTION_CLOSED" }));
        if (wasConnected) this.emit("disconnect");
      });
    }).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  send(command, options = {}) {
    const cleanCommand = withoutControlCharacters(command, "AMCP command").trim();
    if (!cleanCommand) return Promise.reject(new Error("AMCP command is empty"));
    const operation = this.commandChain.then(() => this.#sendOne(cleanCommand, options));
    this.commandChain = operation.catch(() => undefined);
    return operation;
  }

  async #sendOne(command, { timeoutMs = this.commandTimeoutMs, redactedCommand } = {}) {
    await this.connect();
    const displayCommand = redactedCommand
      ? withoutControlCharacters(redactedCommand, "redacted AMCP command").trim()
      : command;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pending.findIndex((entry) => entry.resolve === resolve);
        if (index !== -1) this.pending.splice(index, 1);
        reject(new AmcpError(`AMCP command timed out: ${displayCommand}`, { code: "TIMEOUT", command: displayCommand }));
        this.socket?.destroy();
      }, timeoutMs);
      this.pending.push({ command: displayCommand, resolve, reject, timer });
      this.socket.write(`${command}\r\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        const index = this.pending.findIndex((entry) => entry.resolve === resolve);
        if (index !== -1) this.pending.splice(index, 1);
        reject(error);
      });
    });
  }

  #onData(parser, chunk) {
    for (const response of parser.push(chunk.toString("utf8"))) {
      if (response.code < 200 && response.code !== 101) {
        this.emit("informational", response);
        continue;
      }
      const pending = this.pending.shift();
      if (!pending) {
        this.emit("orphan-response", response);
        continue;
      }
      clearTimeout(pending.timer);
      this.lastResponseAt = new Date().toISOString();
      if (response.code >= 400) {
        pending.reject(new AmcpError(`CasparCG rejected ${pending.command}: ${response.message}`, {
          code: response.code,
          command: pending.command,
          response
        }));
      } else {
        pending.resolve(response);
      }
    }
  }

  #rejectPending(error) {
    for (const pending of this.pending.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    this.parser = new AmcpResponseParser();
    this.#rejectPending(new AmcpError("AMCP client closed", { code: "CLIENT_CLOSED" }));
    socket?.destroy();
  }
}
