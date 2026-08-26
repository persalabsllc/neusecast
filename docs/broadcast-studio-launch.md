# NeuseCast Broadcast Studio launch runbook

## What is already wired

```mermaid
flowchart TD
  Studio["NeuseCast Studio\nVercel + Neon + Blob"] -->|"published log + commands"| Agent["Persistent playout agent"]
  Agent -->|"AMCP on private Docker network"| Caspar["CasparCG 2.5"]
  Caspar -->|"local UDP/MPEG-TS"| Relay["Supervised stream relay"]
  Relay -->|"RTMPS or SRT"| Cloudflare["Cloudflare Stream Live Input"]
  Cloudflare -->|"adaptive HLS"| Watch["neusecast.com/watch"]
  Agent -->|"heartbeat + as-run + ingest results"| Studio
```

- Studio owns metadata, uploads, clocks, daily logs, graphics, ticker entries, live-source definitions, command intent, and audit history.
- The playout agent owns the local media cache, `ffprobe` validation, precise timing, AMCP commands, reconnects, and durable event delivery.
- CasparCG owns frame production, audio/video mixing, HTML graphics, and the encoded local program feed.
- The stream relay owns the WAN connection and restarts FFmpeg after an RTMPS/SRT timeout or disconnect without disturbing on-air automation.
- Cloudflare owns public adaptive delivery. The public site keeps its current virtual-linear player until the HLS environment variable is set.

## 1. Deploy the control plane

The production build applies `drizzle/0011_broadcast_control.sql` transactionally. It creates the broadcast tables and installs a disabled `main` output, its assigned playout agent record, and persistent NeuseCast logo, Eastern time, regional weather, and ticker layers.

Set these Vercel variables:

```dotenv
BLOB_READ_WRITE_TOKEN=<Vercel Blob read/write token>
BROADCAST_AGENT_SECRET=<at least 32 random bytes; use the same value on the playout host>
BROADCAST_CLOUDFLARE_CONFIGURED=false
NEXT_PUBLIC_BROADCAST_HLS_URL=
```

Keep `CRON_SECRET` configured. `/api/cron/broadcast` refreshes verified NWS weather/warnings and approved published Newsroom tickers every 15 minutes.

Use Vercel Pro or Enterprise for production. Hobby projects permit only daily cron schedules and cannot deploy this repository's hourly/15-minute automation cadence unchanged.

## 2. Prepare the persistent playout host

Use a wired, AVX2-capable x86-64 Linux host with SSD storage and a GPU/OpenGL 4.5 path appropriate for CasparCG. GPU device/runtime configuration differs by host and must be completed before an on-air acceptance test.

Keep the host clock synchronized with chrony or `systemd-timesyncd`; wall-clock playout, log joins, and as-run timestamps depend on accurate system time.

```bash
cd broadcast-agent
cp .env.example .env
```

Minimum edits:

```dotenv
NEUSECAST_BASE_URL=https://neusecast.com
BROADCAST_AGENT_SECRET=<same value as Vercel>
BROADCAST_OUTPUT_KEY=main
BROADCAST_AGENT_ID=neusecast-playout-01
STREAM_OUTPUT_URL=
```

