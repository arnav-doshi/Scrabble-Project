# Architecture Comparison

We started with pure Supabase and switched to Socket.io + Node.js. Here's why, and what changed.

---

## The two architectures

**Old (pure Supabase):**
```
Player A ──► Supabase DB ──► Player B
         (writes)      (reads via realtime)
```

**New (Socket.io + Node.js):**
```
Player A ◄──Socket.io──► Node.js Server ◄──Socket.io──► Player B
                         (in-memory state)
                              ↓
                         Supabase
                    (periodic saves)
```

---

## Head-to-head

| | Pure Supabase | Socket.io + Node.js |
|---|---|---|
| Latency | 100–300ms | <50ms |
| Game state lives in | Database | Server memory |
| DB writes per move | 3–4 | ~0 (periodic only) |
| Move validation | Client-side | Server-side |
| Cheat-proof | No | Yes |
| Scalability | Limited | High |
| Setup | Easy | Medium |
| Cost at scale | Higher | Lower |
| Crash recovery | Built-in | You handle it |

---

## Why Socket.io wins for games

**Speed** — Supabase has to write to the DB, fire a trigger, and notify the client. Socket.io skips all of that:

```javascript
// Supabase: write → trigger → notify → read ≈ 200ms
await supabase.update(...)

// Socket.io: emit → receive ≈ 50ms
socket.emit('move', data)
```

**Security** — with Supabase, the client calculates points. With Socket.io, the server does:

```javascript
// Supabase: client can send whatever score it wants
calculatePoints() // ← cheatable
await supabase.update({ score: cheatedScore })

// Socket.io: server calculates, client just sends the move
socket.on('submit-move', (data) => {
  const points = server.calculatePoints(data) // ← not cheatable
  io.emit('update', game)
})
```

**DB efficiency** — every tile placement, undo, and resubmission hits Supabase separately. With Socket.io, all of that happens in memory and only gets written periodically:

```
Pure Supabase:  place → write, undo → write, place → write, submit → write  (4 writes)
Socket.io:      place → memory, undo → memory, place → memory, submit → 1 write
```

---

## Performance in numbers

**Move latency:**
```
Pure Supabase:  submit → DB (50ms) → process (30ms) → notify (50ms) → render (70ms) ≈ 200ms
Socket.io:      submit → server (10ms) → validate (5ms) → emit (15ms) → render (20ms) ≈ 50ms
```

**At 100 concurrent games:**
```
Pure Supabase:  ~400 DB writes/min, realtime subscription costs, potential rate limiting
Socket.io:      ~10 DB writes/min, no subscriptions, no rate limiting
```

---

## What changed in the codebase

**Removed:**
- `frontend/config.js` — no longer needed
- `frontend/gameService.js` — replaced by `socketService.js`
- `frontend/realtimeService.js` — replaced by Socket.io events
- `frontend/game-backend.js` — replaced by `game-socketio.js`

**Added:**
- `backend/server.js` — Socket.io server
- `backend/gameLogic.js` — server-side game state
- `backend/package.json` — Node.js dependencies
- `frontend/socketService.js` — Socket.io client wrapper
- `frontend/game-socketio.js` — game client

**Simplified:**
- `backend/database-schema.sql` — down from 4 tables to 2

---

## When to use each

**Pure Supabase makes sense when:**
- you're prototyping or learning
- the game is simple and turn pressure doesn't matter
- you want the easiest possible deployment
- you have very few concurrent players
- security isn't a concern

**Socket.io + Node.js makes sense when:**
- real-time responsiveness matters
- you need server-side validation
- you're expecting real traffic
- you want something portfolio-worthy

---

## Cost estimate at scale (100 concurrent games)

```
Pure Supabase:       ~$25–50/month
Socket.io + Supabase: ~$7–15/month (server) + free Supabase tier
```

Roughly 50–70% cheaper at scale, mostly because you're barely touching the database.

---

## What this project demonstrates

Switching to this architecture means you've actually implemented:

- WebSocket communication with Socket.io
- Server-side game state management
- Separation of game logic from persistence
- A Node.js backend
- A real multiplayer architecture pattern

That's not just CS160 stuff — those are skills that show up in production systems.

---

CS160 · Spring 2026