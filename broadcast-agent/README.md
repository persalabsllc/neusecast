# NeuseCast broadcast agent

This directory is the persistent playout side of NeuseCast Broadcast Control. It runs beside CasparCG, consumes a published program log from the NeuseCast web app, caches and validates uploaded media, switches scheduled clips and approved live sources, keeps permanent graphics on air, and reports the actual output state back to the control room.

The web app remains the source of truth. CasparCG and this agent are intentionally not hosted on Vercel: they run continuously on a Linux playout computer or VM.

## Included

- CasparCG Server 2.5.0, pinned to the official Ubuntu 24.04 packages and verified by SHA-256 during the image build.
- AMCP TCP client with command serialization, timeouts, reconnect behavior, and argument injection protection.
- Published-log automation with current-item recovery, next-item preload, deterministic timing, and a generated fallback loop.
- Durable event queue for heartbeat, now-playing, as-run, command acknowledgements, errors, media ingest, and live-source state.
- Versioned media cache with HTTPS-only downloads, optional SHA-256 verification, persistent retries with capped exponential backoff, per-file and aggregate byte limits, safe LRU eviction, and `ffprobe` validation.
- One permanent CasparCG HTML graphics layer for the NeuseCast logo, local conditions, time, and ticker.
- A 1080p30 H.264/stereo AAC local UDP/MPEG-TS handoff plus a supervised FFmpeg relay that reconnects RTMPS or SRT publishing after Cloudflare or WAN failures.
- Local `/healthz` and `/readyz` endpoints bound to `127.0.0.1` by Docker Compose.

The precise web API is documented in [docs/api-contract.md](docs/api-contract.md).

## First start

Requirements: Docker Engine with Compose v2, an x86-64 Linux host with AVX2, an OpenGL 4.5-capable GPU exposed to the container, accurate NTP/chrony time synchronization, and enough local disk for the media library. Four CPU cores, 8 GB RAM, wired Ethernet, and SSD storage are sensible minimums for one 1080p30 H.264 output, but they do not replace the GPU requirement.

The base Compose file can use Mesa software rendering for setup validation and null-output testing only. It is not a supported 24/7 production renderer. For Intel/AMD, set `RENDER_GROUP_ID` and merge the provided device override:

```bash
export RENDER_GROUP_ID=$(stat -c '%g' /dev/dri/renderD128)
docker compose -f docker-compose.yml -f docker-compose.gpu.example.yml up -d --build
```

NVIDIA hosts need the NVIDIA Container Toolkit and a host-specific GPU reservation instead. Confirm OpenGL 4.5 inside the final CasparCG container before going on air.

```bash
cd broadcast-agent
cp .env.example .env
```

Set these values in `.env`:

```dotenv
NEUSECAST_BASE_URL=https://neusecast.com
BROADCAST_AGENT_SECRET=<the same long secret configured in the web app>
BROADCAST_OUTPUT_KEY=main
BROADCAST_AGENT_ID=neusecast-playout-01
```

`BROADCAST_AGENT_ID` is the stable `broadcast_agents.agent_key`, not a database UUID. The AMCP port and health endpoint are exposed to localhost only.

