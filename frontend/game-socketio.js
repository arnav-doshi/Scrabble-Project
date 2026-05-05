// game-socketio.js - Multiplayer Scrabble Game with Socket.io

const boardEl = document.getElementById("board");
const rackEl  = document.getElementById("rack");

const room = localStorage.getItem("scrabble_room");
const user = localStorage.getItem("scrabble_user");
const gameId = localStorage.getItem("scrabble_game_id");

if (!room || !user || !gameId) {
  alert("No game session found. Redirecting to lobby...");
  window.location.href = "index.html";
}

document.getElementById("roomLabel").textContent = room;
document.getElementById("userLabel").textContent = user;

// Connect to Socket.io server
socketService.connect();

let selectedTileId = null;
let currentGame = null;
let board = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null));
let placedThisTurn = []; // {row, col, tile}
let rack = [];
let isMyTurn = false;
let gameEnded = false;

// Bonus squares configuration
const BONUS = {};
function setBonus(r,c,type){ BONUS[`${r},${c}`]=type; }

// TW
[[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]]
  .forEach(([r,c]) => setBonus(r,c,"TW"));

// DW (includes center)
[[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
 [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],[7,7]]
  .forEach(([r,c]) => setBonus(r,c,"DW"));

// TL
[[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]
  .forEach(([r,c]) => setBonus(r,c,"TL"));

// DL
[[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
 [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]]
  .forEach(([r,c]) => setBonus(r,c,"DL"));

function renderBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const b = BONUS[`${r},${c}`];
      if (b === "TW") cell.classList.add("tw");
      if (b === "DW") cell.classList.add("dw");
      if (b === "TL") cell.classList.add("tl");
      if (b === "DL") cell.classList.add("dl");

      if (r === 7 && c === 7) cell.classList.add("center");

      const tile = board[r][c];
      if (tile) {
        cell.classList.add("occupied");
        cell.textContent = tile.letter;
      } else if (b) {
        const label = document.createElement("div");
        label.className = "bonus-label";
        label.textContent = b;
        cell.appendChild(label);
      } else if (r === 7 && c === 7) {
        const label = document.createElement("div");
        label.className = "bonus-label";
        label.style.color = "rgba(0,0,0,.65)";
        label.textContent = "★";
        cell.appendChild(label);
      }

      cell.onclick = () => onCellClick(r, c);
      boardEl.appendChild(cell);
    }
  }
}

function renderRack() {
  rackEl.innerHTML = "";
  rack.forEach(t => {
    const el = document.createElement("div");
    el.className = "tile";
    if (t.id === selectedTileId) el.classList.add("selected");

    el.innerHTML = `${t.letter}<span class="pts">${t.points}</span>`;
    el.onclick = () => {
      if (!isMyTurn) {
        setMsg("It's not your turn!");
        return;
      }
      selectedTileId = (selectedTileId === t.id) ? null : t.id;
      renderRack();
    };

    rackEl.appendChild(el);
  });
}

function onCellClick(r, c) {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  if (!selectedTileId) return;
  if (board[r][c] !== null) return;

  const idx = rack.findIndex(t => t.id === selectedTileId);
  if (idx === -1) return;

  const tile = rack[idx];

  board[r][c] = tile;
  placedThisTurn.push({ row: r, col: c, tile });

  rack.splice(idx, 1);
  selectedTileId = null;

  setMsg("");
  renderBoard();
  renderRack();
}

function setMsg(text){
  document.getElementById("gameMsg").textContent = text;
}

function handleGameEnded(data) {
  if (gameEnded) return;
  gameEnded = true;

  if (data?.game) {
    currentGame = data.game;
  }

  sessionStorage.setItem('scrabble_ended_game', JSON.stringify(data?.game || currentGame || {}));
  sessionStorage.setItem('scrabble_end_reason', data?.reason || 'finished');
  window.location.href = 'leaderboard.html';
}

