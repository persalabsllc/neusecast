import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { asObject, atomicWriteJson, firstDefined, safeIdentifier, sha256, withoutControlCharacters } from "./util.mjs";

const EXTENSIONS = new Set([".mp4", ".mov", ".mxf", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".ts", ".m4v", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".wav", ".mp3"]);
const execFileAsync = promisify(execFile);

export class MediaCacheError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.name = "MediaCacheError";
    this.retryable = retryable;
  }
}

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

async function hashFile(filename) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filename), hash);
  return hash.digest("hex");
}

function extensionFor(asset, downloadUrl) {
  const fromName = path.extname(String(firstDefined(asset.fileName, asset.filename, ""))).toLowerCase();
  if (EXTENSIONS.has(fromName)) return fromName;
  const fromUrl = path.extname(new URL(downloadUrl).pathname).toLowerCase();
  return EXTENSIONS.has(fromUrl) ? fromUrl : ".mp4";
}

export class MediaCache {
  constructor({
    directory,
    manifestFile = path.join(directory, ".neusecast-manifest.json"),
    maxFileBytes = 5 * 1024 * 1024 * 1024,
    maxCacheBytes = 20 * 1024 * 1024 * 1024,
    // Backward-compatible constructor input for integrations built before the
    // per-file/aggregate limits were separated.
    maxBytes,
    fetchImpl = globalThis.fetch,
    ffprobePath = "ffprobe",
    downloadTimeoutMs = 1800000
  }) {
    this.directory = directory;
    this.manifestFile = manifestFile;
    this.maxFileBytes = maxBytes ?? maxFileBytes;
    this.maxCacheBytes = maxCacheBytes;
    if (this.maxCacheBytes < this.maxFileBytes) throw new Error("maxCacheBytes must be greater than or equal to maxFileBytes");
    this.fetch = fetchImpl;
    this.ffprobePath = ffprobePath;
    this.downloadTimeoutMs = downloadTimeoutMs;
    this.manifest = { version: 1, assets: {} };
    this.inflight = new Map();
    this.downloadControllers = new Map();
    this.reservations = new Map();
    this.protectedIds = new Set();
    this.cacheLock = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.manifestFile, "utf8"));
      if (parsed?.version === 1 && parsed.assets && typeof parsed.assets === "object") this.manifest = parsed;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await this.#cleanupOrphans();
  }

  async resolve(asset) {
    const source = asObject(asset);
    const id = safeIdentifier(String(firstDefined(source.versionId, source.mediaVersionId, source.id, source.assetId, "")), "media version id");
    const directClip = firstDefined(source.casparClipName, source.clipName);
    const downloadUrl = firstDefined(source.downloadUrl, source.storageUrl, source.playbackUrl, source.sourceUrl, source.url);
    if (!downloadUrl && directClip) {
      const clean = withoutControlCharacters(directClip, "CasparCG clip name").replaceAll("\\", "/");
      if (clean.startsWith("/") || /^[A-Za-z]:\//.test(clean) || clean.split("/").includes("..")) throw new Error(`Asset ${id} has an unsafe clip name`);
      const suppliedExtension = path.extname(clean).toLowerCase();
      const candidates = suppliedExtension
        ? [clean]
        : [...EXTENSIONS].map((extension) => `${clean}${extension}`);
      let filename = null;
      for (const candidate of candidates) {
        const resolved = path.resolve(this.directory, candidate);
        if (resolved.startsWith(`${path.resolve(this.directory)}${path.sep}`) && await exists(resolved)) {
          filename = resolved;
          break;
        }
      }
      if (!filename) throw new MediaCacheError(`Preprovisioned clip is not present on this playout host: ${id}`, { retryable: true });
      const probe = await this.#probe(filename, source);
      return {
        mediaVersionId: id,
        assetId: String(source.assetId ?? id),
        clipName: clean.replace(/\.[^.\/]+$/, ""),
        filename,
        cached: false,
        validated: true,
        probe
      };
    }
    if (!downloadUrl) throw new Error(`Asset ${id} has no download URL or CasparCG clip name`);
    if (this.inflight.has(id)) return this.inflight.get(id);
    const controller = new AbortController();
    this.downloadControllers.set(id, controller);
    const operation = this.#download(id, source, String(downloadUrl), controller.signal).finally(() => {
      this.inflight.delete(id);
      this.downloadControllers.delete(id);
    });
    this.inflight.set(id, operation);
    return operation;
  }

  setProtectedAssets(assets, { abortUnprotected = false } = {}) {
    this.protectedIds = new Set([...assets].map((asset) => String(asset?.versionId ?? asset?.mediaVersionId ?? asset?.id ?? asset?.assetId ?? "unknown")));
    if (abortUnprotected) {
      for (const [id, controller] of this.downloadControllers) {
        if (!this.protectedIds.has(id)) controller.abort(new Error("Media is no longer referenced by the latest snapshot"));
      }
    }
  }

  async #download(id, asset, rawUrl, abortSignal) {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") throw new Error(`Asset ${id} download URL must use HTTPS`);
    const expectedHash = String(firstDefined(asset.sha256, asset.checksumSha256, "")).toLowerCase();
    if (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error(`Asset ${id} has an invalid SHA-256 checksum`);
    const extension = extensionFor(asset, url);
    const basename = `${sha256(id).slice(0, 20)}${extension}`;
    const destination = path.join(this.directory, "neusecast", basename);
    const clipName = `neusecast/${basename.slice(0, -extension.length)}`;
    const known = this.manifest.assets[id];
    if (known?.filename === destination && (!expectedHash || known.sha256 === expectedHash) && await exists(destination)) {
      const probe = known.probe ?? await this.#probe(destination, asset);
      // In-memory access time is enough to protect LRU decisions in this run;
      // the next manifest mutation persists it without a write on every poll.
      known.probe = probe;
      known.lastAccessedAt = new Date().toISOString();
      return { mediaVersionId: id, assetId: String(asset.assetId ?? id), clipName, filename: destination, cached: true, wasNew: false, validated: true, sha256: known.sha256, probe };
    }

    let response;
    try {
      response = await this.fetch(url, {
        redirect: "follow",
        signal: AbortSignal.any([abortSignal, AbortSignal.timeout(this.downloadTimeoutMs)])
      });
    } catch {
      throw new MediaCacheError(`Asset ${id} download failed`, { retryable: true });
    }
    if (!response.ok || !response.body) {
      const retryable = new Set([401, 403, 404, 408, 425, 429]).has(response.status) || response.status >= 500;
      throw new MediaCacheError(`Asset ${id} download failed with HTTP ${response.status}`, { retryable });
    }
    if (response.url && new URL(response.url).protocol !== "https:") throw new MediaCacheError(`Asset ${id} download redirected away from HTTPS`);
    const contentLength = response.headers.get("content-length");
    const declaredBytes = contentLength === null ? null : Number(contentLength);
    if (declaredBytes !== null && (!Number.isFinite(declaredBytes) || declaredBytes < 0)) throw new MediaCacheError(`Asset ${id} has an invalid Content-Length`);
    if (declaredBytes !== null && declaredBytes > this.maxFileBytes) throw new MediaCacheError(`Asset ${id} exceeds MEDIA_MAX_FILE_BYTES`);
    const reservedBytes = declaredBytes ?? this.maxFileBytes;
    await this.#reserve(id, reservedBytes);

    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.part`;
    let written = 0;
    const maxBytes = Math.min(this.maxFileBytes, reservedBytes);
    const guarded = new Transform({
      transform(chunk, _encoding, callback) {
        written += chunk.length;
        if (written > maxBytes) callback(new MediaCacheError(`Asset ${id} exceeds its declared size or MEDIA_MAX_FILE_BYTES`));
        else callback(null, chunk);
      }
    });
    let installed = false;
    try {
      await pipeline(Readable.fromWeb(response.body), guarded, createWriteStream(temporary, { mode: 0o640 }));
      const actualHash = await hashFile(temporary);
      if (expectedHash && actualHash !== expectedHash) throw new MediaCacheError(`Asset ${id} failed SHA-256 verification`);
      const probe = await this.#probe(temporary, asset);
      await rename(temporary, destination);
      installed = true;
      const details = await stat(destination);
      const entry = {
        filename: destination,
        clipName,
        sha256: actualHash,
        bytes: details.size,
        probe,
        cachedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString()
      };
      await this.#commit(id, entry);
      return { mediaVersionId: id, assetId: String(asset.assetId ?? id), clipName, filename: destination, cached: true, wasNew: true, validated: true, sha256: actualHash, probe };
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      if (installed && !this.manifest.assets[id]) await unlink(destination).catch(() => undefined);
      await this.#release(id);
      if (abortSignal.aborted) throw new MediaCacheError(`Asset ${id} download was interrupted`, { retryable: true });
      throw error;
    }
  }

  async #probe(filename, asset) {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(this.ffprobePath, [
        "-v", "error",
        "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height",
        "-of", "json",
        filename
      ], { timeout: 30000, maxBuffer: 1024 * 1024 }));
    } catch (error) {
      throw new MediaCacheError(`ffprobe rejected media: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = JSON.parse(stdout);
    const streams = Array.isArray(result.streams) ? result.streams : [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (!video && !audio) throw new MediaCacheError("Media has no playable audio or video stream");
    const durationSeconds = Number(result.format?.duration ?? asset.durationSeconds ?? (Number(asset.durationMs) / 1000));
    const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : null;
    const isImage = video && ["png", "mjpeg", "webp", "gif"].includes(String(video.codec_name));
    if (!isImage && durationMs === null) throw new MediaCacheError("Media has no valid duration");
    const width = video ? Number(video.width) : null;
    const height = video ? Number(video.height) : null;
    if (video && (!Number.isInteger(width) || width < 16 || !Number.isInteger(height) || height < 16)) throw new MediaCacheError("Media has invalid video dimensions");
    return {
      durationMs,
      width,
      height,
      videoCodec: String(video?.codec_name ?? ""),
      audioCodec: String(audio?.codec_name ?? ""),
      formatName: String(result.format?.format_name ?? ""),
      mimeType: String(asset.mimeType ?? mimeTypeFor(filename))
    };
  }

  async resolveAll(assets, concurrency = 3, protectedAssets = assets) {
    const queue = [...assets];
    this.setProtectedAssets(protectedAssets);
    const resolved = new Map();
    const failures = [];
    const workers = Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, async () => {
      while (queue.length) {
        const asset = queue.shift();
        const queuedId = String(asset?.versionId ?? asset?.mediaVersionId ?? asset?.id ?? asset?.assetId ?? "unknown");
        // A newer snapshot may supersede this background ingest while workers
        // are draining the old queue.
        if (!this.protectedIds.has(queuedId)) continue;
        try {
          const result = await this.resolve(asset);
          resolved.set(result.mediaVersionId, result);
        } catch (error) {
          failures.push({
            mediaVersionId: String(asset?.versionId ?? asset?.mediaVersionId ?? asset?.id ?? "unknown"),
            assetId: asset?.assetId ? String(asset.assetId) : null,
            error
          });
        }
      }
    });
    await Promise.all(workers);
    return { resolved, failures };
  }

  stats() {
    const entries = Object.values(this.manifest.assets);
    return {
      assets: entries.length,
      bytes: entries.reduce((total, entry) => total + Number(entry.bytes || 0), 0),
      maxBytes: this.maxCacheBytes,
      reservedBytes: [...this.reservations.values()].reduce((total, bytes) => total + bytes, 0),
      inflight: this.inflight.size
    };
  }

  close() {
    for (const controller of this.downloadControllers.values()) controller.abort(new Error("Broadcast agent is stopping"));
  }

  async #cleanupOrphans() {
    const cacheRoot = path.join(this.directory, "neusecast");
    await mkdir(cacheRoot, { recursive: true });
    const known = new Set(Object.values(this.manifest.assets).map((entry) => path.resolve(String(entry.filename ?? ""))));
    let entriesChanged = false;
    for (const [id, entry] of Object.entries(this.manifest.assets)) {
      if (!await exists(String(entry.filename ?? ""))) {
        delete this.manifest.assets[id];
        entriesChanged = true;
      }
    }
    for (const entry of await readdir(cacheRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const filename = path.resolve(cacheRoot, entry.name);
      const isPartial = entry.name.endsWith(".part");
      const isUntrackedAgentFile = /^[a-f0-9]{20}\.[A-Za-z0-9]+$/.test(entry.name) && !known.has(filename);
      if (isPartial || isUntrackedAgentFile) await unlink(filename);
    }
    if (entriesChanged) await atomicWriteJson(this.manifestFile, this.manifest);
  }

  #withCacheLock(operation) {
    const task = this.cacheLock.then(operation, operation);
    this.cacheLock = task.catch(() => undefined);
    return task;
  }

  #reserve(id, bytes) {
    return this.#withCacheLock(async () => {
      const cacheRoot = path.resolve(this.directory, "neusecast");
      let used = Object.values(this.manifest.assets).reduce((total, entry) => total + Number(entry.bytes || 0), 0)
        + [...this.reservations.entries()].reduce((total, [reservedId, amount]) => total + (reservedId === id ? 0 : amount), 0);
      const candidates = Object.entries(this.manifest.assets)
        .filter(([candidateId]) => candidateId !== id && !this.protectedIds.has(candidateId) && !this.inflight.has(candidateId))
        .sort(([, left], [, right]) => String(left.lastAccessedAt ?? left.cachedAt ?? "").localeCompare(String(right.lastAccessedAt ?? right.cachedAt ?? "")));
      let changed = false;
      for (const [candidateId, entry] of candidates) {
        if (used + bytes <= this.maxCacheBytes) break;
        const filename = path.resolve(String(entry.filename ?? ""));
        if (filename === cacheRoot || !filename.startsWith(`${cacheRoot}${path.sep}`)) {
          delete this.manifest.assets[candidateId];
          changed = true;
          continue;
        }
        await unlink(filename).catch((error) => {
          if (error?.code !== "ENOENT") throw error;
        });
        used -= Number(entry.bytes || 0);
        delete this.manifest.assets[candidateId];
        changed = true;
      }
      if (used + bytes > this.maxCacheBytes) {
        if (changed) await atomicWriteJson(this.manifestFile, this.manifest);
        throw new MediaCacheError(
          `Media cache capacity is exhausted; ${bytes} bytes cannot fit within MEDIA_CACHE_MAX_BYTES`,
          { retryable: true }
        );
      }
      this.reservations.set(id, bytes);
      if (changed) await atomicWriteJson(this.manifestFile, this.manifest);
    });
  }

  #commit(id, entry) {
    return this.#withCacheLock(async () => {
      this.manifest.assets[id] = entry;
      this.reservations.delete(id);
      await atomicWriteJson(this.manifestFile, this.manifest);
    });
  }

  #release(id) {
    return this.#withCacheLock(async () => {
      this.reservations.delete(id);
    });
  }
}

function mimeTypeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  return ({
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mxf": "application/mxf", ".mkv": "video/x-matroska", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".wav": "audio/wav", ".mp3": "audio/mpeg"
  })[extension] ?? "application/octet-stream";
}
