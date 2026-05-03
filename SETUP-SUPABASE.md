# Supabase setup

This covers how to securely configure Supabase for the backend. The service role key should never be exposed to the frontend.

## 1. Create a Supabase project

Go to [app.supabase.com](https://app.supabase.com) and create a project. From Settings → API, note your Project URL (`https://xxxxx.supabase.co`) and both the anon and service role keys — you'll need them in the next step.

## 2. Run the database schema

Open the SQL Editor in your Supabase dashboard, paste the contents of `backend/database-schema.sql`, and run it. This creates the `games`, `chat_messages`, `player_racks`, `game_moves`, and related tables.

## 3. Add environment variables

Create a `.env` file at the project root:

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJI...   # service role key — backend only
PORT=3000
```

Use the service role key here, not the anon key. Never commit `.env` to source control.

## 4. Protect your `.env`

```bash
echo ".env" >> .gitignore
```

## 5. Frontend usage (optional)

If you want the frontend to talk directly to Supabase, use only the anon/public key in `frontend/config.js`. The anon key is safe for client-side reads but not for privileged writes — route anything sensitive through the Node server instead.

## 6. Run locally

```bash
npm install
npm run dev
# or: SUPABASE_URL=... SUPABASE_KEY=... npm start
```

## 7. Production

Store `SUPABASE_URL` and `SUPABASE_KEY` in your hosting platform's environment variables (Vercel, Heroku, Railway, etc.) rather than in a committed file.

Before going public, review the Row-Level Security policies in Supabase. The schema ships with permissive policies for convenience — tighten those before real users are on the system.

## Troubleshooting

If `backend/server.js` logs "Supabase not configured", check that both `SUPABASE_URL` and `SUPABASE_KEY` are set in the environment and that `SUPABASE_URL` starts with `https`. To rerun or update the schema, use the SQL Editor or Supabase migrations.