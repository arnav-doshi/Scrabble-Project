# Quick start

Get the game running in about 5 minutes.

## 1. Install backend dependencies

```bash
cd backend
npm install
```

## 2. Start the backend

```bash
cd backend
npm start
```

You should see: `Server running on http://localhost:3000`

## 3. Start the frontend

Open a new terminal window:

```bash
cd frontend
python3 -m http.server 8080
```

## 4. Play

**First browser window:**
1. Go to `http://localhost:8080`
2. Click "Create Game"
3. Copy the game code

**Second browser window (incognito):**
1. Go to `http://localhost:8080`
2. Click "Join Game"
3. Paste the game code and join

Moves sync instantly.

---

## Troubleshooting

**Port 3000 already in use:**
```bash
lsof -i :3000   # find the process
kill -9 <PID>   # kill it
npm start       # restart
```

**Frontend won't connect:**
- Make sure the backend is running on port 3000
- Check the browser console for WebSocket errors
- Try refreshing

**Tiles not showing:**
- Refresh both windows
- Check backend logs for errors
- Make sure both windows are using the same game code

**Chat not working:**
- Wait a second after joining, then try again
- Check the console for Socket.io errors

---

## Further reading

- [SETUP.md](SETUP.md) — configuring Supabase for persistent storage
- [SETUP-SOCKETIO.md](SETUP-SOCKETIO.md) — detailed setup walkthrough
- [ARCHITECTURE-COMPARISON.md](ARCHITECTURE-COMPARISON.md) — why Socket.io over pure Supabase