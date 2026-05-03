# Backend setup

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier is fine)
- Your project URL and anon key

---

## 1. Create a Supabase project

Sign in at [supabase.com](https://supabase.com), click "New Project", give it a name (e.g. "scrabble-live"), set a database password, pick a region, and create it. Provisioning takes a couple of minutes.

## 2. Run the database schema

In your Supabase dashboard, go to SQL Editor → New Query. Paste the contents of `database-schema.sql` and run it. This creates four tables:

- `games` — game state, players, scores
- `game_moves` — move history
- `chat_messages` — chat history
- `player_racks` — each player's current tiles

## 3. Get your credentials

Go to Settings → API. You need two values:

- **Project URL** — looks like `https://xxxxx.supabase.co`
- **anon/public key** — a long JWT string

## 4. Configure the app

Open `config.js` and replace the placeholders:

```javascript
const SUPABASE_CONFIG = {
  url: 'https://xxxxx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
```

## 5. Enable realtime (recommended)

Go to Database → Replication in the Supabase dashboard and turn on realtime for these four tables: `games`, `game_moves`, `chat_messages`, `player_racks`. Without this, opponent moves won't appear until the page refreshes.

## 6. Test locally

```bash
python3 -m http.server 8000
```

Open two windows — one normal, one incognito — both pointing to `http://localhost:8000`. Create a game in the first window, join with the room code in the second. Both windows should show the active game.

---

## How it works

**Creating a game** — player 1 enters a username and clicks "Create Game". A game record is created in Supabase with a unique room code, player 1 gets 7 tiles, and the game sits in "waiting" status.

**Joining** — player 2 enters the room code and joins. They get 7 tiles, the game status flips to "active", and both players can now move.

**Making a move** — click a tile from your rack, click a square on the board to place it, then submit. The server calculates points, refills your rack, and passes the turn. The opponent sees the updated board in real-time.

---

## What's implemented

- Create and join games via room codes
- Real-time multiplayer
- Turn management
- Tile drawing and rack refilling
- Score tracking
- Bonus squares (DL, TL, DW, TW)
- 7-tile bingo bonus (+50 points)
- Live chat
- Pass, swap, and undo (before submitting)

## Not yet implemented

- Word validation against a dictionary
- Horizontal/vertical word direction detection
- Cross-word scoring
- Game-end detection
- Blank tile letter selection
- Per-turn timer
- Spectator mode
- Game history/replay

---

## Troubleshooting

**"Game not found"** — check the room code (it's case-sensitive) and verify the game exists in the `games` table in Supabase.

**Realtime not working** — confirm you enabled replication for all four tables in step 5. Check the browser console for errors.

**Tiles not showing** — open the browser console for details. Check that the `player_racks` table has data for your game, then try refreshing.

**"Error loading game"** — verify your URL and anon key in `config.js` and confirm the schema ran successfully.

---

## Deploying

This is a static site, so deploying is straightforward. Push to GitHub, connect the repo to Netlify or Vercel, and deploy — no build steps needed. Make sure `config.js` has your real credentials before you push.

The anon key is safe to include in client-side code — it's designed for that. For a production app, review your Row Level Security policies in Supabase and tighten them as needed.

---

## File structure

```
├── index.html           — lobby (create/join games)
├── game.html            — game board
├── game.js              — original single-player demo
├── game-backend.js      — multiplayer game logic
├── config.js            — Supabase credentials
├── gameService.js       — backend API functions
├── realtimeService.js   — live update handler
├── database-schema.sql  — schema SQL
├── styles.css
└── SETUP.md
```

---

## Further reading

- [Supabase docs](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)