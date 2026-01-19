import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [supportCounts, setSupportCounts] = useState({ needSupport: 0, total: 0 });
  const [driverCounts, setDriverCounts] = useState({ available: 0 });
  const [vendorCounts, setVendorCounts] = useState({ orders: 0 });
  const [adminStats, setAdminStats] = useState({ orderCount: 0 });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const url = process.env.REACT_APP_SOCKET_URL || (process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace('/api','') : 'http://localhost:5000');

    const socket = io(url, {
      autoConnect: true,
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id, 'url=', url);
      setConnected(true);
    });
    socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      setConnected(false);
    });
    // Additional client-side debug handlers
    socket.on('connect_error', (err) => {
      try { console.warn('[socket] connect_error', err && err.message ? err.message : err); } catch (e) {}
    });
    socket.on('reconnect_attempt', (attempt) => {
      try { console.log('[socket] reconnect_attempt', attempt); } catch (e) {}
    });
    socket.on('reconnect_failed', () => {
      try { console.warn('[socket] reconnect_failed'); } catch (e) {}
    });
    socket.on('reconnect', (attempt) => {
      try { console.log('[socket] reconnect', attempt); } catch (e) {}
    });
    socket.on('connect_timeout', (timeout) => {
      try { console.warn('[socket] connect_timeout', timeout); } catch (e) {}
    });
    socket.on('supportCounts', (counts) => {
      try {
        console.debug('[socket] supportCounts', counts);
        setSupportCounts(counts || { needSupport: 0, total: 0 });
      } catch (e) {}
    });
    socket.on('driverCounts', (c) => {
      try { console.debug('[socket] driverCounts', c); setDriverCounts(c || { available: 0 }); } catch (e) {}
    });
    socket.on('vendorCounts', (c) => {
      try { console.debug('[socket] vendorCounts', c); setVendorCounts(c || { orders: 0 }); } catch (e) {}
    });
    socket.on('adminStats', (c) => {
      try { console.debug('[socket] adminStats', c); setAdminStats(c || { orderCount: 0 }); } catch (e) {}
    });
    socket.on('userUpdated', (payload) => {
      try { console.debug('[socket] userUpdated', payload); } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('userUpdated', { detail: payload })); } catch (e) {}
    });
    // productUpdate events handled by consumers if needed

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
    const wrapper = (payload) => {
      try { console.debug('[socket] event', event, payload); } catch (e) {}
      try { cb(payload); } catch (e) { console.error('socket handler error', e); }
    };
    socketRef.current?.on(event, wrapper);
    return () => socketRef.current?.off(event, wrapper);
  };

  const joinConversation = async (conversationId) => {
    if (!socketRef.current) return null;
    try {
      if (emitWithAck) return await emitWithAck('joinConversation', { conversationId });
      return new Promise((res, rej) => socketRef.current.emit('joinConversation', { conversationId }, (err, r) => err ? rej(err) : res(r)));
    } catch (e) { return null; }
  };

  const leaveConversation = async (conversationId) => {
    if (!socketRef.current) return null;
    try {
      if (emitWithAck) return await emitWithAck('leaveConversation', { conversationId });
      return new Promise((res, rej) => socketRef.current.emit('leaveConversation', { conversationId }, (err, r) => err ? rej(err) : res(r)));
    } catch (e) { return null; }
  };

  const sendMessage = async (conversationId, text, attachments = []) => {
    if (!socketRef.current) return null;
    try {
      if (emitWithAck) return await emitWithAck('sendMessage', { conversationId, text, attachments });
      return new Promise((res, rej) => socketRef.current.emit('sendMessage', { conversationId, text, attachments }, (err, r) => err ? rej(err) : res(r)));
    } catch (e) { return null; }
  };

  const emitWithAck = (event, payload, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) return reject(new Error('no-socket'));
      let called = false;
      try {
        socket.emit(event, payload, (err, res) => {
          called = true;
          if (err) return reject(err);
          return resolve(res);
        });
      } catch (e) {
        return reject(e);
      }
      setTimeout(() => { if (!called) reject(new Error('socket-ack-timeout')); }, timeout);
    });
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, supportCounts, driverCounts, vendorCounts, adminStats, joinOrder, leaveOrder, joinProducts, leaveProducts, on, emitWithAck, joinConversation, leaveConversation, sendMessage }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
