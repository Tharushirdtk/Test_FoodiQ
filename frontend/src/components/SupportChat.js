import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import supportChatService from '../services/supportChatService';
import conversationService from '../services/conversationService';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/SupportChat.module.css';
import LoadingSpinner from './LoadingSpinner';

export default function SupportChat({ conversationId, onClose, inline = false, title = 'Support' }) {
  const { joinConversation, leaveConversation, sendMessage, on } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [joined, setJoined] = useState(false);
  const mounted = useRef(false);
  const listRef = useRef(null);

  useEffect(() => {
    let offMessage, offViewers, offStatus;
    mounted.current = true;

    const load = async () => {
      setLoading(true);
      try {
        // Try the privileged support route first (support/admin)
        let data;
        try {
          data = await supportChatService.getMessages(conversationId);
          // data is { conversation, messages }
        } catch (err) {
          // If not a support conversation or access denied, try the generic conversation API
          try {
            data = await conversationService.getConversation(conversationId);
            // conversationService returns { conversation, messages }
          } catch (e) {
            // Final fallback: try to return the user's own support conversation
            try {
              data = await supportChatService.getMyConversation();
              if (data && data.conversation && data.conversation._id && data.conversation._id.toString() !== conversationId.toString()) {
                data = { conversation: null, messages: [] };
              }
            } catch (ee) {
              throw err; // rethrow original error if all fallbacks fail
            }
          }
        }
        if (!mounted.current) return;
          console.debug('SupportChat: loaded messages', { conversationId, count: (data.messages || []).length, conversation: data.conversation && data.conversation._id });
          setMessages(data.messages || []);
        // join socket conversation room (wait for ack)
        try { await joinConversation(conversationId); setJoined(true); } catch (e) { setJoined(false); }

        // subscribe to incoming messages
        offMessage = on('message', (payload) => {
          // payload may be { conversationId, message } or a raw message
          console.debug('SupportChat: incoming message payload', payload);
          const msg = (payload && payload.message) ? payload.message : payload;
          const convId = payload && payload.conversationId ? payload.conversationId : (msg && msg.conversation);
          if (!msg) return;
          if (convId && convId.toString() !== conversationId.toString()) return;
          // ensure sender is normalized (server populates sender but optimistic messages may not)
          let senderObj = msg.sender ? { ...msg.sender } : (msg.senderName ? { name: msg.senderName } : { name: 'User' });
          if (!senderObj.name && senderObj.displayName) senderObj.name = senderObj.displayName;
          // normalize avatar URL if present
          if (senderObj.avatar) {
            console.debug('SupportChat: normalizing avatar', senderObj.avatar);
            senderObj.avatar = getAvatarUrl(senderObj.avatar);
            console.debug('SupportChat: avatar url =', senderObj.avatar);
          }
          const normalized = { ...msg, sender: senderObj };
          setMessages(prev => {
            // dedupe by _id
            if (normalized._id && prev.some(x => x._id && x._id.toString() === normalized._id.toString())) return prev;
            // try to replace matching optimistic message (same text and pending)
            let replaced = false;
            const next = prev.map(m => {
              if (m.pending && m.text === normalized.text) {
                replaced = true;
                return normalized;
              }
              return m;
            });
            if (replaced) return next;
            // additional dedupe: avoid adding message with same text, sender and createdAt
            if (prev.some(x => x.text === normalized.text && ((x.createdAt && normalized.createdAt && x.createdAt === normalized.createdAt) || (x.sender && normalized.sender && ((x.sender._id && normalized.sender._id && x.sender._id.toString() === normalized.sender._id.toString()) || (x.sender.name && normalized.sender.name && x.sender.name === normalized.sender.name)))))) {
              return prev;
            }
            return [...prev, normalized];
          });
        });

        // viewers updates (optional)
        offViewers = on('viewers', (payload) => {
          try { console.debug('SupportChat: viewers', payload); } catch (e) {}
          // payload: { conversationId, viewers }
          try {
            const convId = payload && payload.conversationId;
            if (convId && convId.toString() !== conversationId.toString()) return;
            setViewers(Array.isArray(payload.viewers) ? payload.viewers : (payload.viewers ? [payload.viewers] : []));
          } catch (e) {}
        });

        offStatus = on('statusUpdated', (payload) => {
          console.debug('SupportChat: statusUpdated', payload);
          // payload: { conversationId, status }
        });
      } catch (e) {
        console.error('load messages', e);
      }
      finally {
        try { if (mounted.current) setLoading(false); } catch (e) {}
      }
    };

    load();

    return () => {
      mounted.current = false;
      try { leaveConversation(conversationId); } catch (e) {}
      try { offMessage && offMessage(); } catch (e) {}
      try { offViewers && offViewers(); } catch (e) {}
      try { offStatus && offStatus(); } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  

  const handleSend = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    console.debug('SupportChat: sending message', { conversationId, body });
    // optimistic local echo
    const optimistic = {
      _id: `temp-${Date.now()}`,
      text: body,
      senderId: user?._id,
      sender: { name: user?.displayName || user?.email },
      createdAt: new Date().toISOString(),
      pending: true
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      if (!joined) {
        try { await joinConversation(conversationId); setJoined(true); } catch (e) { setJoined(false); }
      }
      await sendMessage(conversationId, body, []);
      // server will broadcast the authoritative message; we'll reconcile by id
    } catch (e) {
      console.error('send message', e);
      // mark last as failed
      setMessages(prev => prev.map(m => m._id === optimistic._id ? { ...m, failed: true } : m));
    }
  };

  const getAvatarUrl = (avatar) => {
    if (!avatar) return null;
    try {
      console.debug('getAvatarUrl input:', avatar);
      if (/^https?:\/\//.test(avatar)) return avatar;
      // Prefer explicit backend API URL when available; fall back to a sensible dev backend host
      const defaultBackendPort = '5000';
      const inferredBackend = `${window.location.protocol}//${window.location.hostname}:${defaultBackendPort}`;
      const api = (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()) ? process.env.REACT_APP_API_URL : inferredBackend;
      const base = api.replace(/\/api\/?$/, '');
      if (avatar.startsWith('/')) {
        const url = base + avatar;
        console.debug('getAvatarUrl output:', url);
        return url;
      }
      const url = `${base}/uploads/avatars/${avatar}`;
      console.debug('getAvatarUrl output:', url);
      return url;
    } catch (e) {
      return avatar;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (!listRef.current) return;
    try {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    } catch (e) {}
  }, [messages]);

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '' + iso; }
  };

  const isSameDay = (a, b) => {
    const da = new Date(a).toDateString();
    const db = new Date(b).toDateString();
    return da === db;
  };

  // Normalize messages to an array to avoid runtime errors when API
  // returns a single object or null. This prevents `messages.map` from
  // throwing when the value is not an array.
  const displayMessages = Array.isArray(messages) ? messages : (messages ? [messages] : []);

  return (
    <div className={`${styles.supportChat} ${inline ? styles.inline : ''}`}>
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={styles.title}>{title}</div>
          {/* show viewer count for support users only */}
          {(user && (user.role === 'support' || user.role === 'admin') && viewers && viewers.length > 0) && (
            <div style={{ fontSize: 12, color: 'var(--text-gray, #666)', background: 'var(--muted-bg, rgba(0,0,0,0.05))', padding: '4px 8px', borderRadius: 12 }}>
              Viewers: {viewers.length}
            </div>
          )}
        </div>
        {onClose && <button className={styles.closeBtn} onClick={onClose}>Close</button>}
      </div>
      <div className={styles.messages} ref={listRef}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <LoadingSpinner size={48} />
          </div>
        ) : displayMessages.map((m, idx) => {
          const prev = displayMessages[idx - 1];
          const getSenderId = (msg) => msg && (msg.senderId || (msg.sender && (msg.sender._id || msg.sender.id)) || null);
          const senderId = getSenderId(m);
          const prevSenderId = getSenderId(prev);
          const me = senderId && user?._id && senderId.toString() === user._id.toString();
          const showAvatar = !prev || prevSenderId !== senderId;
          const showDateDivider = !prev || !isSameDay(prev.createdAt || prev.createdAt || Date.now(), m.createdAt || Date.now());
          const key = m._id || m.id || `${idx}-${m.createdAt}`;
          return (
            <React.Fragment key={key}>
              {showDateDivider && (
                <div className={styles.dateDivider}>{new Date(m.createdAt).toLocaleDateString()}</div>
              )}
              <div className={`${styles.messageRow} ${me ? styles.me : styles.other}`}>
                {showAvatar && !me && (
                  (m.sender && (m.sender.role === 'support' || m.sender.role === 'admin')) ? (
                    <img src="/images/logo.png" alt="Support" className={styles.avatarImg} />
                  ) : (
                      (m.sender && m.sender.avatar) ? (
                        <img src={getAvatarUrl(m.sender.avatar)} alt={m.sender.name || m.sender.displayName || 'User'} className={styles.avatarImg} />
                    ) : (
                      <div className={styles.avatar}>{(m.sender && m.sender.name ? m.sender.name.split(' ').map(n=>n[0]).slice(0,2).join('') : 'S')}</div>
                    )
                  )
                )}
                <div className={styles.bubble} data-me={me} data-pending={m.pending} data-failed={m.failed}>
                  <div className={styles.text}>{m.text}</div>
                  <div className={styles.ts}>{formatTime(m.createdAt)}</div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className={styles.inputRow}>
        <input className={styles.input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." />
        <button className={styles.send} onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
