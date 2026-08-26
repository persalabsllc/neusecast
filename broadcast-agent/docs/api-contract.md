# Broadcast agent API contract

All requests use:

```http
Authorization: Bearer <BROADCAST_AGENT_SECRET>
X-Neusecast-Agent-Id: <stable broadcast_agents.agent_key>
Accept: application/json
```

The current schema version is `1`. Unknown additive fields are ignored. Timestamps are ISO 8601 UTC strings. IDs are opaque strings.

## Snapshot

`GET /api/broadcast/agent/snapshot?outputKey=<key>`

The agent sends `If-None-Match` after the first response and accepts `304 Not Modified`.

```json
{
  "ok": true,
  "schemaVersion": 1,
  "serverTime": "2026-08-26T16:00:05.000Z",
  "pollAfterMs": 5000,
  "agent": { "id": "uuid", "key": "neusecast-playout-01", "name": "Main playout" },
  "output": {
    "id": "uuid",
    "key": "main",
    "name": "NeuseCast",
    "status": "live",
    "enabled": true,
    "alwaysOn": true,
    "controlRevision": 12,
    "caspar": {
      "channel": 1,
      "width": 1920,
      "height": 1080,
      "frameRateNumerator": 30,
      "frameRateDenominator": 1,
      "audioSampleRate": 48000
    },
    "overlayConfig": {
      "showLogo": true,
      "showWeather": true,
      "showClock": true,
      "timeZone": "America/New_York"
    }
  },
  "log": {
    "id": "uuid",
    "revision": 4,
    "timeZone": "America/New_York",
    "startsAt": "2026-08-26T16:00:00.000Z",
    "endsAt": "2026-08-27T16:00:00.000Z",
    "publishedAt": "2026-08-26T15:55:00.000Z",
    "items": [
      {
        "id": "uuid",
        "plannedStartAt": "2026-08-26T16:00:00.000Z",
        "plannedEndAt": "2026-08-26T16:05:00.000Z",
        "transition": { "type": "mix", "frames": 12 },
        "overlayPolicy": { "ticker": true, "weather": true, "clock": true },
        "assetId": "uuid",
        "mediaVersionId": "uuid"
      }
    ]
  },
  "assets": [
    {
      "versionId": "uuid",
      "assetId": "uuid",
      "mimeType": "video/mp4",
      "playbackUrl": "https://signed-storage.example/file.mp4",
      "sha256": "64-lowercase-hex-characters"
    }
  ],
  "ingestQueue": [],
  "graphics": [
    { "kind": "weather", "data": { "temperature": "72°", "condition": "Clear", "location": "New Bern" } }
  ],
  "ticker": [
    { "id": "uuid", "message": "Welcome to NeuseCast", "priority": "routine", "status": "active" }
  ],
  "liveSources": [
    {
      "id": "uuid",
      "key": "studio-camera",
      "name": "Studio camera",
      "enabled": true,
      "protocol": "srt",
      "status": "offline",
      "endpointUrl": "srt://private-ingest.example:9000?streamid=studio",
      "credentialSecretRef": null,
      "reconnectTimeoutSeconds": 10,
      "activeAutoFailover": true
    }
  ]
}
```

`log` may be `null`; the agent runs the fallback only when `output.alwaysOn` is true and otherwise clears to standby. Published logs are capped at 3,000 events. Repeated items carry only timing and pinned media IDs; each exact version's download metadata appears once in `assets`. The agent derives duration from the item start/end. This compact form keeps a complete day below the control-plane response limit. `overlayPolicy` accepts the legacy strings `all`, `none`/`clean`, `no_ticker`, `no_weather`, and `no_clock`, or an object with `ticker`, `weather`, `clock`, and `logo` booleans.

The normalized source protocols accepted for new records are `rtmp`, `rtmps`, `srt`, `rtsp`, `decklink`, and `test`. DeckLink `endpointUrl` is an integer string from `1` through `64`. A source credential reference must be `env:VARIABLE_NAME`; that agent environment variable contains the complete secret source URL. `activeAutoFailover` is opt-in because the watchdog opens a second probe connection; enable it only for OBS, MediaMTX, or another contribution endpoint known to permit that. NDI, WebRTC, and automatic source recording are not part of schema version 1 playout.

