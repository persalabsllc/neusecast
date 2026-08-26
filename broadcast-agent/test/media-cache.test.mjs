import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MediaCache } from "../src/media-cache.mjs";

test("media cache verifies checksums and records ffprobe metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-media-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeProbe = path.join(directory, "ffprobe");
  await writeFile(fakeProbe, '#!/bin/sh\nprintf \'%s\' \'{"format":{"duration":"12.5","format_name":"mov,mp4"},"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080},{"codec_type":"audio","codec_name":"aac"}]}\'\n');
  await chmod(fakeProbe, 0o755);
  const bytes = Buffer.from("fake video bytes");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const cache = new MediaCache({
    directory,
    ffprobePath: fakeProbe,
    fetchImpl: async () => new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } })
  });
  await cache.initialize();
  const result = await cache.resolve({ versionId: "version-1", assetId: "asset-1", playbackUrl: "https://media.example/clip.mp4", sha256: checksum, mimeType: "video/mp4" });
  assert.equal(result.validated, true);
  assert.equal(result.probe.durationMs, 12500);
  assert.equal(result.probe.width, 1920);
  assert.equal(result.sha256, checksum);
  const cached = await cache.resolve({ versionId: "version-1", assetId: "asset-1", playbackUrl: "https://media.example/clip.mp4", sha256: checksum });
  assert.equal(cached.wasNew, false);
});

test("media cache accepts a timed audio-only asset", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-audio-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeProbe = path.join(directory, "ffprobe");
  await writeFile(fakeProbe, '#!/bin/sh\nprintf \'%s\' \'{"format":{"duration":"30","format_name":"mp3"},"streams":[{"codec_type":"audio","codec_name":"mp3"}]}\'\n');
  await chmod(fakeProbe, 0o755);
  const cache = new MediaCache({ directory, ffprobePath: fakeProbe, fetchImpl: async () => new Response(Buffer.from("audio"), { status: 200 }) });
  await cache.initialize();
  const result = await cache.resolve({ versionId: "audio-version", assetId: "audio-asset", playbackUrl: "https://media.example/clip.mp3", mimeType: "audio/mpeg" });
  assert.equal(result.validated, true);
  assert.equal(result.probe.durationMs, 30000);
  assert.equal(result.probe.width, null);
  assert.equal(result.probe.height, null);
  assert.equal(result.probe.audioCodec, "mp3");
});

test("media cache accepts a static GIF without a duration", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-gif-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeProbe = path.join(directory, "ffprobe");
  await writeFile(fakeProbe, '#!/bin/sh\nprintf \'%s\' \'{"format":{"format_name":"gif"},"streams":[{"codec_type":"video","codec_name":"gif","width":640,"height":360}]}\'\n');
  await chmod(fakeProbe, 0o755);
  const bytes = Buffer.from("GIF89a");
  const cache = new MediaCache({ directory, ffprobePath: fakeProbe, fetchImpl: async () => new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } }) });
  await cache.initialize();
  const result = await cache.resolve({ versionId: "gif-version", assetId: "gif-asset", fileName: "still.gif", playbackUrl: "https://media.example/still.gif", mimeType: "image/gif" });
  assert.equal(result.probe.durationMs, null);
  assert.equal(result.probe.videoCodec, "gif");
  assert.equal(result.probe.mimeType, "image/gif");
  assert.match(result.filename, /\.gif$/);
});

test("aggregate cache budget evicts least-recently-used unprotected media", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-lru-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeProbe = path.join(directory, "ffprobe");
  await writeFile(fakeProbe, '#!/bin/sh\nprintf \'%s\' \'{"format":{"duration":"1","format_name":"mov,mp4"},"streams":[{"codec_type":"video","codec_name":"h264","width":320,"height":180}]}\'\n');
  await chmod(fakeProbe, 0o755);
  const bytes = Buffer.from("123456");
  const cache = new MediaCache({
    directory,
    ffprobePath: fakeProbe,
    maxFileBytes: 8,
    maxCacheBytes: 12,
    fetchImpl: async () => new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } })
  });
  await cache.initialize();
  await cache.resolveAll([{ versionId: "one", playbackUrl: "https://media.example/one.mp4" }]);
  await cache.resolveAll([{ versionId: "two", playbackUrl: "https://media.example/two.mp4" }]);
  cache.manifest.assets.one.lastAccessedAt = "2026-01-01T00:00:00.000Z";
  cache.manifest.assets.two.lastAccessedAt = "2026-01-02T00:00:00.000Z";
  await cache.resolveAll(
    [{ versionId: "three", playbackUrl: "https://media.example/three.mp4" }],
    3,
    [{ versionId: "one" }, { versionId: "three" }]
  );
  assert.equal(cache.stats().bytes, 12);
  assert.deepEqual(Object.keys(cache.manifest.assets).sort(), ["one", "three"]);
});

test("cache initialization removes interrupted and untracked agent downloads", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-orphan-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cacheDirectory = path.join(directory, "neusecast");
  await mkdir(cacheDirectory);
  const partial = path.join(cacheDirectory, "0123456789abcdef0123.mp4.42.part");
  const orphan = path.join(cacheDirectory, "abcdef0123456789abcd.mp4");
  await writeFile(partial, "partial");
  await writeFile(orphan, "orphan");
  const cache = new MediaCache({ directory });
  await cache.initialize();
  await assert.rejects(() => access(partial), (error) => error.code === "ENOENT");
  await assert.rejects(() => access(orphan), (error) => error.code === "ENOENT");
});

test("database casparClipName is not trusted unless the local clip exists", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-direct-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeProbe = path.join(directory, "ffprobe");
  await writeFile(fakeProbe, '#!/bin/sh\nprintf \'%s\' \'{"format":{"duration":"2"},"streams":[{"codec_type":"video","codec_name":"h264","width":320,"height":180}]}\'\n');
  await chmod(fakeProbe, 0o755);
  const cache = new MediaCache({ directory, ffprobePath: fakeProbe });
  await cache.initialize();
  await assert.rejects(
    () => cache.resolve({ versionId: "direct", casparClipName: "preprovisioned/clip" }),
    /not present/
  );
  await mkdir(path.join(directory, "preprovisioned"));
  await writeFile(path.join(directory, "preprovisioned", "clip.mp4"), "video");
  const result = await cache.resolve({ versionId: "direct", casparClipName: "preprovisioned/clip" });
  assert.equal(result.clipName, "preprovisioned/clip");
  assert.equal(result.validated, true);
});
