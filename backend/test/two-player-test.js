const io = require('socket.io-client');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

async function run() {
  console.log('Connecting to server', SERVER);

  const a = io(SERVER, { transports: ['websocket'] });
  const b = io(SERVER, { transports: ['websocket'] });

  a.on('connect', () => console.log('A connected', a.id));
  b.on('connect', () => console.log('B connected', b.id));

  // Wait for both to connect
  await new Promise(resolve => setTimeout(resolve, 500));

  // Create game as A
  a.emit('create-game', { username: 'playerA' });

  a.once('game-created', (data) => {
    console.log('A created game', data.roomCode, data.gameId);
    const roomCode = data.roomCode;
    const gameId = data.gameId;

    // B joins
    b.emit('join-game', { username: 'playerB', roomCode });

    // Wait for game-started
    b.once('game-started', (d) => {
      console.log('B received game-started');
    });

    // Capture rack-update for A so we can pick real tile ids
    a.once('rack-update', (r) => {
      console.log('A rack-update received, rack length:', r.rack?.length ?? r.length ?? 'unknown');
    });

    // After a small delay, request game state and then submit a move using A's current rack
    setTimeout(async () => {
      // ask server for current game state via get-game-state flow
      a.emit('get-game-state', { gameId, username: 'playerA' });
      a.once('game-state', (gs) => {
        console.log('A game-state received. Rack length:', gs.rack.length);
        // pick up to 3 tiles from rack
        const tiles = gs.rack.slice(0, 3);
        if (tiles.length === 0) {
          console.error('No tiles to play');
          a.disconnect(); b.disconnect();
          process.exit(1);
        }

        // Place them horizontally at center
        const startCol = 7;
        const tilesPlaced = tiles.map((t, i) => ({ row: 7, col: startCol + i, tile: t }));

        console.log('A submitting move with tiles:', tiles.map(t => t.letter).join(''));

        a.emit('submit-move', { gameId, tilesPlaced }, (resp) => {
          console.log('Submit ack:', resp);
          // Query server /games to inspect in-memory games
          setTimeout(() => {
            const http = require('http');
            http.get(`${SERVER.replace('http://','http://')}/games`, (res) => {
              let body = '';
              res.on('data', ch => body += ch);
              res.on('end', () => {
                console.log('/games response:', body);
                a.disconnect(); b.disconnect();
                process.exit(0);
              });
            }).on('error', (e) => { console.error('Error fetching /games', e); a.disconnect(); b.disconnect(); process.exit(0); });
          }, 500);
        });
      });
    }, 1000);
  });
}

run();