function updateTurnLabel() {
  const label = document.getElementById("turnLabel");
  if (isMyTurn) {
    label.textContent = "Your Turn";
    label.style.background = "#10b981";
  } else {
    label.textContent = "Opponent's Turn";
    label.style.background = "#6b7280";
  }
}

function updateScores() {
  if (!currentGame || !currentGame.players) return;
  
  const myPlayer = currentGame.players.find(p => p.username === user);
  const opPlayer = currentGame.players.find(p => p.username !== user);
  
  document.getElementById("myScore").textContent = myPlayer?.score || 0;
  document.getElementById("opScore").textContent = opPlayer?.score || 0;
}

function displayChatMessage(username, message) {
  const box = document.getElementById("chatBox");
  const line = document.createElement("div");
  line.textContent = `${username}: ${message}`;
  if (username === user) {
    line.style.fontWeight = 'bold';
  }
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

// Setup Socket.io listeners
function setupSocketListeners() {
  // Game started (when player 2 joins)
  socketService.onGameStarted((data) => {
    console.log('Game started:', data);
    currentGame = data.game;
    board = data.game.board;
    isMyTurn = (data.game.currentTurn === user);
    
    updateTurnLabel();
    updateScores();
    renderBoard();
    
    if (currentGame.status === 'active') {
      setMsg(isMyTurn ? "Game started! Your turn." : "Game started! Opponent's turn.");
    }
  });

  // Game state updated (after moves)
  socketService.onGameUpdated((data) => {
    console.log('Game updated:', data);
    currentGame = data.game;
    board = data.game.board;
    isMyTurn = (data.game.currentTurn === user);
    
    placedThisTurn = []; // Clear local placements
    
    updateTurnLabel();
    updateScores();
    renderBoard();
    
    if (data.lastMove) {
      if (data.lastMove.action === 'pass') {
        setMsg(`${data.lastMove.player} passed`);
      } else if (data.lastMove.action === 'swap') {
        setMsg(`${data.lastMove.player} swapped tiles`);
      } else if (data.lastMove.player === user) {
        setMsg(`Move submitted! +${data.lastMove.points} points`);
      } else {
        setMsg(`${data.lastMove.player} scored ${data.lastMove.points} points`);
      }
    }

    // If game finished or abandoned, show final scoreboard overlay
    if (currentGame.status === 'finished' || currentGame.status === 'abandoned' || currentGame.winner) {
      handleGameEnded(data);
    }
  });

  socketService.onGameEnded((data) => {
    console.log('Game ended:', data);
    handleGameEnded(data);
  });

  // Rack updated
  socketService.onRackUpdate((data) => {
    console.log('Rack updated:', data);
    rack = data.rack;
    renderRack();
  });

  // Chat message
  socketService.onChatMessage((data) => {
    console.log('Chat message:', data);
    displayChatMessage(data.username, data.message);
  });

  // Player disconnected
  socketService.onPlayerDisconnected((data) => {
    console.log('Player disconnected:', data);
    setMsg(`${data.username} disconnected`);
  });
}

// Button handlers
document.getElementById("undoBtn").onclick = () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  const last = placedThisTurn.pop();
  if (!last) return;

  board[last.row][last.col] = null;
  rack.push(last.tile);

  setMsg("");
  renderBoard();
  renderRack();
};

document.getElementById("shuffleBtn").onclick = () => {
  rack.sort(() => Math.random() - 0.5);
  renderRack();
};

document.getElementById("passBtn").onclick = () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  if (placedThisTurn.length > 0) {
    setMsg("Undo your tiles before passing.");
    return;
  }
  
  setMsg("Passing turn...");
  socketService.passTurn(gameId);
};

document.getElementById("swapBtn").onclick = () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  if (placedThisTurn.length > 0) {
    setMsg("Cannot swap tiles after placing. Undo first.");
    return;
  }
  
  if (!selectedTileId) {
    setMsg("Select tiles to swap first.");
    return;
  }
  
  const tileToSwap = rack.find(t => t.id === selectedTileId);
  if (!tileToSwap) return;
  
  setMsg("Swapping tile...");
  socketService.swapTiles(gameId, [selectedTileId]);
  selectedTileId = null;
};

