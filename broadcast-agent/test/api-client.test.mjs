import assert from "node:assert/strict";
import test from "node:test";
import { ControlPlaneClient } from "../src/api-client.mjs";

function fakeFetch(urls) {
  return async (url) => {
    urls.push(url.toString());
    return new Response(JSON.stringify({ commands: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
}

test("control-plane routes stay on the configured host at root and subpath bases", async () => {
  const rootUrls = [];
  const root = new ControlPlaneClient({
    baseUrl: new URL("https://neusecast.com"), secret: "secret", outputKey: "main", agentId: "agent", fetchImpl: fakeFetch(rootUrls)
  });
  await root.commands(null);
  assert.equal(rootUrls[0], "https://neusecast.com/api/broadcast/agent/commands?outputKey=main");

  const subpathUrls = [];
  const subpath = new ControlPlaneClient({
    baseUrl: new URL("https://example.test/control/"), secret: "secret", outputKey: "main", agentId: "agent", fetchImpl: fakeFetch(subpathUrls)
  });
  await subpath.commands("cursor-1");
  assert.equal(subpathUrls[0], "https://example.test/control/api/broadcast/agent/commands?outputKey=main&after=cursor-1");
});
