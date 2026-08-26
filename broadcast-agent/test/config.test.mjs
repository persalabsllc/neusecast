import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";

const required = {
  BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
  BROADCAST_OUTPUT_KEY: "main",
  BROADCAST_AGENT_ID: "neusecast-playout-01"
};

test("control-plane bearer authentication requires HTTPS outside loopback", () => {
  assert.throws(
    () => loadConfig({ ...required, NEUSECAST_BASE_URL: "http://neusecast.example" }),
    /must use HTTPS/
  );
  assert.equal(loadConfig({ ...required, NEUSECAST_BASE_URL: "http://127.0.0.1:3000" }).baseUrl.protocol, "http:");
  assert.equal(loadConfig({
    ...required,
    NEUSECAST_BASE_URL: "http://development.internal:3000",
    ALLOW_INSECURE_CONTROL_PLANE: "true"
  }).baseUrl.hostname, "development.internal");
});
