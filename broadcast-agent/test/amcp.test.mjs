import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { AmcpClient, AmcpResponseParser, amcpQuote } from "../src/amcp.mjs";

test("AMCP quoting prevents command injection and escapes arguments", () => {
  assert.equal(amcpQuote('clip "one"\\final'), '"clip \\"one\\"\\\\final"');
  assert.throws(() => amcpQuote("clip\r\nCLEAR 1"), /control character/);
});

test("AMCP parser handles no-body, single-line, and multi-line responses", () => {
  const parser = new AmcpResponseParser();
  assert.deepEqual(parser.push("202 PLAY OK\r\n"), [{ code: 202, message: "PLAY OK", lines: [] }]);
  assert.deepEqual(parser.push("201 VERSION OK\r\n2.5.0\r\n"), [{ code: 201, message: "VERSION OK", lines: ["2.5.0"] }]);
  assert.deepEqual(parser.push("200 INFO OK\r\nline one\r\nline two\r\n\r\n"), [{ code: 200, message: "INFO OK", lines: ["line one", "line two"] }]);
});

test("AMCP client serializes a real TCP command and response", async (t) => {
  const received = [];
  const server = net.createServer((socket) => socket.on("data", (chunk) => {
    received.push(chunk.toString("utf8"));
    socket.write("202 PLAY OK\r\n");
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const client = new AmcpClient({ host: "127.0.0.1", port: server.address().port, commandTimeoutMs: 1000 });
  t.after(() => client.close());
  const response = await client.send('PLAY 1-10 "CLIP"');
  assert.equal(response.code, 202);
  assert.equal(received.join(""), 'PLAY 1-10 "CLIP"\r\n');
});

test("AMCP errors do not expose a redacted live-source URL", async (t) => {
  const server = net.createServer((socket) => socket.on("data", () => socket.write("400 ERROR\r\n")));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const client = new AmcpClient({ host: "127.0.0.1", port: server.address().port, commandTimeoutMs: 1000 });
  t.after(() => client.close());
  await assert.rejects(
    client.send('PLAY 1-10 "srt://user:top-secret@example.test"', { redactedCommand: "PLAY 1-10 [LIVE SOURCE]" }),
    (error) => !error.message.includes("top-secret") && error.message.includes("[LIVE SOURCE]")
  );
});

test("a partial response cannot poison the parser after reconnect", async (t) => {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    const connection = connections;
    socket.on("data", () => {
      if (connection === 1) {
        socket.end("201 VERSION OK\r\n");
      } else {
        socket.write("202 PLAY OK\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const client = new AmcpClient({ host: "127.0.0.1", port: server.address().port, commandTimeoutMs: 500 });
  t.after(() => client.close());
  await assert.rejects(() => client.send("VERSION SERVER"), /connection closed/i);
  const response = await client.send('PLAY 1-10 "CLIP"');
  assert.equal(response.code, 202);
});

test("a timed-out old socket cannot tear down a replacement connection", async (t) => {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    const connection = connections;
    socket.on("data", () => {
      if (connection > 1) socket.write("202 PLAY OK\r\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const client = new AmcpClient({ host: "127.0.0.1", port: server.address().port, commandTimeoutMs: 25 });
  t.after(() => client.close());
  await assert.rejects(() => client.send("VERSION SERVER"), /timed out/i);
  const response = await client.send('PLAY 1-10 "CLIP"');
  assert.equal(response.code, 202);
  assert.equal(client.connected, true);
});