## Commands

`GET /api/broadcast/agent/commands?outputKey=<key>&after=<last-command-id>`

The first request omits `after`; later requests may send the last command ID for diagnostics. Pending delivery does not filter on that cursor because `notBefore` eligibility can mature out of creation order. Queued/claimed rows are redelivered until their durable acknowledgement makes them terminal, and the agent journal prevents duplicate side effects.

```json
{
  "ok": true,
  "schemaVersion": 1,
  "serverTime": "2026-08-26T16:01:00.000Z",
  "pollAfterMs": 1500,
  "commands": [
    {
      "id": "uuid",
      "type": "take_live",
      "idempotencyKey": "operator-action-uuid",
      "outputId": "uuid",
      "payload": { "liveSourceId": "uuid" },
      "notBefore": null,
      "expiresAt": "2026-08-26T16:02:00.000Z",
      "attempt": 1
    }
  ]
}
```

Supported control-room types are `take_item`, `skip`, `resume_automation`, `start_output`, `stop_output`, `refresh_graphics`, `take_live`, and `remove_live`. The aliases `return_to_automation`, `reload_graphics`, and `refresh_snapshot` are also accepted. `start_output` and `stop_output` carry `{ "desiredEnabled": <boolean>, "desiredAlwaysOn": <boolean>, "desiredControlRevision": <integer> }`; the full target state and revision exactly match the atomically persisted output control revision. The agent rejects older delayed commands and retains that barrier until a snapshot with an equal or newer `output.controlRevision` arrives. A command intent is durably recorded by command ID/idempotency key before the AMCP action; its result and acknowledgement are persisted before the cursor advances. A recovered `running` intent is not replayed: it is acknowledged failed with an unknown-outcome message so an operator can inspect program and issue a new action.

## Events

`POST /api/broadcast/agent/events`

```json
{
  "outputKey": "main",
  "agentId": "neusecast-playout-01",
  "events": [
    {
      "eventId": "uuid",
      "type": "heartbeat",
      "occurredAt": "2026-08-26T16:01:00.000Z",
      "status": "healthy"
    }
  ]
}
```

The server must deduplicate by `eventId` and return any `2xx` JSON response only after accepting the complete batch. The agent retries a failed batch from disk.

### Event fields

| Type | Additional fields |
|---|---|
| `heartbeat` | `status`, `outputStatus`, `casparConnected`, `casparVersion`, `snapshotVersion`, `logVersion`, `currentProgramItemId`, `liveSourceId`, `lastSnapshotAt`, `mediaCache`, `eventBacklog`, `uptimeSeconds`, `agentVersion` |
| `now_playing` | `mode`, `logId`, `programItemId`, `assetId`, `mediaVersionId`, `liveSourceId`, `clipName`, `plannedStartAt`, `plannedEndAt`, `actualStartAt`, `lateByMs`, `reason` |
| `as_run` | `logId`, `programItemId`, `assetId`, `mediaVersionId`, `plannedStartAt`, `plannedEndAt`, `actualStartAt`, `actualEndAt`, `playedDurationMs`, `outcome` |
| `command_ack` | `commandId`, `idempotencyKey`, `status` (`completed`, `failed`, or `ignored`), `message` |
| `error` | `code`, `message`, `retryable`, `context`, and optional related IDs |
| `live_source_status` | `sourceId`, `status` (`disabled`, `offline`, `connecting`, `ready`, `live`, `error`, or legacy `standby`), `errorMessage`, `label`, `takenAt`, `endedAt`, `reason`, `metadata` |
| `media_ready` | `mediaVersionId`, `assetId`, `durationMs`, `width`, `height`, `mimeType`, `videoCodec`, `audioCodec`, `sha256`, `casparClipName` |
| `media_failed` | `mediaVersionId`, `error`, `retryable`, and `technicalMetadata` with attempt/backoff details |

The API may accept additive fields and should treat `now_playing` as current output state while preserving `as_run` as immutable playout history. A retryable `media_failed` must leave the version in `processing` so it remains in `ingestQueue`; only `retryable: false` is terminal. A non-retryable event rejected by the API is isolated and durably quarantined by the agent rather than permanently blocking the FIFO event queue.
