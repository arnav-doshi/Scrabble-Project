# Setup guide

## Prerequisites

- Node.js v16+ — [nodejs.org](https://nodejs.org)
- A Supabase account (free tier works) — [supabase.com](https://supabase.com)

---

## 1. Install backend dependencies

```bash
cd backend
npm install
```

This pulls in Express, Socket.io, the Supabase client, cors, and dotenv.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
PORT=3000
NODE_ENV=development
```

To find your Supabase credentials: open your project dashboard → Settings → API → copy the Project URL and anon/public key.

## 3. Set up the database

In the Supabase dashboard, go to SQL Editor, paste the contents of `backend/database-schema.sql`, and run it. This creates the `games` and `chat_messages` tables.

## 4. Start the backend

```bash
cd backend
npm start

# or with auto-reload during development:
npm run dev
```

You should see:
```
ScrabbleLive server running on port 3000
Socket.io enabled for real-time gameplay
```

## 5. Configure the frontend

In `frontend/socketService.js`, line 4, set the server URL:

```javascript
this.serverUrl = 'http://localhost:3000'; // development
// this.serverUrl = 'https://your-server.com'; // production
```

## 6. Start the frontend

```bash
cd frontend
python3 -m http.server 8080
```

Open `http://localhost:8080`.

---

## Testing multiplayer locally

1. Open `http://localhost:8080`, enter a username, click "Create Game", and note the room code.
2. Open a second window in incognito, go to the same URL, enter a different username, paste the room code, and join.
3. Both windows should be in the game. Moves sync in under 50ms.

---

## How it works

**Creating a game** — the frontend emits `create-game`, the server creates a game in memory and responds with a room code. Nothing is written to the database yet.

**Joining** — the second player emits `join-game` with the room code. The server broadcasts `game-started` to both players with the full game state.

**Making a move** — the player emits `submit-move`. The server validates it, updates the in-memory state, and broadcasts `game-updated` to both players. No database write happens here — that comes periodically.

**Persistence** — after each move, the server upserts the game state to Supabase in the background. This enables game history and crash recovery without slowing down gameplay.

---

## Project structure

```
├── backend/
│   ├── server.js           — Socket.io server
│   ├── gameLogic.js        — game state & validation
│   ├── package.json        — dependencies
│   ├── database-schema.sql — Supabase schema
│   ├── .env.example        — config template
│   └── .env                — your config (gitignored)
│
├── frontend/
│   ├── index.html          — lobby
│   ├── game.html           — game board
│   ├── socketService.js    — Socket.io client
│   ├── game-socketio.js    — game logic
│   └── styles.css
```

---

## Troubleshooting

**"Cannot connect to server"** — make sure the backend is running and that the port in `.env` matches the URL in `socketService.js`.

**"Game not found"** — double-check the room code (it's case-sensitive). If the server restarted, in-memory games are lost and you'll need to create a new one.

**Moves not syncing** — check the browser console for Socket.io errors. You can verify the connection state with `socketService.connected`.

**Backend crashes on startup** — confirm your `.env` has valid Supabase credentials and that you've run `npm install`. Check your Node version with `node --version` (need v16+).

---

## Deploying

**Backend** — Render and Railway both detect Node.js automatically. Push your repo, set the environment variables in the dashboard, and deploy. For Heroku, add a `Procfile` with `web: node backend/server.js`.

**Frontend** — deploy the `frontend/` directory to Netlify or Vercel (no build step needed). Update the server URL in `socketService.js` to your production backend URL before deploying.

---

## Further reading

- [Socket.io docs](https://socket.io/docs/)
- [Supabase docs](https://supabase.com/docs)
- [ARCHITECTURE.md](ARCHITECTURE.md) — why Socket.io over pure Supabase