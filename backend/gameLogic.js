// GameLogic.js - Server-side game state and validation

class GameLogic {
  constructor(gameId, roomCode) {
    this.gameId = gameId;
    this.roomCode = roomCode;
    this.status = 'waiting'; // waiting, active, finished
    this.players = []; // [{username, socketId, score, rack: []}]
    this.board = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null));
    this.tileBag = this.createTileBag();
    this.currentTurn = null;
    this.moveHistory = [];
    this.passCount = 0;
  }

  // Standard Scrabble tile distribution
  TILE_DISTRIBUTION = {
    A: { count: 9, points: 1 }, B: { count: 2, points: 3 }, C: { count: 2, points: 3 },
    D: { count: 4, points: 2 }, E: { count: 12, points: 1 }, F: { count: 2, points: 4 },
    G: { count: 3, points: 2 }, H: { count: 2, points: 4 }, I: { count: 9, points: 1 },
    J: { count: 1, points: 8 }, K: { count: 1, points: 5 }, L: { count: 4, points: 1 },
    M: { count: 2, points: 3 }, N: { count: 6, points: 1 }, O: { count: 8, points: 1 },
    P: { count: 2, points: 3 }, Q: { count: 1, points: 10 }, R: { count: 6, points: 1 },
    S: { count: 4, points: 1 }, T: { count: 6, points: 1 }, U: { count: 4, points: 1 },
    V: { count: 2, points: 4 }, W: { count: 2, points: 4 }, X: { count: 1, points: 8 },
    Y: { count: 2, points: 4 }, Z: { count: 1, points: 10 }, '_': { count: 2, points: 0 }
  };

  // Bonus squares map
  BONUS = this.initBonusSquares();

  initBonusSquares() {
    const bonus = {};
    const setBonus = (r, c, type) => { bonus[`${r},${c}`] = type; };
    
    // Triple Word
    [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]]
      .forEach(([r,c]) => setBonus(r,c,"TW"));
    
    // Double Word (includes center)
    [[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
     [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],[7,7]]
      .forEach(([r,c]) => setBonus(r,c,"DW"));
    
    // Triple Letter
    [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]
      .forEach(([r,c]) => setBonus(r,c,"TL"));
    
    // Double Letter
    [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
     [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]]
      .forEach(([r,c]) => setBonus(r,c,"DL"));
    
    return bonus;
  }

  createTileBag() {
    const bag = [];
    let idCounter = 1;
    
    for (const [letter, { count, points }] of Object.entries(this.TILE_DISTRIBUTION)) {
      for (let i = 0; i < count; i++) {
        bag.push({
          id: `tile_${idCounter++}`,
          letter: letter === '_' ? '' : letter,
          points,
          isBlank: letter === '_'
        });
      }
    }
    
    return this.shuffleArray(bag);
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  addPlayer(username, socketId) {
    if (this.players.length >= 2) {
      throw new Error('Game is full');
    }
    
    // Draw 7 tiles for new player
    const rack = this.drawTiles(7);
    
    this.players.push({
      username,
      socketId,
      score: 0,
      rack
    });
    
    // Start game when second player joins
    if (this.players.length === 2) {
      this.status = 'active';
      this.currentTurn = this.players[0].username;
    } else {
      this.currentTurn = username;
    }
  }

  drawTiles(count) {
    const drawn = this.tileBag.splice(0, Math.min(count, this.tileBag.length));
    return drawn;
  }

  getPlayer(username) {
    return this.players.find(p => p.username === username);
  }

  submitMove(username, tilesPlaced) {
    // This method performs server-side validation of formed words
    // and applies the move only if all formed words are valid.
    return (async () => {
      // Validate turn
      if (this.currentTurn !== username) {
        throw new Error('Not your turn');
      }

      const player = this.getPlayer(username);
      if (!player) {
        throw new Error('Player not found');
      }

      // Check squares are free and build a temporary board to validate words
      const tempBoard = this.board.map(row => row.slice());
      for (const { row, col, tile } of tilesPlaced) {
        if (tempBoard[row][col] !== null) {
          throw new Error('Square already occupied');
        }
        tempBoard[row][col] = tile;
      }

      // Helper: collect contiguous words (horizontal & vertical) that include placed tiles
      const collectWords = (board, placements) => {
        const words = new Set();

        const addWordAt = (r, c, dr, dc) => {
          // move to start
          let sr = r;
          let sc = c;
          while (sr - dr >= 0 && sc - dc >= 0 && sr - dr < 15 && sc - dc < 15 && board[sr - dr][sc - dc]) {
            sr -= dr; sc -= dc;
          }

          let word = '';
          let rr = sr; let cc = sc;
          while (rr >= 0 && cc >= 0 && rr < 15 && cc < 15 && board[rr][cc]) {
            const t = board[rr][cc];
            word += (t.letter || '');
            rr += dr; cc += dc;
          }

          if (word.length > 1) words.add(word.toLowerCase());
        };

        // For each placed tile, check horizontal and vertical
        placements.forEach(p => {
          addWordAt(p.row, p.col, 0, 1); // horizontal
          addWordAt(p.row, p.col, 1, 0); // vertical
        });

        return Array.from(words);
      };

      const formedWords = collectWords(tempBoard, tilesPlaced);

      // Optionally skip validation (useful for automated tests)
      const skipValidation = process.env.SKIP_VALIDATION === '1' || process.env.SKIP_VALIDATION === 'true';
      if (!skipValidation) {
        // Validate each formed word via dictionary API (no dependency added; using https)
        const validateWord = (word) => {
          return new Promise((resolve) => {
            const https = require('https');
            const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
            https.get(url, (res) => {
              if (res.statusCode === 200) {
                // Valid word
                // consume body and resolve true
                res.on('data', () => {});
                res.on('end', () => resolve(true));
              } else {
                // 404 or other - treat as invalid
                res.on('data', () => {});
                res.on('end', () => resolve(false));
              }
            }).on('error', () => resolve(false));
          });
        };

        // If no words formed (shouldn't happen), allow move
        if (formedWords.length > 0) {
          const validations = await Promise.all(formedWords.map(w => validateWord(w)));
          const invalidIndex = validations.findIndex(v => v === false);
          if (invalidIndex !== -1) {
            throw new Error(`Invalid word: ${formedWords[invalidIndex]}`);
          }
        }
      }

      // All validated: commit placements to real board and update player rack & scores
      tilesPlaced.forEach(({ row, col, tile }) => {
        this.board[row][col] = tile;
        // Remove tile from player's rack
        const rackIndex = player.rack.findIndex(t => t.id === tile.id);
        if (rackIndex !== -1) player.rack.splice(rackIndex, 1);
      });

      // Calculate points
      const points = this.calculatePoints(tilesPlaced);
      player.score += points;

      // Refill rack
      const newTiles = this.drawTiles(tilesPlaced.length);
      player.rack.push(...newTiles);

      // Switch turn
      this.switchTurn();
      this.passCount = 0; // Reset pass count

      // Record move
      this.moveHistory.push({
        username,
        tilesPlaced,
        points,
        formedWords,
        timestamp: Date.now()
      });

      // Check end-of-game: if the tile bag is empty and the current player emptied their rack
      // then apply final scoring per standard Scrabble rules:
      // - subtract remaining tile points from each player's score
      // - add the sum of those subtractions to the player who emptied their rack
      if (this.tileBag.length === 0 && player.rack.length === 0) {
        // sum remaining tiles for each player
        const remainingPoints = this.players.map(p => p.rack.reduce((s, t) => s + (t.points || 0), 0));

        // subtract remaining tiles from each player's score
        for (let i = 0; i < this.players.length; i++) {
          this.players[i].score -= remainingPoints[i];
        }

        // add total of remaining tiles to player who emptied rack
        const totalRemaining = remainingPoints.reduce((a, b) => a + b, 0);
        player.score += totalRemaining;

        // mark game finished and clear current turn
        this.status = 'finished';
        this.currentTurn = null;
      }

      return { points, newTiles, formedWords };
    })();
  }

  calculatePoints(tilesPlaced) {
    let points = 0;
    let wordMultiplier = 1;
    
    tilesPlaced.forEach(({ row, col, tile }) => {
      let tilePoints = tile.points;
      const bonus = this.BONUS[`${row},${col}`];
      
      if (bonus === "DL") tilePoints *= 2;
      if (bonus === "TL") tilePoints *= 3;
      if (bonus === "DW") wordMultiplier *= 2;
      if (bonus === "TW") wordMultiplier *= 3;
      
      points += tilePoints;
    });
    
    points *= wordMultiplier;
    
    // 7-tile bonus (bingo)
    if (tilesPlaced.length === 7) {
      points += 50;
    }
    
    return points;
  }

  passTurn(username) {
    if (this.currentTurn !== username) {
      throw new Error('Not your turn');
    }
    
    this.switchTurn();
    this.passCount++;
    
    // End game if both players pass twice in a row
    if (this.passCount >= 4) {
      this.status = 'finished';
    }
  }

  swapTiles(username, tileIds) {
    if (this.currentTurn !== username) {
      throw new Error('Not your turn');
    }
    
    const player = this.getPlayer(username);
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Remove selected tiles from rack and add to bag
    const swappedTiles = [];
    tileIds.forEach(id => {
      const index = player.rack.findIndex(t => t.id === id);
      if (index !== -1) {
        swappedTiles.push(player.rack.splice(index, 1)[0]);
      }
    });
    
    this.tileBag.push(...swappedTiles);
    this.tileBag = this.shuffleArray(this.tileBag);
    
    // Draw new tiles
    const newTiles = this.drawTiles(swappedTiles.length);
    player.rack.push(...newTiles);
    
    // Switch turn
    this.switchTurn();
    this.passCount = 0;
  }

  switchTurn() {
    const currentIndex = this.players.findIndex(p => p.username === this.currentTurn);
    const nextIndex = (currentIndex + 1) % this.players.length;
    this.currentTurn = this.players[nextIndex].username;
  }

  getPlayerRack(username) {
    const player = this.getPlayer(username);
    return player ? player.rack : [];
  }

  getPublicState() {
    const playersPublic = this.players.map(p => ({
      username: p.username,
      score: p.score,
      tileCount: p.rack.length
    }));

    // For finished or abandoned games, compute final scoreboard and winner
    let winner = null;
    let finalScoreboard = null;
    if (this.status === 'finished' || this.status === 'abandoned') {
      finalScoreboard = this.players
        .map(p => ({ username: p.username, score: p.score }))
        .sort((a, b) => b.score - a.score);

      if (finalScoreboard.length > 0) {
        const topScore = finalScoreboard[0].score;
        const topPlayers = finalScoreboard.filter(p => p.score === topScore).map(p => p.username);
        // If tie, return array of winners; otherwise a single username
        winner = topPlayers.length === 1 ? topPlayers[0] : topPlayers;
      }
    }

    return {
      gameId: this.gameId,
      roomCode: this.roomCode,
      status: this.status,
      board: this.board,
      currentTurn: this.currentTurn,
      players: playersPublic,
      tilesRemaining: this.tileBag.length,
      winner,
      finalScoreboard
    };
  }

  getGameState(username) {
    return {
      ...this.getPublicState(),
      rack: this.getPlayerRack(username)
    };
  }
}

module.exports = GameLogic;
