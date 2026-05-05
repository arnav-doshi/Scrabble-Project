const boardEl = document.getElementById("board");
const rackEl  = document.getElementById("rack");

const room = localStorage.getItem("scrabble_room") || "AB12";
const user = localStorage.getItem("scrabble_user") || "Player";

document.getElementById("roomLabel").textContent = room;
document.getElementById("userLabel").textContent = user;

let selectedTileId = null;

// Board models: 15x15, each cell is  going  to null or letter, points, and  id
const board = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null));

// Track tiles placed this turn (Undo / Submit UI)
let placedThisTurn = []; // row,col,tile

//  Real Scrabble bonus layout
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

// Simple points ( for UI demo)
const POINTS = {
  A:1, E:1, I:1, O:1, U:1, L:1, N:1, S:1, T:1, R:1,
  D:2, G:2,
  B:3, C:3, M:3, P:3,
  F:4, H:4, V:4, W:4, Y:4,
  K:5,
  J:8, X:8,
  Q:10, Z:10
};

// Initial rack (I can change letters)
let rack = ["A","T","E","R","S","L","O"].map((ch, i) => ({
  id: "t" + (i+1),
  letter: ch,
  points: POINTS[ch] ?? 1
}));

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
      selectedTileId = (selectedTileId === t.id) ? null : t.id;
      renderRack();
    };

    rackEl.appendChild(el);
  });
}

function onCellClick(r, c) {
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

// Buttons
document.getElementById("undoBtn").onclick = () => {
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
  setMsg("Pass (frontend-only).");
};

document.getElementById("swapBtn").onclick = () => {
  setMsg("Swap (frontend-only).");
};

document.getElementById("submitBtn").onclick = () => {
  if (placedThisTurn.length === 0) {
    setMsg("Place at least 1 tile first.");
    return;
  }

  // Frontend-only: just “lock” the move by clearing the placed list
  placedThisTurn = [];
  setMsg("Submitted! (frontend-only demo)");
};

// Chat (local UI)
document.getElementById("sendChatBtn").onclick = () => {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  const box = document.getElementById("chatBox");
  const line = document.createElement("div");
  line.textContent = `${user}: ${msg}`;
  box.appendChild(line);

  input.value = "";
  box.scrollTop = box.scrollHeight;
};

// Start
renderBoard();

renderRack();