document.getElementById("endGameBtn").onclick = () => {
  if (gameEnded) return;

  setMsg("Ending game...");
  socketService.endGame(gameId, 'manual');
};

document.getElementById("submitBtn").onclick = () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  if (placedThisTurn.length === 0) {
    setMsg("Place at least 1 tile first.");
    return;
  }

  setMsg("Submitting move...");

  const tilesPlacedData = placedThisTurn.map(p => ({
    row: p.row,
    col: p.col,
    tile: p.tile
  }));

  // Await server acknowledgement; revert UI if move invalid
  socketService.submitMove(gameId, tilesPlacedData)
    .then((res) => {
      // success — server will broadcast game-updated and rack-update
      placedThisTurn = [];
    })
    .catch((err) => {
      // revert placements back to rack and board
      setMsg('Move rejected: ' + (err.message || 'Invalid word'));
      placedThisTurn.forEach(p => {
        board[p.row][p.col] = null;
        rack.push(p.tile);
      });
      placedThisTurn = [];
      renderBoard();
      renderRack();
    });
};

// Chat functionality
document.getElementById("sendChatBtn").onclick = () => {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  socketService.sendChat(gameId, msg);
  input.value = "";
};

// Allow enter key for chat
document.getElementById("chatInput").onkeypress = (e) => {
  if (e.key === 'Enter') {
    document.getElementById("sendChatBtn").click();
  }
};

// Initialize game
async function initGame() {
  setupSocketListeners();
  
  setMsg("Connecting to server...");
  
  try {
    // Request current game state from server
    const gameState = await socketService.getGameState(gameId, user);
    
    console.log('Received game state:', gameState);
    
    // Update local state
    currentGame = gameState.game;
    board = gameState.game.board || board;
    rack = gameState.rack || [];
    isMyTurn = (gameState.game.currentTurn === user);
    
    // Update UI
    updateTurnLabel();
    updateScores();
    renderBoard();
    renderRack();
    
    // Show appropriate message
    if (gameState.status === 'waiting') {
      setMsg(`Waiting for opponent to join. Share room code: ${room}`);
    } else if (gameState.status === 'active') {
      setMsg(isMyTurn ? "Your turn! Place your tiles." : "Waiting for opponent...");
    }
  } catch (error) {
    console.error('Error loading game state:', error);
    setMsg('Error connecting to game: ' + (error.message || 'Unknown error'));
  }
}

// End-of-game UI helpers
function showEndGameOverlay(game) {
  const overlay = document.getElementById('endGameOverlay');
  const title = document.getElementById('endTitle');
  const winnerEl = document.getElementById('finalWinner');
  const scoresEl = document.getElementById('finalScores');

  title.textContent = game.status === 'abandoned' ? 'Game Abandoned' : 'Game Over';

  if (game.winner) {
    if (Array.isArray(game.winner)) {
      winnerEl.textContent = 'Winners: ' + game.winner.join(', ');
    } else {
      winnerEl.textContent = 'Winner: ' + game.winner;
    }
  } else {
    winnerEl.textContent = '';
  }

  scoresEl.innerHTML = '';
  if (game.finalScoreboard && Array.isArray(game.finalScoreboard)) {
    game.finalScoreboard.forEach(p => {
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('div');
      name.textContent = p.username;
      const sc = document.createElement('div');
      sc.textContent = p.score;
      row.appendChild(name);
      row.appendChild(sc);
      scoresEl.appendChild(row);
    });
  }

  overlay.style.display = 'flex';
}

function hideEndGameOverlay() {
  const overlay = document.getElementById('endGameOverlay');
  overlay.style.display = 'none';
}

document.getElementById('closeEndBtn').onclick = () => hideEndGameOverlay();

// Start the game
initGame();

