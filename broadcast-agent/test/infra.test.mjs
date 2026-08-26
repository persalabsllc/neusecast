import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const relayScript = path.join(repository, "infra/casparcg/relay-stream.sh");

async function validateRelay(environment) {
  return execFileAsync("sh", [relayScript], {
    env: {
      PATH: process.env.PATH,
      RELAY_VALIDATE_ONLY: "1",
      ...environment
    }
  });
}

test("relay configuration accepts smoke, Cloudflare RTMPS, and SRT modes", async () => {
  await validateRelay({ STREAM_PROTOCOL: "rtmps", STREAM_OUTPUT_URL: "" });
  await validateRelay({ STREAM_PROTOCOL: "rtmps", STREAM_OUTPUT_URL: "rtmps://live.cloudflare.example/live/secret" });
  await validateRelay({ STREAM_PROTOCOL: "srt", STREAM_OUTPUT_URL: "srt://live.cloudflare.example:778?streamid=secret" });
});

test("relay rejects protocol mismatch and newline injection", async () => {
  await assert.rejects(
    () => validateRelay({ STREAM_PROTOCOL: "srt", STREAM_OUTPUT_URL: "rtmps://live.cloudflare.example/live/key" }),
    (error) => error.code === 64 && /do not match/.test(error.stderr)
  );
  await assert.rejects(
    () => validateRelay({ STREAM_PROTOCOL: "rtmps", STREAM_OUTPUT_URL: "rtmps://example.test/live/key\nsecond" }),
    (error) => error.code === 64 && /forbidden newline/.test(error.stderr)
  );
});

test("Caspar startup configures a realtime local MPEG-TS consumer", async () => {
  const script = await readFile(path.join(repository, "infra/casparcg/start-casparcg.sh"), "utf8");
  const template = await readFile(path.join(repository, "infra/casparcg/casparcg.config.template"), "utf8");
  const streamArgs = /stream_args="([^"]+)"/.exec(script)?.[1];
  assert.ok(streamArgs);
  const rendered = template.replace("$CASPAR_CONSUMER_XML", `<ffmpeg><path>udp://stream-relay:10000</path><args>${streamArgs}</args><realtime>true</realtime></ffmpeg>`);
  assert.match(script, /udp:\/\/stream-relay:10000/);
  assert.match(rendered, /<realtime>true<\/realtime>/);
  assert.match(rendered, /-preset:v veryfast/);
  assert.match(rendered, /-tune:v zerolatency/);
  assert.match(rendered, /-profile:v high/);
  assert.match(rendered, /-level:v 4\.1/);
  assert.match(rendered, /-filter:v format=pix_fmts=yuv420p/);
  assert.match(rendered, /-g:v 60/);
  assert.match(rendered, /-keyint_min:v 60/);
  assert.match(rendered, /-sc_threshold:v 0/);
  assert.match(rendered, /-minrate:v 6000k/);
  assert.match(rendered, /-filter:a pan=stereo\|c0=c0\|c1=c1/);
  assert.match(rendered, /-ac:a 2/);
  assert.match(rendered, /-format mpegts/);
  assert.doesNotMatch(rendered, /(?:^|\s)-f mpegts/);
  assert.doesNotMatch(rendered, /(?:^|\s)-(?:preset|tune|profile|level|g|keyint_min|sc_threshold)(?:\s|=)/);
  assert.doesNotMatch(script, /STREAM_OUTPUT_URL/);
});

test("relay bounds RTMPS and SRT output I/O without logging the secret URL", async () => {
  const script = await readFile(relayScript, "utf8");
  assert.equal((script.match(/-rw_timeout 15000000/g) ?? []).length, 2);
  assert.equal((script.match(/-loglevel quiet/g) ?? []).length, 2);
  assert.doesNotMatch(script, /echo[^\n]*output_url/);
});

test("relay supervisor restarts FFmpeg after an upstream failure", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-relay-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeBin = path.join(directory, "bin");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(fakeBin));
  const calls = path.join(directory, "calls");
  const fakeFfmpeg = path.join(fakeBin, "ffmpeg");
  const fakeSleep = path.join(fakeBin, "sleep");
  await writeFile(fakeFfmpeg, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nexit 1\n`);
  await writeFile(fakeSleep, "#!/bin/sh\nexit 0\n");
  await Promise.all([chmod(fakeFfmpeg, 0o755), chmod(fakeSleep, 0o755)]);
  await execFileAsync("sh", [relayScript], {
    env: {
      PATH: `${fakeBin}:${process.env.PATH}`,
      STREAM_PROTOCOL: "rtmps",
      STREAM_OUTPUT_URL: "rtmps://live.cloudflare.example/live/secret",
      RELAY_READY_FILE: path.join(directory, "ready"),
      RELAY_MAX_RUNS: "2"
    }
  });
  const attempts = (await readFile(calls, "utf8")).trim().split("\n");
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every((args) => args.includes("-codec copy") && args.includes("-f flv") && args.includes("-rw_timeout 15000000")));
});

test("Compose wires Caspar through the healthy supervised relay", async () => {
  const compose = await readFile(path.join(repository, "broadcast-agent/docker-compose.yml"), "utf8");
  const relayDockerfile = await readFile(path.join(repository, "infra/casparcg/Dockerfile.relay"), "utf8");
  assert.match(compose, /\n  stream-relay:\n/);
  assert.match(compose, /STREAM_OUTPUT_URL: \$\{STREAM_OUTPUT_URL:-\}/);
  assert.match(compose, /CASPAR_RELAY_URL: "udp:\/\/stream-relay:10000\?pkt_size=1316"/);
  assert.match(compose, /stream-relay:\n        condition: service_healthy/);
  assert.match(relayDockerfile, /ENTRYPOINT \["\/usr\/bin\/tini", "-g", "--"/);
});

test("24/7 container logs and disposable CEF cache are bounded", async () => {
  const compose = await readFile(path.join(repository, "broadcast-agent/docker-compose.yml"), "utf8");
  const template = await readFile(path.join(repository, "infra/casparcg/casparcg.config.template"), "utf8");

  assert.match(compose, /max-size: "10m"/);
  assert.match(compose, /max-file: "5"/);
  assert.match(compose, /\/var\/lib\/casparcg\/cache:size=536870912/);
  assert.match(template, /<log-path disabled="true">/);
  assert.doesNotMatch(template, /<log-path disable=/);
});
