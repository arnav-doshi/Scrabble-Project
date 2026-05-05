// game.js - Multiplayer Scrabble Game with Supabase Backend

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

// Initialize Supabase will be awaited during init

let selectedTileId = null;
let currentGame = null;
let board = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null));
let placedThisTurn = []; // {row, col, tile}
let rack = [];
let isMyTurn = false;

// Bonus squares configuration
const BONUS = {};
function setBonus(r,c,type){ BONUS[`${r},${c}`]=type; }

// TW
[
 [0,0],[0,7],[0,14],
 [7,0],[7,14],
 [14,0],[14,7],[14,14]
].forEach(([r,c]) => setBonus(r,c,"TW"));

// DW (includes center)
[
 [1,1],[2,2],[3,3],[4,4],
 [10,10],[11,11],[12,12],[13,13],
 [1,13],[2,12],[3,11],[4,10],
 [10,4],[11,3],[12,2],[13,1],
 [7,7]
].forEach(([r,c]) => setBonus(r,c,"DW"));

// TL
[
 [1,5],[1,9],
 [5,1],[5,5],[5,9],[5,13],
 [9,1],[9,5],[9,9],[9,13],
 [13,5],[13,9]
].forEach(([r,c]) => setBonus(r,c,"TL"));

// DL
[
 [0,3],[0,11],
 [2,6],[2,8],
 [3,0],[3,7],[3,14],
 [6,2],[6,6],[6,8],[6,12],
 [7,3],[7,11],
 [8,2],[8,6],[8,8],[8,12],
 [11,0],[11,7],[11,14],
 [12,6],[12,8],
 [14,3],[14,11]
].forEach(([r,c]) => setBonus(r,c,"DL"));

// Simple points
const POINTS = {
  A:1, E:1, I:1, O:1, U:1, L:1, N:1, S:1, T:1, R:1,
  D:2, G:2,
  B:3, C:3, M:3, P:3,
  F:4, H:4, V:4, W:4, Y:4,
  K:5,
  J:8, X:8,
  Q:10, Z:10
};

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
  if (!currentGame) return;
  
  const isPlayer1 = currentGame.player1_username === user;
  const myScore = isPlayer1 ? currentGame.player1_score : currentGame.player2_score;
  const opScore = isPlayer1 ? currentGame.player2_score : currentGame.player1_score;
  
  document.getElementById("myScore").textContent = myScore || 0;
  document.getElementById("opScore").textContent = opScore || 0;
}

// Calculate points for placed tiles (simplified scoring)
function calculatePoints() {
  if (placedThisTurn.length === 0) return 0;
  
  let points = 0;
  let wordMultiplier = 1;
  
  placedThisTurn.forEach(({ row, col, tile }) => {
    let tilePoints = tile.points;
    const bonus = BONUS[`${row},${col}`];
    
    if (bonus === "DL") tilePoints *= 2;
    if (bonus === "TL") tilePoints *= 3;
    if (bonus === "DW") wordMultiplier *= 2;
    if (bonus === "TW") wordMultiplier *= 3;
    
    points += tilePoints;
  });
  
  points *= wordMultiplier;
  
  // 7-tile bonus (bingo)
  if (placedThisTurn.length === 7) {
    points += 50;
  }
  
  return points;
}

// Load initial game state
async function loadGameState() {
  try {
    const game = await GameService.getGame(room);
    currentGame = game;
    
    // Load board
    if (game.board && Array.isArray(game.board)) {
      board = game.board;
    }
    
    // Load player's rack
    const playerRack = await GameService.getPlayerRack(gameId, user);
    rack = playerRack || [];
    
    // Check turn
    isMyTurn = game.current_turn === user;
    
    // Update UI
    updateTurnLabel();
    updateScores();
    renderBoard();
    renderRack();
    
    // Check if waiting for player 2
    if (game.status === 'waiting') {
      setMsg(`Waiting for opponent to join. Share room code: ${room}`);
    } else if (game.status === 'active') {
      setMsg(isMyTurn ? "Your turn! Place your tiles." : "Waiting for opponent...");
    }
    
    // Load chat history
    const messages = await GameService.getChatMessages(gameId);
    messages.forEach(msg => {
      displayChatMessage(msg.username, msg.message);
    });
    
  } catch (error) {
    console.error('Error loading game state:', error);
    setMsg("Error loading game: " + error.message);
  }
}

