# spindata

Live game data relay service for SpinShare tournaments. Collects real-time score data from players running the [SpinStatus](https://github.com/TakingFire/SpinStatus) mod and makes it available to tournament tooling and stream overlays.

## How it works

Players run a small tray app (the relay client) that bridges SpinStatus on their machine to the spindata server. The server authenticates each player by match token, buffers live data, and exposes it over WebSocket for overlays and over HTTP for the referee bot.

```
SpinStatus (player machine)
    |
relay client (player runs this)
    |
spindata server
    |-- HTTP  :7700  tournament bot polls for final scores
    |-- WS    :7701  relay clients connect (authenticated by token)
    +-- WS    :7702  overlay subscribers (e.g. sssopanel-next)
```

## Server setup

Copy `.env.example` to `.env` and fill in the values.

```
HTTP_PORT=7700
RELAY_PORT=7701
SUBSCRIBE_PORT=7702
REDIS_URL=redis://localhost:6379
```

`REDIS_URL` is optional. Without it the server uses an in-memory store, which works fine but does not survive restarts.

### Docker

```
docker compose up -d
```

This starts spindata and a Redis instance. The image is also built and pushed automatically on every push to `main`.

### Running without Docker

```
npm install
npm start
```

## HTTP API

All endpoints are intended to be called by the tournament bot, not by players directly.

### Register a match

```
POST /match
Content-Type: application/json

{
  "matchId": "match-abc",
  "players": ["alice", "bob"]
}
```

Returns a token for each player:

```json
{
  "matchId": "match-abc",
  "tokens": {
    "alice": "a1b2c3...",
    "bob":   "d4e5f6..."
  }
}
```

Tokens are distributed to players so they can configure the relay client. Re-registering a match ID replaces the old entry and invalidates old tokens.

### Fetch results

```
GET /match/:matchId/results
```

Returns the final score and FC/PFC status for each player who has submitted a result.

```json
{
  "matchId": "match-abc",
  "results": {
    "alice": { "score": 12345, "fc": true,  "pfc": false },
    "bob":   { "score": 11000, "fc": false, "pfc": false }
  }
}
```

### Delete a match

```
DELETE /match/:matchId
```

Removes the match registration and clears all stored data for that match.

## Relay client

The relay client is a system tray app for Windows and Linux. Players download it, paste in the server URL and their token, and click Connect. It runs in the background while they play and forwards score data automatically.

Pre-built binaries (`.exe` and `.AppImage`) are attached to each [release](../../releases).

### Building locally

```
cd relay
npm install
npm start          # run in dev mode
npm run build      # build for current platform
npm run build:win  # cross-compile Windows EXE
npm run build:linux # build Linux AppImage
```

## WebSocket protocol (relay clients)

Relay clients connect to `:7701` with their token as a query parameter:

```
ws://host:7701?token=<token>
```

The relay client forwards raw [SpinStatus](https://github.com/TakingFire/SpinStatus) events verbatim. The server handles all processing.

## WebSocket protocol (subscribers)

Overlays connect to `:7702` with the match ID as a query parameter:

```
ws://host:7702?matchId=<matchId>
```

Subscribers receive all SpinStatus events as they arrive, tagged with `matchId` and `playerId`:

```json
{ "matchId": "match-abc", "playerId": "alice", "type": "scoreEvent",
  "status": { "score": 8000, "combo": 80, "fullCombo": "PerfectPlus" } }

{ "matchId": "match-abc", "playerId": "alice", "type": "noteEvent",
  "status": { "accuracy": "PerfectPlus", "type": "Tap", "color": 0 } }

{ "matchId": "match-abc", "playerId": "alice", "type": "trackStart",
  "status": { "title": "...", "artist": "...", "difficulty": "Expert", "albumArt": "..." } }

{ "matchId": "match-abc", "playerId": "alice", "type": "trackComplete" }
{ "matchId": "match-abc", "playerId": "alice", "type": "trackFail" }
{ "matchId": "match-abc", "playerId": "alice", "type": "trackPause" }
{ "matchId": "match-abc", "playerId": "alice", "type": "trackResume" }
```

After `trackComplete` or `trackFail`, a synthetic `chartEnd` is also emitted for convenience:

```json
{ "matchId": "match-abc", "playerId": "alice", "type": "chartEnd",
  "score": 12345, "fc": true, "pfc": true }
```

FC/PFC is derived from the `fullCombo` field of the last `scoreEvent` before the track ended.

## Development

```
npm test   # run all unit tests (no server or Redis required)
npm run dev
```
