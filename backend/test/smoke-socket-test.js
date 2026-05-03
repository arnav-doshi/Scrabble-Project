// Simple smoke test using socket.io-client to exercise submit-move validation
const io = require('socket.io-client');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

async function run() {
  console.log('Connecting to server', SERVER);
  const socket = io(SERVER, { transports: ['websocket'] });

  socket.on('connect', async () => {
    console.log('Connected as', socket.id);

    // Create game
    socket.emit('create-game', { username: 'smokeA' });

    socket.once('game-created', async (data) => {
      console.log('Game created:', data.roomCode, data.gameId);
      const gameId = data.gameId;

      // Wait briefly then submit an intentionally invalid move (fake tiles)
      setTimeout(() => {
        const tilesPlaced = [
          { row: 7, col: 7, tile: { id: 'f1', letter: 'q', points: 10 } },
          { row: 7, col: 8, tile: { id: 'f2', letter: 'z', points: 10 } }
        ];

        console.log('Submitting fake invalid move:', tilesPlaced.map(t => t.tile.letter).join(''));

        socket.emit('submit-move', { gameId, tilesPlaced }, (resp) => {
          console.log('Submit-move ack:', resp);
          socket.disconnect();
          process.exit(0);
        });
      }, 1000);
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });
  });
}

run();
