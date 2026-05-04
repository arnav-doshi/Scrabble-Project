// ScrabbleLive Node.js Server with Socket.io
require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const GameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Configure this for production
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Serve frontend static files (so visiting / loads the app)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Initialize Supabase (for persistence only) - Optional
let supabase = null;
const hasSupabaseConfig = process.env.SUPABASE_URL && 
  process.env.SUPABASE_KEY && 
  process.env.SUPABASE_URL.startsWith('http');

if (hasSupabaseConfig) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  console.log('✅ Supabase connected (game history will be saved)');
} else {
  console.log('⚠️  Supabase not configured (game history disabled, gameplay works fine)');
}

// In-memory game state
const games = new Map(); // gameId -> GameLogic instance
const playerSockets = new Map(); // socketId -> {username, gameId}
const leaderboardEntries = [];
const finalizedGames = new Set();

// Utility: Generate room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getLeaderboardCutoff(range) {
  const now = Date.now();

  if (range === 'day') {
    return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }

  if (range === 'week') {
    return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  return null;
}

function aggregateLeaderboardRows(rows) {
  const totals = new Map();

  rows.forEach((row) => {
    const username = row.username;
    const score = Number(row.score || 0);
    const current = totals.get(username) || { username, totalScore: 0, gamesPlayed: 0 };
    current.totalScore += score;
    current.gamesPlayed += 1;
    totals.set(username, current);
  });

  return Array.from(totals.values())
    .sort((a, b) => b.totalScore - a.totalScore || a.username.localeCompare(b.username))
    .map((entry, index) => ({
      rank: index + 1,
      username: entry.username,
      totalScore: entry.totalScore,
      gamesPlayed: entry.gamesPlayed
    }));
}

async function loadLeaderboardRows(range = 'week') {
  const cutoff = getLeaderboardCutoff(range);
  let rows = [];

  if (supabase) {
    try {
      let query = supabase
        .from('leaderboard_entries')
        .select('username, score, recorded_at');

      if (cutoff) {
        query = query.gte('recorded_at', cutoff);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        rows = data;
      }
    } catch (error) {
      console.error('Error loading leaderboard from Supabase:', error);
    }
  }

  if (rows.length === 0) {
    rows = leaderboardEntries.filter((entry) => {
      if (!cutoff) return true;
      return new Date(entry.recorded_at).toISOString() >= cutoff;
    });
  }

  return aggregateLeaderboardRows(rows);
}

async function saveLeaderboardEntriesToSupabase(gameId, game) {
  const publicState = game.getPublicState();
  if (publicState.status !== 'finished' && publicState.status !== 'abandoned') return;
  if (finalizedGames.has(gameId)) return;

  finalizedGames.add(gameId);

  const recordedAt = new Date().toISOString();
  const rows = publicState.players.map((player) => ({
    game_id: gameId,
    username: player.username,
    score: player.score,
    recorded_at: recordedAt
  }));

  leaderboardEntries.push(...rows);

  if (!supabase) return;

  try {
    const { error } = await supabase.from('leaderboard_entries').insert(rows);
    if (error) {
      console.error('Error saving leaderboard entries:', error);
    }
  } catch (error) {
    console.error('Unexpected error saving leaderboard entries:', error);
  }
}

async function finalizeAndBroadcastGame(gameId, game, payload = {}) {
  await saveGameToSupabase(gameId, game);

  if (game.status === 'finished' || game.status === 'abandoned') {
    await saveLeaderboardEntriesToSupabase(gameId, game);
    io.to(gameId).emit('game-ended', {
      gameId,
      game: game.getPublicState(),
      ...payload
    });
    return;
  }

  io.to(gameId).emit('game-updated', {
    game: game.getPublicState(),
    ...payload
  });
}

