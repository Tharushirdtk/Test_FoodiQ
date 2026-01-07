import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/apiClient';

const SocketContext = createContext(null);

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const url = process.env.REACT_APP_SOCKET_URL || (process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace('/api','') : 'http://localhost:5000');

    const socket = io(url, {
      autoConnect: true,
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      try { socket.disconnect(); } catch (e) {}
    };
  }, []);

  const joinOrder = (orderId) => {
    try { socketRef.current?.emit('joinOrder', { orderId }); } catch (e) {}
  };

  const leaveOrder = (orderId) => {
    try { socketRef.current?.emit('leaveOrder', { orderId }); } catch (e) {}
  };

  const joinProducts = () => { try { socketRef.current?.emit('joinProducts'); } catch (e) {} };
  const leaveProducts = () => { try { socketRef.current?.emit('leaveProducts'); } catch (e) {} };

  const on = (event, cb) => {
    socketRef.current?.on(event, cb);
    return () => socketRef.current?.off(event, cb);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, joinOrder, leaveOrder, joinProducts, leaveProducts, on }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
