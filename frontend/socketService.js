// Socket.io Client Service - Replaces Supabase Realtime

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.serverUrl = 'http://localhost:3000'; // Configure for production
  }

  connect() {
    if (this.socket) return;
    
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to game server');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      this.connected = false;
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  // CREATE GAME
  createGame(username) {
    return new Promise((resolve, reject) => {
      this.socket.emit('create-game', { username });
      
      this.socket.once('game-created', (data) => {
        resolve(data);
      });
      
      this.socket.once('error', (error) => {
        reject(error);
      });
    });
  }

  // JOIN GAME
  joinGame(username, roomCode) {
    return new Promise((resolve, reject) => {
      this.socket.emit('join-game', { username, roomCode });
      
      this.socket.once('game-started', (data) => {
        resolve(data);
      });
      
      this.socket.once('error', (error) => {
        reject(error);
      });
    });
  }

  // SUBMIT MOVE
  submitMove(gameId, tilesPlaced) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      this.socket.emit('submit-move', { gameId, tilesPlaced }, (response) => {
        if (!response) return reject(new Error('No response from server'));
        if (response.success) return resolve(response.result);
        return reject(new Error(response.message || 'Move rejected'));
      });
      // Fallback error listener (in case ack not called)
      this.socket.once('error', (err) => {
        reject(err || new Error('Socket error'));
      });
    });
  }

  // PASS TURN
  passTurn(gameId) {
    this.socket.emit('pass-turn', { gameId });
  }

  // SWAP TILES
  swapTiles(gameId, tileIds) {
    this.socket.emit('swap-tiles', { gameId, tileIds });
  }

  // SEND CHAT
  sendChat(gameId, message) {
    this.socket.emit('chat-message', { gameId, message });
  }

  // GET GAME STATE (for loading/reconnecting)
  getGameState(gameId, username) {
    return new Promise((resolve, reject) => {
      this.socket.emit('get-game-state', { gameId, username });
      
      this.socket.once('game-state', (data) => {
        resolve(data);
      });
      
      this.socket.once('error', (error) => {
        reject(error);
      });
    });
  }

  // LISTENERS
  onGameUpdated(callback) {
    this.socket.on('game-updated', callback);
  }

  onRackUpdate(callback) {
    this.socket.on('rack-update', callback);
  }

  onChatMessage(callback) {
    this.socket.on('chat-message', callback);
  }

  onPlayerDisconnected(callback) {
    this.socket.on('player-disconnected', callback);
  }

  onGameStarted(callback) {
    this.socket.on('game-started', callback);
  }

  // Remove listener
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  // Remove all listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}

// Export singleton instance
const socketService = new SocketService();