Start without a public destination first:

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8787/healthz
curl --fail http://127.0.0.1:8787/readyz
```

TCP 5250 and the agent health port bind to `127.0.0.1`. Do not publish AMCP to the internet.

## 3. Validate upload-to-air before Cloudflare

1. Open `/studio/library` and upload a short 1080p test clip.
2. Wait for the playout agent to change it from **Processing** to **Ready**. A failed file retains its technical error in Studio.
3. Open `/studio/logs`, create today’s log, and run **Auto schedule**.
4. Review the order and publish it.
5. Enable the main output in `/studio/settings` and confirm the program/preview state, agent heartbeat, and now/next information.
6. Inspect `docker compose logs -f broadcast-agent casparcg stream-relay` during this first test.

Published events pin the exact media version. Drag/drop changes are limited to drafts and use a revision check so another operator or generator cannot silently overwrite the log.

## 4. Connect Cloudflare Stream

Create one recurring Cloudflare Stream Live Input. Use the Live Input ID for a permanent channel page. Copy the complete secret ingest URL to the playout host only:

```dotenv
STREAM_PROTOCOL=rtmps
STREAM_OUTPUT_URL=rtmps://<ingest-host>:443/live/<secret-key>
```

SRT is also supported:

```dotenv
STREAM_PROTOCOL=srt
STREAM_OUTPUT_URL=srt://<ingest-host>:<port>?streamid=<id>&passphrase=<secret>
```

Apply the relay change. Recreate the relay and CasparCG together so CasparCG also refreshes the relay container address:

```bash
docker compose up -d --force-recreate stream-relay casparcg
```

The supplied encoder profile is 1080p30 H.264/AAC stereo at 6 Mbps CBR with a two-second GOP. CasparCG sends that program to a local UDP relay; the relay uses bounded output I/O and reconnects after Cloudflare or WAN failures. Confirm stable ingest in Cloudflare metrics, then copy the public HLS manifest—not the ingest key—to Vercel:

```dotenv
NEXT_PUBLIC_BROADCAST_HLS_URL=https://customer-<code>.cloudflarestream.com/<live-input-id>/manifest/video.m3u8
BROADCAST_CLOUDFLARE_CONFIGURED=true
```

Redeploy the web app and verify `/watch` in Safari and a Chromium browser. The same stable HLS URL is the future Roku playback URL.

The local health endpoints prove that the agent and AMCP are responsive; they do not prove that Cloudflare is receiving frames or that public HLS is advancing. Before unattended launch, monitor the Cloudflare Live Input plus the public manifest from outside the playout network and alert on a stalled/offline feed. Include a forced WAN disconnect and Caspar restart in the acceptance test.

## 5. Add live cameras later

Use the smallest contribution path that matches the source:

| Source | Preferred path into CasparCG |
| --- | --- |
| One studio camera or switched show | HDMI capture into OBS; OBS sends SRT/RTMP to a registered live input |
| Existing IP camera | RTSP locally, preferably restreamed through MediaMTX as SRT for the playout host |
| Remote phone/reporter | WebRTC contribution service or remote OBS; deliver one stable SRT feed to playout |
| SDI camera on the playout machine | DeckLink source by device number |

DeckLink is a host-specific extension: install the matching Blackmagic Linux driver/SDK and expose its device nodes/libraries to the CasparCG container before registering it. The supplied base Compose stack is ready for network/test inputs but does not guess that hardware mapping.

For a credentialed feed, add a source in Studio with a reference such as `env:STUDIO_CAMERA_1_URL`, then define the complete URL only in `broadcast-agent/.env`:

```dotenv
STUDIO_CAMERA_1_URL=rtsp://user:password@camera-address/stream
```

Use **Take Live** only after the source reports ready. **Return to automation** rejoins the item that should be airing at that wall-clock moment. The optional **Automatic on-air failover** watchdog opens a second probe connection and should be enabled only for OBS, MediaMTX, or another contribution feed known to permit concurrent clients; leave it off for a single-client camera endpoint. Keep the current program log published and verify the built-in branded fallback before every live production.

## Acceptance checklist

- [ ] Blob upload completes directly from the browser and a video becomes air-ready after agent validation.
- [ ] A published log is received by the agent and starts at the correct Eastern wall-clock time.
- [ ] Logo, time, weather, and ticker remain visible; each toggle removes only its own layer.
- [ ] Start, stop, take, skip, and return-to-automation commands acknowledge in Studio.
- [ ] Killing the internet retains a branded local fallback and queues telemetry for later delivery.
- [ ] AMCP is not reachable from another machine.
- [ ] Cloudflare ingest holds a stable two-second keyframe interval and the public HLS URL plays on `/watch`.
- [ ] External monitoring detects a stopped/stalled Cloudflare input or HLS manifest and alerts an operator.
- [ ] An as-run event is retained for each started/completed/skipped/failed item.