Start the stack:

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8787/healthz
```

With `STREAM_OUTPUT_URL` empty, CasparCG still renders its local UDP program feed and the relay drains that feed to FFmpeg's null output. Broadcast Control can upload, validate, schedule, preload, play, display now/next, and collect as-run events without publishing a public stream.

## Connect Cloudflare

Create a Cloudflare Stream Live Input, then place its complete secret ingest URL in `.env`. Never commit this file.

RTMPS example:

```dotenv
STREAM_PROTOCOL=rtmps
STREAM_OUTPUT_URL=rtmps://<cloudflare-ingest-host>:443/live/<secret-stream-key>
```

SRT example (use the complete URL and query string supplied by Cloudflare):

```dotenv
STREAM_PROTOCOL=srt
STREAM_OUTPUT_URL=srt://<cloudflare-ingest-host>:<port>?streamid=<id>&passphrase=<secret>
```

Recreate the relay and CasparCG together to activate or change the output. Recreating both also refreshes CasparCG's resolved address for the relay container:

```bash
docker compose up -d --force-recreate stream-relay casparcg
```

The Cloudflare HLS playback URL belongs in the website/Roku delivery configuration; it is different from this secret ingest URL.

The relay uses a 15-second output I/O timeout and restarts FFmpeg with capped exponential delay if the ingest connection fails or becomes half-open. Relay logs intentionally contain only generic exit/retry messages, never the secret output URL. `docker compose ps` confirms that the relay process is active; Cloudflare's Live Input status and the resulting HLS playback are the authoritative checks that Cloudflare actually accepted the stream.

Compose caps each container's JSON logs at five 10 MB files, disables CasparCG's duplicate internal file log, and bounds its disposable HTML/CEF cache in a 512 MB tmpfs, so routine 24/7 logging and template cache growth cannot fill the host disk. Recent agent heartbeats are retained for seven days by the broadcast cron; as-run records are not pruned.

## Upload-to-air behavior

1. Broadcast Control returns pending `mediaVersions` or `ingestQueue` entries in the agent snapshot.
2. The agent downloads a signed HTTPS URL into the media volume shared with CasparCG.
3. It verifies the optional checksum and uses `ffprobe` to require valid video, image, or audio streams. Video/images report dimensions; timed video/audio must report a duration.
4. It reports `media_ready` with technical metadata or `media_failed` with the validation error.
5. A published log item is played only when its exact media version is locally available. Missing media produces the branded fallback instead of black output.

Snapshot and graphics changes are applied before downloads begin, so a large background transfer cannot delay an output stop, emergency ticker, new log, or source update. Transient network failures retry indefinitely by default using persistent exponential backoff capped at `MEDIA_INGEST_RETRY_MAX_MS`; the API leaves those versions in `processing`. Set `MEDIA_INGEST_MAX_ATTEMPTS` to a nonzero value only when an installation intentionally wants exhausted transport retries to become terminal. Deterministic checksum, probe, and unsupported-media failures are always terminal.

`MEDIA_MAX_FILE_BYTES` limits one download. `MEDIA_CACHE_MAX_BYTES` limits the complete local playout cache. When space is needed, the agent removes the least-recently-used local copies that are not referenced by the latest snapshot; current/scheduled/backoff media and in-flight downloads remain protected. The masters remain in cloud storage and can be downloaded again. Interrupted `.part` files and untracked agent cache files are cleaned at startup.

## Live sources

Live sources are registered in Broadcast Control and arrive in the snapshot. A command references a source ID; it cannot send arbitrary AMCP text. The agent probes sources on startup and periodically, then reports `connecting`, `ready`, `offline`, or `error` before Studio permits a take. Supported inputs are:

- SRT, RTMP/RTMPS, and RTSP stream URLs (HTTP/HTTPS and UDP remain accepted for legacy API records).
- A local DeckLink input by numeric device index from 1 to 64. This additionally requires Blackmagic's host driver/SDK libraries and a host-specific Compose device mapping, which are not portable enough to ship in the base Compose file. Configuration can be validated automatically; actual DeckLink signal lock is confirmed when Caspar takes the source.
- A built-in solid-color test source for wiring checks.

NDI and WebRTC are intentionally not accepted by this agent. Bridge them through OBS/MediaMTX into SRT or RTMP. Source recording is also not advertised or performed; archive recording needs a separate storage, retention, and failure-policy design.

DeckLink is not plug-and-play in the base Compose file. A production DeckLink host needs Blackmagic Desktop Video installed plus a host-specific Compose override that mounts `libDeckLinkAPI.so` and the required `/dev/blackmagic/*` device nodes into the CasparCG container. Validate the exact card and video mode on the target host before offering it as a ready source.

If a source has `credentialSecretRef: "env:STUDIO_CAMERA_SOURCE_URL"`, the named environment variable must contain the complete secret source URL. The database then stores only the non-secret endpoint/reference. The agent redacts that URL from its own AMCP errors and events; CasparCG logs and the playout host must still be treated as credential-sensitive.

`take_live` only puts a locally `ready` registered source on the program layer and records the interruption. `return_to_automation` joins the program-log item that should be playing at that moment. Periodic `ffprobe` checks provide pre-take readiness. An operator may opt a source into the on-air watchdog with **Automatic on-air failover**; after its reconnect timeout, confirmed probe loss returns to scheduled automation. This is off by default because the watchdog opens a second connection and could falsely fail a single-client RTSP/SRT endpoint. Enable it only for OBS, MediaMTX, or another source known to permit concurrent health checks.

An output whose snapshot has `enabled: false` is cleared and remains disabled: it will not schedule media, take a live source, or render overlays. `start_output` reenables local playout while the following snapshot confirms the persisted control-room state.

When `alwaysOn` is true, the branded fallback fills every unscheduled gap. When it is false, the program and graphics layers clear to standby during gaps. After a real CasparCG disconnect/restart, the agent rejoins the correct scheduled item (or fallback) and reasserts a disabled clear. The last valid snapshot is stored in the agent-state volume so a restart during a control-plane outage can restore the last known enabled/always-on policy; first boot still requires one successful snapshot.

Operator commands use a durable intent/result journal keyed by command ID and idempotency key. The intent is written before AMCP side effects. If the process dies in the unavoidable gap between the side effect and its completed record, recovery uses at-most-once semantics: it marks the outcome unknown and does not replay a potentially destructive `skip`/`take`; an operator can issue a new action after inspecting program. Persisted acknowledgements are flushed before command polling. Permanently invalid event records are moved to `events-dead-letter.json` so they cannot block later heartbeats and acknowledgements; authentication failures are never discarded.

Start/stop commands also persist the server-issued `desiredControlRevision` barrier and the complete local `enabled`/`alwaysOn` target before touching AMCP. Snapshots with an older `output.controlRevision` cannot undo the operator's action; an equal or newer server revision is authoritative and clears the override, including a later opposite action whose command was missed while the agent was offline. Delayed output commands at or below the latest applied barrier are ignored.

## Operations

```bash
docker compose logs -f broadcast-agent casparcg stream-relay
docker compose restart broadcast-agent
docker compose down
```

Do not publish TCP 5250 to the internet. The Compose configuration restricts it to localhost; the agent reaches it through the private Docker network.

`/healthz`, `/readyz`, and Docker health checks cover processes and AMCP connectivity. They are not end-to-end stream assurance. Production operations must also monitor the Cloudflare Live Input and public HLS manifest from an external network.

Run the focused unit tests without Docker:

```bash
npm test
npm run check
```
