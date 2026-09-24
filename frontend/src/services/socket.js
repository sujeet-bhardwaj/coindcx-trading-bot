import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const API_SECRET_KEY = import.meta.env.VITE_API_SECRET_KEY || 'dev-secret-key';

    socket = io(BACKEND_URL || '/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 3000,
      auth: {
        token: API_SECRET_KEY,
      },
    });

    socket.on('connect', () => {
      console.log('⚡ Socket.IO connected to backend:', socket.id);
    });

    socket.on('reconnect', (attempt) => {
      console.log('🔄 Socket.IO reconnected to backend on attempt:', attempt);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket.IO temporarily disconnected from backend:', reason);
    });
  }
  return socket;
}

export default getSocket;
