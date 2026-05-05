# Scrabble Project

A realtime, multiplayer Scrabble game built for the CS160 course.

Quick overview:
- Backend: Node.js + Express + Socket.io (optional Supabase for persistence)
- Frontend: plain HTML/JS that connects to the backend via Socket.io

Run locally
1. Install dependencies and start the server:

```bash
cd backend
npm install
npm start
```

2. Open a browser and go to http://localhost:3000 to join or create a game.

Developer notes
- Use `npm run dev` in the `backend` folder to start the server with `nodemon` during development.
- Tests and small utilities live under `backend/test/` (run them with node if needed).

If you want any part of this README expanded (setup details, architecture notes, or deployment steps), tell me what to add.
