-- ScrabbleLive Database Schema for Supabase
-- SIMPLIFIED VERSION: Used only for game persistence/history
-- Real-time gameplay happens in Node.js server memory

-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Games table: stores completed/saved games
CREATE TABLE games (
  id TEXT PRIMARY KEY, -- Matches gameId from Node.js server
  room_code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting', -- waiting, active, finished
  current_turn VARCHAR(100),
  board JSONB DEFAULT '[]'::jsonb,
  tile_bag JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  player1_username TEXT,
  player2_username TEXT,
  player1_score INTEGER DEFAULT 0,
  player2_score INTEGER DEFAULT 0,
  last_move_at TIMESTAMP WITH TIME ZONE
);

-- Chat messages table: store game chat (optional - mostly for history)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leaderboard entries table: store final scores for weekly rankings
CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  score INTEGER NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_games_room_code ON games(room_code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_chat_messages_game_id ON chat_messages(game_id);
CREATE INDEX idx_leaderboard_entries_recorded_at ON leaderboard_entries(recorded_at);
CREATE INDEX idx_leaderboard_entries_username ON leaderboard_entries(username);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all for now (server handles validation)
CREATE POLICY "Allow all to read games" ON games FOR SELECT USING (true);
CREATE POLICY "Allow all to insert games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update games" ON games FOR UPDATE USING (true);

CREATE POLICY "Allow all to read chat" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow all to insert chat" ON chat_messages FOR INSERT WITH CHECK (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamps
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: game_moves and player_racks tables removed - handled in Node.js memory
-- Add player_racks table: stores each player's rack for a game
CREATE TABLE IF NOT EXISTS player_racks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  tiles JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_racks_game_id ON player_racks(game_id);

-- Add game_moves table: record each move for history/replay
CREATE TABLE IF NOT EXISTS game_moves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  player_username TEXT NOT NULL,
  move_type VARCHAR(50) NOT NULL,
  tiles_placed JSONB,
  points_earned INTEGER DEFAULT 0,
  board_state JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_moves_game_id ON game_moves(game_id);

