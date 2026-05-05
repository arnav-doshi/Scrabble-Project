// Game Service - Handles all game logic and Supabase interactions

const GameService = {
  // Standard Scrabble tile distribution
  TILE_DISTRIBUTION: {
    A: { count: 9, points: 1 }, B: { count: 2, points: 3 }, C: { count: 2, points: 3 },
    D: { count: 4, points: 2 }, E: { count: 12, points: 1 }, F: { count: 2, points: 4 },
    G: { count: 3, points: 2 }, H: { count: 2, points: 4 }, I: { count: 9, points: 1 },
    J: { count: 1, points: 8 }, K: { count: 1, points: 5 }, L: { count: 4, points: 1 },
    M: { count: 2, points: 3 }, N: { count: 6, points: 1 }, O: { count: 8, points: 1 },
    P: { count: 2, points: 3 }, Q: { count: 1, points: 10 }, R: { count: 6, points: 1 },
    S: { count: 4, points: 1 }, T: { count: 6, points: 1 }, U: { count: 4, points: 1 },
    V: { count: 2, points: 4 }, W: { count: 2, points: 4 }, X: { count: 1, points: 8 },
    Y: { count: 2, points: 4 }, Z: { count: 1, points: 10 }, '_': { count: 2, points: 0 }
  },

  // Generate a random 4-character room code
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  // Create initial tile bag with all tiles
  createTileBag() {
    const bag = [];
    let idCounter = 1;
    
    for (const [letter, { count, points }] of Object.entries(this.TILE_DISTRIBUTION)) {
      for (let i = 0; i < count; i++) {
        bag.push({
          id: `tile_${idCounter++}`,
          letter: letter === '_' ? '' : letter, // Blank tiles
          points,
          isBlank: letter === '_'
        });
      }
    }
    
    // Shuffle the bag
    return this.shuffleArray(bag);
  },

  // Shuffle array helper
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  // Draw tiles from the bag
  drawTiles(tileBag, count) {
    const drawn = tileBag.splice(0, Math.min(count, tileBag.length));
    return { drawn, remainingBag: tileBag };
  },

  // Create a new game
  async createGame(username, roomCode = null) {
    const code = roomCode || this.generateRoomCode();
    const tileBag = this.createTileBag();
    const emptyBoard = Array.from({ length: 15 }, () => 
      Array.from({ length: 15 }, () => null)
    );

    // Draw initial tiles for player 1
    const { drawn, remainingBag } = this.drawTiles(tileBag, 7);

    const { data: game, error } = await supabase
      .from('games')
      .insert({
        room_code: code,
        status: 'waiting',
        board: emptyBoard,
        tile_bag: remainingBag,
        player1_username: username,
        current_turn: username
      })
      .select()
      .single();

    if (error) throw error;

    // Store player 1's rack
    await supabase.from('player_racks').insert({
      game_id: game.id,
      username: username,
      tiles: drawn
    });

    return game;
  },

  // Join an existing game
  async joinGame(username, roomCode) {
    // Find the game
    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .single();

    if (fetchError) throw new Error('Game not found');
    if (game.status !== 'waiting') throw new Error('Game already started');
    if (game.player2_username) throw new Error('Game is full');

    // Draw tiles for player 2
    const tileBag = game.tile_bag;
    const { drawn, remainingBag } = this.drawTiles(tileBag, 7);

    // Update game with player 2
    const { data: updatedGame, error: updateError } = await supabase
      .from('games')
      .update({
        player2_username: username,
        status: 'active',
        tile_bag: remainingBag
      })
      .eq('id', game.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Store player 2's rack
    await supabase.from('player_racks').insert({
      game_id: game.id,
      username: username,
      tiles: drawn
    });

    return updatedGame;
  },

  // Get game by room code
  async getGame(roomCode) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .single();

    if (error) throw error;
    return data;
  },

  // Get player's rack
  async getPlayerRack(gameId, username) {
    const { data, error } = await supabase
      .from('player_racks')
      .select('*')
      .eq('game_id', gameId)
      .eq('username', username)
      .single();

    if (error) throw error;
    return data ? data.tiles : [];
  },

  // Update player's rack
  async updatePlayerRack(gameId, username, tiles) {
    const { error } = await supabase
      .from('player_racks')
      .update({ tiles })
      .eq('game_id', gameId)
      .eq('username', username);

    if (error) throw error;
  },

  // Submit a move (place tiles on board)
  async submitMove(gameId, username, tilesPlaced, newBoard, pointsEarned) {
    // Get current game state
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (!game) throw new Error('Game not found');
    if (game.current_turn !== username) throw new Error('Not your turn');

    // Update game state
    const nextPlayer = game.player1_username === username 
      ? game.player2_username 
      : game.player1_username;

    const scoreField = game.player1_username === username 
      ? 'player1_score' 
      : 'player2_score';

    const newScore = (game[scoreField] || 0) + pointsEarned;

    const { error: updateError } = await supabase
      .from('games')
      .update({
        board: newBoard,
        current_turn: nextPlayer,
        [scoreField]: newScore,
        last_move_at: new Date().toISOString()
      })
      .eq('id', gameId);

    if (updateError) throw updateError;

    // Record the move
    await supabase.from('game_moves').insert({
      game_id: gameId,
      player_username: username,
      move_type: 'submit',
      tiles_placed: tilesPlaced,
      points_earned: pointsEarned,
      board_state: newBoard
    });

    // Refill player's rack
    const currentRack = await this.getPlayerRack(gameId, username);
    const tilesNeeded = 7 - currentRack.length;
    
    if (tilesNeeded > 0 && game.tile_bag.length > 0) {
      const tileBag = [...game.tile_bag];
      const { drawn, remainingBag } = this.drawTiles(tileBag, tilesNeeded);
      
      await this.updatePlayerRack(gameId, username, [...currentRack, ...drawn]);
      await supabase.from('games').update({ tile_bag: remainingBag }).eq('id', gameId);
    }

    return { success: true, points: pointsEarned };
  },

  // Pass turn
  async passTurn(gameId, username) {
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (!game) throw new Error('Game not found');
    if (game.current_turn !== username) throw new Error('Not your turn');

    const nextPlayer = game.player1_username === username 
      ? game.player2_username 
      : game.player1_username;

    await supabase.from('games').update({ 
      current_turn: nextPlayer,
      last_move_at: new Date().toISOString()
    }).eq('id', gameId);

    await supabase.from('game_moves').insert({
      game_id: gameId,
      player_username: username,
      move_type: 'pass',
      points_earned: 0
    });

    return { success: true };
  },

  // Send chat message
  async sendChatMessage(gameId, username, message) {
    const { error } = await supabase
      .from('chat_messages')
      .insert({
        game_id: gameId,
        username,
        message
      });

    if (error) throw error;
  },

  // Get chat messages
  async getChatMessages(gameId) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Swap tiles (optional - simplified version)
  async swapTiles(gameId, username, tilesToSwap) {
    const currentRack = await this.getPlayerRack(gameId, username);
    const { data: game } = await supabase.from('games').select('tile_bag').eq('id', gameId).single();
    
    if (!game) throw new Error('Game not found');

    const tileBag = [...game.tile_bag];
    
    // Remove tiles from rack and add to bag
    const newRack = currentRack.filter(t => !tilesToSwap.find(ts => ts.id === t.id));
    tileBag.push(...tilesToSwap);
    
    // Draw new tiles
    const { drawn, remainingBag } = this.drawTiles(tileBag, tilesToSwap.length);
    newRack.push(...drawn);
    
    await this.updatePlayerRack(gameId, username, newRack);
    await supabase.from('games').update({ tile_bag: remainingBag }).eq('id', gameId);
    
    // Pass turn after swapping
    await this.passTurn(gameId, username);
    
    return { success: true };
  }
};

