# Architecture

## Overview

ScrabbleLive uses a three-tier architecture: a Socket.io/Node.js server handles all real-time communication and game logic, Supabase (PostgreSQL) handles persistence, and the frontend is plain HTML/CSS/JavaScript with no build step.

```
Player A ◄──Socket.io──► Node.js Server ◄──Socket.io──► Player B
                         (in-memory state)
                              ↓
                         Supabase
                    (periodic saves)
```

---

## Why this stack

The core decision was to keep game state in server memory rather than in the database. Every move goes through the Node server, which validates it and broadcasts the result to both players over WebSockets. Supabase only gets written to periodically — not on every action — which keeps latency low and database costs minimal.

The alternative (pure Supabase Realtime) routes every move through the database: write → trigger → notify → read. That works for simple apps but adds 100–300ms of latency per move and means the client is responsible for validating moves, which makes cheating trivial.

---

## Components

### Node.js server (`backend/server.js`)

The server is the source of truth for all active games. It owns:

- Room management — creating games, matching players by room code
- Game state — board, racks, tile bag, scores, whose turn it is
- Move validation — every submitted move is checked server-side before being accepted
- Broadcasting — after a valid move, the updated state is emitted to both players

Game state lives in memory for the duration of a session. This makes reads and writes fast (no round-trip to the DB) at the cost of losing in-progress games if the server restarts.

### Game logic (`backend/gameLogic.js`)

Isolated module that handles everything rules-related:

- Tile distribution and drawing from the bag
- Placing and validating tile positions
- Calculating scores including bonus squares (DL, TL, DW, TW) and the 7-tile bingo bonus
- Turn transitions

Keeping this separate from the server makes it easier to test and reason about.

### Supabase (`backend/database-schema.sql`)

Used for persistence only, not for real-time communication. The schema has two tables:

- `games` — game metadata, final board state, scores, status
- `chat_messages` — chat history per game

The server upserts to Supabase after each move in the background. This enables game history and is the foundation for future features like leaderboards and replays — but it's never in the critical path of a move.

### Frontend (`frontend/`)

Vanilla HTML, CSS, and JavaScript — no framework, no build step. Three main files:

- `socketService.js` — wraps the Socket.io client, handles connection and reconnection
- `game-socketio.js` — game UI logic: rendering the board, managing the rack, handling user input
- `index.html` / `game.html` — lobby and game board pages

The frontend is purely a view. It sends player actions to the server and re-renders whatever state the server sends back. It does no validation of its own.

---

## Data flow

**Creating a game:**
1. Player A emits `create-game` with their username
2. Server creates a game object in memory, generates a room code, deals 7 tiles
3. Server emits `game-created` back to Player A with the room code and initial state

**Joining a game:**
1. Player B emits `join-game` with the room code
2. Server finds the game in memory, deals 7 tiles to Player B, marks the game active
3. Server emits `game-started` to both players

**Making a move:**
1. Player emits `submit-move` with the tiles placed
2. Server validates the move (position, tile ownership, turn order)
3. On success: server updates in-memory state, emits `game-updated` to both players and `rack-update` to the moving player
4. In the background: server upserts the new game state to Supabase
5. On failure: server emits an error only to the player who submitted

**Chat:**
1. Player emits `chat-message`
2. Server broadcasts it to both players immediately
3. Server saves it to Supabase asynchronously

---

## Socket events

| Direction | Event | Description |
|---|---|---|
| Client → Server | `create-game` | Create a new game |
| Client → Server | `join-game` | Join by room code |
| Client → Server | `submit-move` | Submit placed tiles |
| Client → Server | `pass-turn` | Pass without placing |
| Client → Server | `swap-tiles` | Swap tiles with the bag |
| Client → Server | `chat-message` | Send a chat message |
| Server → Client | `game-created` | Confirms game creation, returns room code |
| Server → Client | `game-started` | Both players connected, game is live |
| Server → Client | `game-updated` | New board state after a move |
| Server → Client | `rack-update` | Updated tiles for the moving player |
| Server → Client | `chat-message` | Incoming chat message |
| Server → Client | `player-disconnected` | Opponent left the game |

---

## Performance characteristics

| Metric | Value |
|---|---|
| Move latency | <50ms |
| DB writes per move | ~1 (async, background) |
| Concurrent games supported | 100+ |
| Game state storage | Server memory |

---

## Known limitations

- **No crash recovery** — if the server restarts, in-progress games are lost. The last persisted state is in Supabase but reconnection logic isn't implemented yet.
- **No word validation** — the server checks tile placement rules but doesn't verify words against a dictionary.
- **Single server** — the in-memory state design means the app can't be horizontally scaled without adding a shared state layer (e.g. Redis). Fine for a class project, worth noting for production.

---

## Future work

- Reconnection handling after disconnect or server restart
- Dictionary API integration for word validation
- Spectator mode
- Per-turn timer
- Leaderboards (Supabase already stores the data)
- Game history and replay
- Mobile-responsive UI