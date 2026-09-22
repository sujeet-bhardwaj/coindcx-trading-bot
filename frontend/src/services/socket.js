import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    socket = io(BACKEND_URL || '/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('⚡ Socket.IO connected to backend:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket.IO disconnected from backend');
    });
  }
  return socket;
}

export default getSocket;
