const { Server } = require('socket.io');
const config = require('../config/env');

class WebSocketService {
  constructor() {
    this.io = null;
    this.tradingBot = null;
  }

  initialize(httpServer, tradingBot) {
    this.tradingBot = tradingBot;
    const corsOrigin = config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim());

    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Authorization', 'x-api-key'],
      },
    });

    console.log('📡 WebSocket Server initialized with Socket.IO');

    this.io.on('connection', (socket) => {
      console.log(`🔌 Frontend client connected: ${socket.id}`);

      // Helper to verify socket command authorization
      const isAuthorized = () => {
        if (!config.apiSecretKey) return true;
        const authToken =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.['authorization']?.replace(/^Bearer\s+/i, '') ||
          socket.handshake.headers?.['x-api-key'];

        return authToken === config.apiSecretKey;
      };

      // Send initial state immediately
      if (this.tradingBot) {
        socket.emit('bot_status', this.tradingBot.getStatus());
      }

      // Handle direct real-time commands from frontend (authenticated)
      socket.on('start_bot', async () => {
        if (!isAuthorized()) {
          socket.emit('command_response', { success: false, message: 'Unauthorized: Invalid or missing API key' });
          return;
        }
        if (this.tradingBot) {
          const res = await this.tradingBot.start();
          socket.emit('command_response', res);
        }
      });

      socket.on('stop_bot', async () => {
        if (!isAuthorized()) {
          socket.emit('command_response', { success: false, message: 'Unauthorized: Invalid or missing API key' });
          return;
        }
        if (this.tradingBot) {
          const res = await this.tradingBot.stop();
          socket.emit('command_response', res);
        }
      });

      socket.on('emergency_stop', async () => {
        if (!isAuthorized()) {
          socket.emit('command_response', { success: false, message: 'Unauthorized: Invalid or missing API key' });
          return;
        }
        if (this.tradingBot) {
          const res = await this.tradingBot.emergencyStop();
          socket.emit('command_response', res);
        }
      });

      socket.on('reset_emergency_stop', async () => {
        if (!isAuthorized()) {
          socket.emit('command_response', { success: false, message: 'Unauthorized: Invalid or missing API key' });
          return;
        }
        if (this.tradingBot) {
          const res = await this.tradingBot.resetEmergencyStop();
          socket.emit('command_response', res);
        }
      });

      socket.on('update_settings', async (newSettings) => {
        if (!isAuthorized()) {
          socket.emit('command_response', { success: false, message: 'Unauthorized: Invalid or missing API key' });
          return;
        }
        if (this.tradingBot) {
          try {
            const updated = await this.tradingBot.updateSettings(newSettings);
            this.io.emit('bot_status', updated);
            socket.emit('command_response', { success: true, message: 'Settings updated successfully' });
          } catch (err) {
            socket.emit('command_response', { success: false, message: err.message });
          }
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Frontend client disconnected: ${socket.id}`);
      });
    });

    // Hook into trading bot state changes
    if (this.tradingBot) {
      this.tradingBot.setStateChangeCallback((event, data) => {
        if (this.io) {
          if (event === 'log') {
            this.io.emit('bot_log', data);
          } else if (event === 'tick') {
            this.io.emit('price_tick', data);
          } else {
            this.io.emit('bot_status', this.tradingBot.getStatus());
          }
        }
      });
    }
  }

  broadcast(event, payload) {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }
}

module.exports = new WebSocketService();
