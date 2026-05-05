// Realtime Service - Handles Supabase real-time subscriptions

const RealtimeService = {
  subscriptions: {},

  // Subscribe to game updates
  subscribeToGame(gameId, callbacks) {
    const subscription = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        (payload) => {
          console.log('Game updated:', payload);
          if (callbacks.onGameUpdate) {
            callbacks.onGameUpdate(payload.new);
          }
        }
      )
      .subscribe();

    this.subscriptions[`game:${gameId}`] = subscription;
    return subscription;
  },

  // Subscribe to chat messages
  subscribeToChat(gameId, callbacks) {
    const subscription = supabase
      .channel(`chat:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('New chat message:', payload);
          if (callbacks.onNewMessage) {
            callbacks.onNewMessage(payload.new);
          }
        }
      )
      .subscribe();

    this.subscriptions[`chat:${gameId}`] = subscription;
    return subscription;
  },

  // Subscribe to game moves
  subscribeToMoves(gameId, callbacks) {
    const subscription = supabase
      .channel(`moves:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_moves',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('New move:', payload);
          if (callbacks.onNewMove) {
            callbacks.onNewMove(payload.new);
          }
        }
      )
      .subscribe();

    this.subscriptions[`moves:${gameId}`] = subscription;
    return subscription;
  },

  // Subscribe to player racks (for opponent updates)
  subscribeToRacks(gameId, callbacks) {
    const subscription = supabase
      .channel(`racks:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'player_racks',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('Rack updated:', payload);
          if (callbacks.onRackUpdate) {
            callbacks.onRackUpdate(payload.new);
          }
        }
      )
      .subscribe();

    this.subscriptions[`racks:${gameId}`] = subscription;
    return subscription;
  },

  // Subscribe to all game-related updates at once
  subscribeToAll(gameId, callbacks) {
    this.subscribeToGame(gameId, {
      onGameUpdate: callbacks.onGameUpdate
    });

    this.subscribeToChat(gameId, {
      onNewMessage: callbacks.onNewMessage
    });

    this.subscribeToMoves(gameId, {
      onNewMove: callbacks.onNewMove
    });

    if (callbacks.onRackUpdate) {
      this.subscribeToRacks(gameId, {
        onRackUpdate: callbacks.onRackUpdate
      });
    }
  },

  // Unsubscribe from a specific channel
  unsubscribe(channelKey) {
    if (this.subscriptions[channelKey]) {
      this.subscriptions[channelKey].unsubscribe();
      delete this.subscriptions[channelKey];
    }
  },

  // Unsubscribe from all channels
  unsubscribeAll() {
    Object.keys(this.subscriptions).forEach(key => {
      this.subscriptions[key].unsubscribe();
    });
    this.subscriptions = {};
  },

  // Check subscription status
  getStatus(channelKey) {
    return this.subscriptions[channelKey]?.state || 'not_subscribed';
  }
};