// Display chat message
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

// Setup realtime subscriptions
function setupRealtimeSubscriptions() {
  RealtimeService.subscribeToAll(gameId, {
    onGameUpdate: (game) => {
      console.log('Game updated:', game);
      currentGame = game;
      
      // Update board
      if (game.board && Array.isArray(game.board)) {
        board = game.board;
        placedThisTurn = []; // Clear local placed tiles after server update
        renderBoard();
      }
      
      // Update turn
      isMyTurn = game.current_turn === user;
      updateTurnLabel();
      updateScores();
      
      if (game.status === 'active' && isMyTurn) {
        setMsg("Your turn! Place your tiles.");
        
        // Reload rack to get new tiles
        GameService.getPlayerRack(gameId, user).then(playerRack => {
          rack = playerRack || [];
          renderRack();
        });
      }
    },
    
    onNewMessage: (message) => {
      console.log('New chat message:', message);
      if (message.username !== user) {
        displayChatMessage(message.username, message.message);
      }
    },
    
    onNewMove: (move) => {
      console.log('New move:', move);
      if (move.player_username !== user) {
        setMsg(`${move.player_username} made a move (+${move.points_earned} points)`);
      }
    }
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

document.getElementById("passBtn").onclick = async () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  if (placedThisTurn.length > 0) {
    setMsg("Undo your tiles before passing.");
    return;
  }
  
  try {
    setMsg("Passing turn...");
    await GameService.passTurn(gameId, user);
    setMsg("Turn passed.");
  } catch (error) {
    console.error('Error passing turn:', error);
    setMsg("Error: " + error.message);
  }
};

document.getElementById("swapBtn").onclick = async () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  if (placedThisTurn.length > 0) {
    setMsg("Cannot swap tiles after placing. Undo first.");
    return;
  }
  
  // Simple swap: swap all selected tiles (in a real game, you'd select specific tiles)
  if (!selectedTileId) {
    setMsg("Select tiles to swap first.");
    return;
  }
  
  const tileToSwap = rack.find(t => t.id === selectedTileId);
  if (!tileToSwap) return;
  
  try {
    setMsg("Swapping tile...");
    await GameService.swapTiles(gameId, user, [tileToSwap]);
    setMsg("Tile swapped. Turn passed.");
  } catch (error) {
    console.error('Error swapping tiles:', error);
    setMsg("Error: " + error.message);
  }
};

document.getElementById("submitBtn").onclick = async () => {
  if (!isMyTurn) {
    setMsg("It's not your turn!");
    return;
  }
  
  if (placedThisTurn.length === 0) {
    setMsg("Place at least 1 tile first.");
    return;
  }

  try {
    setMsg("Submitting move...");
    
    const points = calculatePoints();
    const tilesPlacedData = placedThisTurn.map(p => ({
      row: p.row,
      col: p.col,
      letter: p.tile.letter,
      points: p.tile.points
    }));
    
    await GameService.submitMove(gameId, user, tilesPlacedData, board, points);
    
    placedThisTurn = [];
    setMsg(`Move submitted! +${points} points`);
    
  } catch (error) {
    console.error('Error submitting move:', error);
    setMsg("Error: " + error.message);
  }
};

// Chat functionality
document.getElementById("sendChatBtn").onclick = async () => {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  try {
    await GameService.sendChatMessage(gameId, user, msg);
    displayChatMessage(user, msg);
    input.value = "";
  } catch (error) {
    console.error('Error sending chat:', error);
  }
};

// Allow enter key for chat
document.getElementById("chatInput").onkeypress = (e) => {
  if (e.key === 'Enter') {
    document.getElementById("sendChatBtn").click();
  }
};

// Initialize game
async function initGame() {
  await initSupabase();
  await loadGameState();
  setupRealtimeSubscriptions();
}

// Start the game
initGame();

