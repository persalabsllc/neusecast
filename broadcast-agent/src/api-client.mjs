export class ControlPlaneError extends Error {
  constructor(message, { status, retryable = false, body } = {}) {
    super(message);
    this.name = "ControlPlaneError";
    this.status = status;
    this.retryable = retryable;
    this.body = body;
  }
}

export class ControlPlaneClient {
  constructor({ baseUrl, secret, outputKey, agentId, timeoutMs = 10000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl;
    this.secret = secret;
    this.outputKey = outputKey;
    this.agentId = agentId;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.snapshotEtag = null;
  }

  async snapshot() {
    const headers = this.snapshotEtag ? { "If-None-Match": this.snapshotEtag } : {};
    const response = await this.#request("GET", "/api/broadcast/agent/snapshot", {
      query: { outputKey: this.outputKey },
      headers,
      allowNotModified: true
    });
    if (response.notModified) return null;
    this.snapshotEtag = response.headers.get("etag") || null;
    return response.body;
  }

  async commands(after) {
    return (await this.#request("GET", "/api/broadcast/agent/commands", {
      query: { outputKey: this.outputKey, ...(after ? { after } : {}) }
    })).body;
  }

  async events(events) {
    if (!events.length) return { accepted: 0 };
    return (await this.#request("POST", "/api/broadcast/agent/events", {
      body: { outputKey: this.outputKey, agentId: this.agentId, events }
    })).body;
  }

  async #request(method, pathname, { query, body, headers = {}, allowNotModified = false } = {}) {
    const basePath = this.baseUrl.pathname === "/" ? "" : this.baseUrl.pathname.replace(/\/+$/, "");
    const routePath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const url = new URL(`${basePath}${routePath}`, this.baseUrl.origin);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Control-plane request timed out")), this.timeoutMs);
    try {
      const response = await this.fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.secret}`,
          "X-Neusecast-Agent-Id": this.agentId,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      if (allowNotModified && response.status === 304) return { notModified: true, headers: response.headers };
      const text = await response.text();
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = { message: text.slice(0, 500) }; }
      }
      if (!response.ok) {
        throw new ControlPlaneError(`Control plane returned HTTP ${response.status}`, {
          status: response.status,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          body: parsed
        });
      }
      return { notModified: false, headers: response.headers, body: parsed ?? {} };
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      throw new ControlPlaneError(error instanceof Error ? error.message : String(error), { retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }
}