// Socket.io Connection
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // CREATE GAME
  socket.on('create-game', async ({ username }) => {
    try {
      const roomCode = generateRoomCode();
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create new game instance
      const game = new GameLogic(gameId, roomCode);
      game.addPlayer(username, socket.id);
      games.set(gameId, game);
      
      // Track player
      playerSockets.set(socket.id, { username, gameId });
      
      // Join socket room
      socket.join(gameId);
      
      // Send response
      socket.emit('game-created', {
        gameId,
        roomCode,
        game: game.getGameState(username)
      });

      // Persist initial game + player racks to Supabase
      saveGameToSupabase(gameId, game);
      
      console.log(`Game created: ${roomCode} by ${username}`);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // JOIN GAME
  socket.on('join-game', async ({ username, roomCode }) => {
    try {
      // Find game by room code
      let targetGame = null;
      let targetGameId = null;
      
      for (const [gameId, game] of games.entries()) {
        if (game.roomCode === roomCode.toUpperCase()) {
          targetGame = game;
          targetGameId = gameId;
          break;
        }
      }
      
      if (!targetGame) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (targetGame.status !== 'waiting') {
        socket.emit('error', { message: 'Game already started' });
        return;
      }
      
      // Add second player
      targetGame.addPlayer(username, socket.id);
      playerSockets.set(socket.id, { username, gameId: targetGameId });
      
      // Join socket room
      socket.join(targetGameId);
      
      // Notify both players
      io.to(targetGameId).emit('game-started', {
        gameId: targetGameId,
        game: targetGame.getPublicState()
      });
      
      // Send each player their private rack
      targetGame.players.forEach(player => {
        const playerSocket = Array.from(io.sockets.sockets.values())
          .find(s => s.id === player.socketId);
        if (playerSocket) {
          playerSocket.emit('rack-update', {
            rack: targetGame.getPlayerRack(player.username)
          });
        }
      });
      
      console.log(`${username} joined game ${roomCode}`);
      // Persist update (player2 joined + racks)
      saveGameToSupabase(targetGameId, targetGame);
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // SUBMIT MOVE (uses acknowledgement callback to return success/failure)
  socket.on('submit-move', async ({ gameId, tilesPlaced }, callback) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        const msg = 'Player not found';
        if (callback) return callback({ success: false, message: msg });
        socket.emit('error', { message: msg });
        return;
      }

      const game = games.get(gameId);
      if (!game) {
        const msg = 'Game not found';
        if (callback) return callback({ success: false, message: msg });
        socket.emit('error', { message: msg });
        return;
      }

      // Validate and process move (submitMove is async now)
      const result = await game.submitMove(playerInfo.username, tilesPlaced);

      await finalizeAndBroadcastGame(gameId, game, {
        lastMove: {
          player: playerInfo.username,
          points: result.points
        }
      });

      // Send updated racks to each player
      game.players.forEach(player => {
        const playerSocket = Array.from(io.sockets.sockets.values())
          .find(s => s.id === player.socketId);
        if (playerSocket) {
          playerSocket.emit('rack-update', {
            rack: game.getPlayerRack(player.username)
          });
        }
      });

      console.log(`${playerInfo.username} submitted move: ${result.points} points`);

      // Save to Supabase: game, racks, and move
      saveMoveToSupabase(gameId, {
        username: playerInfo.username,
        move_type: 'submit',
        tilesPlaced: tilesPlaced,
        points: result.points,
        board_state: game.board
      });

      if (callback) return callback({ success: true, result });
    } catch (error) {
      console.error('Error submitting move:', error);
      if (callback) return callback({ success: false, message: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  // PASS TURN
  socket.on('pass-turn', async ({ gameId }) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) return;
      
      const game = games.get(gameId);
      if (!game) return;
      
      game.passTurn(playerInfo.username);

      await finalizeAndBroadcastGame(gameId, game, {
        lastMove: {
          player: playerInfo.username,
          action: 'pass'
        }
      });

      console.log(`${playerInfo.username} passed turn`);
    } catch (error) {
      console.error('Error passing turn:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // SWAP TILES
  socket.on('swap-tiles', async ({ gameId, tileIds }) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) return;
      
      const game = games.get(gameId);
      if (!game) return;
      
      game.swapTiles(playerInfo.username, tileIds);
      
      // Send updated rack only to this player
      socket.emit('rack-update', {
        rack: game.getPlayerRack(playerInfo.username)
      });

      await finalizeAndBroadcastGame(gameId, game, {
        lastMove: {
          player: playerInfo.username,
          action: 'swap'
        }
      });
      
      console.log(`${playerInfo.username} swapped tiles`);
    } catch (error) {
      console.error('Error swapping tiles:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // CHAT MESSAGE
  socket.on('chat-message', ({ gameId, message }) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) return;
    
    const chatMsg = {
      username: playerInfo.username,
      message,
      timestamp: Date.now()
    };
    
    // Broadcast to all players in game
    io.to(gameId).emit('chat-message', chatMsg);
    
    // Save to Supabase
    saveChatToSupabase(gameId, chatMsg);
  });

  // END GAME IMMEDIATELY
  socket.on('end-game', async ({ gameId, reason = 'manual' }, callback) => {
    try {
      const playerInfo = playerSockets.get(socket.id);
      if (!playerInfo) {
        const msg = 'Player not found';
        if (callback) return callback({ success: false, message: msg });
        socket.emit('error', { message: msg });
        return;
      }

      const game = games.get(gameId);
      if (!game) {
        const msg = 'Game not found';
        if (callback) return callback({ success: false, message: msg });
        socket.emit('error', { message: msg });
        return;
      }

      game.status = 'finished';
      game.currentTurn = null;

      await saveGameToSupabase(gameId, game);
      await saveLeaderboardEntriesToSupabase(gameId, game);

      io.to(gameId).emit('game-ended', {
        gameId,
        game: game.getPublicState(),
        reason,
        lastMove: {
          player: playerInfo.username,
          action: 'end-game'
        }
      });

      if (callback) return callback({ success: true, game: game.getPublicState() });
    } catch (error) {
      console.error('Error ending game:', error);
      if (callback) return callback({ success: false, message: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    const playerInfo = playerSockets.get(socket.id);
    if (playerInfo) {
      const game = games.get(playerInfo.gameId);
      if (game) {
        // Notify other players
        io.to(playerInfo.gameId).emit('player-disconnected', {
          username: playerInfo.username
        });
        
        // Optional: Mark game as abandoned after timeout
        // or allow reconnection
      }
      playerSockets.delete(socket.id);
    }
  });

  // GET GAME STATE (for page refresh or reconnection)
  socket.on('get-game-state', ({ gameId, username }) => {
    try {
      const game = games.get(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Update player's socket ID (in case of reconnection)
      const player = game.players.find(p => p.username === username);
      if (player) {
        player.socketId = socket.id;
        playerSockets.set(socket.id, { username, gameId });
        
        // Join the socket room
        socket.join(gameId);
      }

      // Send current game state
      socket.emit('game-state', {
        game: game.getPublicState(),
        rack: game.getPlayerRack(username),
        status: game.status
      });

      console.log(`Sent game state to ${username} (socketId: ${socket.id})`);
    } catch (error) {
      console.error('Error getting game state:', error);
      socket.emit('error', { message: error.message });
    }
  });
});

// Save game state to Supabase (for persistence)
async function saveGameToSupabase(gameId, game) {
  if (!supabase) return; // Skip if Supabase not configured
  
  try {
    const gameState = game.getPublicState();
    
    // Upsert game record
    await supabase
      .from('games')
      .upsert({
        id: gameId,
        room_code: game.roomCode,
        status: game.status,
        board: game.board,
        tile_bag: game.tileBag,
        player1_username: game.players[0]?.username,
        player2_username: game.players[1]?.username,
        player1_score: game.players[0]?.score,
        player2_score: game.players[1]?.score,
        current_turn: game.currentTurn,
        updated_at: new Date().toISOString()
      });
    
    // Also upsert player racks so frontend can read them
    await savePlayerRacksToSupabase(gameId, game);
  } catch (error) {
    console.error('Error saving to Supabase:', error);
  }
}

// Save or update player racks for a game
async function savePlayerRacksToSupabase(gameId, game) {
  if (!supabase) return;

  const rows = game.players.map(p => ({
    game_id: gameId,
    username: p.username,
    tiles: p.rack,
    updated_at: new Date().toISOString()
  }));

  // Update if row exists, otherwise insert - prevents duplicate rows
  for (const r of rows) {
    try {
      const { data: existing, error: selErr } = await supabase
        .from('player_racks')
        .select('*')
        .eq('game_id', r.game_id)
        .eq('username', r.username)
        .single();

      if (selErr || !existing) {
        const { error: insertErr } = await supabase.from('player_racks').insert(r);
        if (insertErr) console.error('Error inserting player_rack:', insertErr);
      } else {
        const { error: updateErr } = await supabase.from('player_racks').update({ tiles: r.tiles, updated_at: r.updated_at }).eq('id', existing.id);
        if (updateErr) console.error('Error updating player_rack:', updateErr);
      }
    } catch (e) {
      console.error('Unexpected error saving player_rack:', e);
    }
  }
}

// Record a move in game_moves table
async function saveMoveToSupabase(gameId, move) {
  if (!supabase) return;
  try {
    await supabase.from('game_moves').insert({
      game_id: gameId,
      player_username: move.username,
      move_type: move.move_type || 'submit',
      tiles_placed: move.tilesPlaced || move.tiles_placed || null,
      points_earned: move.points || move.points_earned || 0,
      board_state: move.board_state || null
    });
  } catch (error) {
    console.error('Error saving move to Supabase:', error);
  }
}

// Save chat to Supabase
async function saveChatToSupabase(gameId, chatMsg) {
  if (!supabase) return; // Skip if Supabase not configured
  
  try {
    await supabase
      .from('chat_messages')
      .insert({
        game_id: gameId,
        username: chatMsg.username,
        message: chatMsg.message
      });
  } catch (error) {
    console.error('Error saving chat:', error);
  }
}

// REST API endpoints (optional)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeGames: games.size,
    activePlayers: playerSockets.size
  });
});

// Public config endpoint - serves non-sensitive client config (anon key only)
app.get('/public-config', (req, res) => {
  // Only return the anon key and URL (safe for client use)
  if (!process.env.SUPABASE_URL) {
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }
  return res.json({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || null
  });
});

app.get('/games', (req, res) => {
  const gameList = Array.from(games.values()).map(game => ({
    roomCode: game.roomCode,
    status: game.status,
    players: game.players.length
  }));
  res.json(gameList);
});

app.get('/leaderboard', async (req, res) => {
  try {
    const range = (req.query.range || 'week').toLowerCase();
    const leaderboard = await loadLeaderboardRows(range);

    res.json({
      range,
      leaderboard,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint to trigger cleanup of old active games
app.post('/admin/cleanup-games', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Find active games older than cutoff
    const { data: oldGames, error: selErr } = await supabase
      .from('games')
      .select('id')
      .eq('status', 'active')
      .lt('updated_at', cutoff);

    if (selErr) throw selErr;

    const ids = (oldGames || []).map(g => g.id);
    if (ids.length === 0) return res.json({ updated: 0 });

    const { data, error: updErr } = await supabase
      .from('games')
      .update({ status: 'abandoned' })
      .in('id', ids);

    if (updErr) throw updErr;

    // Also update in-memory games map
    ids.forEach(id => {
      const g = games.get(id);
      if (g) {
        g.status = 'abandoned';
        io.to(id).emit('game-updated', { game: g.getPublicState(), lastMove: { action: 'abandoned' } });
      }
    });

    res.json({ updated: ids.length });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: error.message });
  }
});

// Periodic cleanup: run every hour
async function cleanupOldActiveGames() {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldGames, error: selErr } = await supabase
      .from('games')
      .select('id')
      .eq('status', 'active')
      .lt('updated_at', cutoff);

    if (selErr) {
      console.error('Cleanup select error:', selErr);
      return;
    }

    const ids = (oldGames || []).map(g => g.id);
    if (ids.length === 0) return;

    const { error: updErr } = await supabase
      .from('games')
      .update({ status: 'abandoned' })
      .in('id', ids);

    if (updErr) {
      console.error('Cleanup update error:', updErr);
      return;
    }

    ids.forEach(id => {
      const g = games.get(id);
      if (g) {
        g.status = 'abandoned';
        io.to(id).emit('game-updated', { game: g.getPublicState(), lastMove: { action: 'abandoned' } });
      }
    });

    console.log(`Cleanup: marked ${ids.length} games as abandoned`);
  } catch (e) {
    console.error('Unexpected cleanup error:', e);
  }
}

if (supabase) {
  // Run initial cleanup at startup, then every hour
  cleanupOldActiveGames();
  setInterval(cleanupOldActiveGames, 1000 * 60 * 60);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 ScrabbleLive server running on port ${PORT}`);
  console.log(`📡 Socket.io enabled for real-time gameplay`);
});
