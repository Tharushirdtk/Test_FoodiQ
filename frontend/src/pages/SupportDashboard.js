import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supportChatService from '../services/supportChatService';
import NotificationsButton from '../components/NotificationsButton';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import '../styles/AccountPage.css';
import styles from '../styles/SupportDashboard.module.css';

export default function SupportDashboard() {
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState({ needSupport: [], supportProvided: [] });
  // selected conversation handled via dedicated page route

  const load = async () => {
    setLoading(true);
    try {
      const data = await supportChatService.list();
      // Accept a couple of possible shapes
      if (data.needSupport || data.supportProvided) {
        setLists({ needSupport: data.needSupport || [], supportProvided: data.supportProvided || [] });
      } else if (Array.isArray(data)) {
        // fallback: split by status
        const need = data.filter(c => c.status === 'need support');
        const prov = data.filter(c => c.status !== 'need support');
        setLists({ needSupport: need, supportProvided: prov });
      } else {
        setLists({ needSupport: [], supportProvided: [] });
      }
    } catch (e) {
      console.error('load chats', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // subscribe to realtime viewers updates via socket
  const { on } = useSocket();
  const navigate = useNavigate();
  const { user } = useAuth();

  const getAvatarUrl = (avatar) => {
    if (!avatar) return null;
    try {
      if (/^https?:\/\//.test(avatar)) return avatar;
      const defaultBackendPort = '5000';
      const inferredBackend = `${window.location.protocol}//${window.location.hostname}:${defaultBackendPort}`;
      const api = (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()) ? process.env.REACT_APP_API_URL : inferredBackend;
      const base = api.replace(/\/api\/?$/, '');
      if (avatar.startsWith('/')) return base + avatar;
      return `${base}/uploads/avatars/${avatar}`;
    } catch (e) { return avatar; }
  };
  useEffect(() => {
    let offViewers = null;
    let offStatus = null;
    let offConversationUpdated = null;
    let offNew = null;
    let onSynthetic = null;
    try {
      offViewers = on('viewers', (payload) => {
        // payload: { conversationId, viewers }
        console.debug('SupportDashboard: viewers', payload);
        if (!payload || !payload.conversationId) return;
        setLists(prev => {
          const updateArray = (arr) => arr.map(c => c._id === payload.conversationId ? { ...c, viewers: payload.viewers } : c);
          return {
            needSupport: updateArray(prev.needSupport || []),
            supportProvided: updateArray(prev.supportProvided || [])
          };
        });
      });
      // also listen for status updates so we can move items between lists live
      offStatus = on('statusUpdated', (payload) => {
        try { console.debug('SupportDashboard: statusUpdated', payload); } catch (e) {}
        if (!payload || !payload.conversationId) return;
        setLists(prev => {
          const findAndRemove = (arr) => { const idx = (arr||[]).findIndex(x => x._id === payload.conversationId); if (idx === -1) return { arr, removed: null }; const copy = [...arr]; const removed = copy.splice(idx,1)[0]; return { arr: copy, removed }; };
          let need = prev.needSupport || [];
          let prov = prev.supportProvided || [];
          const fromNeed = findAndRemove(need);
          if (fromNeed.removed) { need = fromNeed.arr; prov = [ { ...fromNeed.removed, status: payload.status }, ...prov ]; }
          else {
            const fromProv = findAndRemove(prov);
            if (fromProv.removed) { prov = fromProv.arr; need = [ { ...fromProv.removed, status: payload.status }, ...need ]; }
          }
          return { needSupport: need, supportProvided: prov };
        });
      });
      // conversationUpdated includes summary: { conversationId, status, lastMessageAt, lastMessage, viewers }
      offConversationUpdated = on('conversationUpdated', (payload) => {
        try { console.debug('SupportDashboard: conversationUpdated', payload); } catch (e) {}
        if (!payload || !payload.conversationId) return;
        setLists(prev => {
          // find existing item (if any) so we can preserve displayName/avatar
          const findExisting = (id) => {
            return (prev.needSupport || []).concat(prev.supportProvided || []).find(x => x._id === id) || null;
          };
          const existing = findExisting(payload.conversationId);

          const upsert = (arr) => {
            const idx = (arr||[]).findIndex(x => x._id === payload.conversationId);
            if (idx !== -1) {
              const copy = [...arr];
              const ex = copy[idx];
              copy[idx] = {
                ...ex,
                lastMessage: payload.lastMessage || ex.lastMessage,
                lastMessageAt: payload.lastMessageAt || ex.lastMessageAt,
                viewers: payload.viewers || ex.viewers,
                status: payload.status || ex.status,
                userDisplayName: payload.userDisplayName || ex.userDisplayName,
                userName: payload.userName || ex.userName,
                user: payload.user || ex.user,
              };
              return copy;
            }
            return arr || [];
          };

          // remove from both and re-add to the correct list, preserving existing metadata
          const remove = (arr) => (arr || []).filter(x => x._id !== payload.conversationId);
          let need = remove(prev.needSupport || []);
          let prov = remove(prev.supportProvided || []);

          const newItemBase = {
            _id: payload.conversationId,
            lastMessage: payload.lastMessage || (existing && existing.lastMessage) || null,
            lastMessageAt: payload.lastMessageAt || (existing && existing.lastMessageAt) || null,
            viewers: payload.viewers || (existing && existing.viewers) || [],
            status: payload.status || (existing && existing.status) || null,
            userDisplayName: payload.userDisplayName || (existing && existing.userDisplayName) || (existing && (existing.userDisplayName || existing.user?.displayName)),
            userName: payload.userName || (existing && existing.userName) || (existing && existing.user?.name),
            user: payload.user || (existing && existing.user) || (existing && existing.user)
          };

          const target = (payload.status === 'need support') ? 'need' : 'prov';
          if (target === 'need') {
            need = [ { ...newItemBase }, ...need ];
          } else {
            prov = [ { ...newItemBase }, ...prov ];
          }

          // now merge existing fields where possible
          need = upsert(need);
          prov = upsert(prov);
          return { needSupport: need, supportProvided: prov };
        });
      });
      // newNeedSupport: notify supporters when a new conversation needs support
      offNew = on('newNeedSupport', (payload) => {
        try { console.debug('SupportDashboard: newNeedSupport', payload); } catch (e) {}
        if (!payload || !payload.conversationId) return;
        // update lists via existing handler logic by dispatching a synthetic event
        try { window.dispatchEvent(new CustomEvent('support:conversationUpdated', { detail: payload })); } catch (e) {}
        // in-app notification handled elsewhere; do not use browser/system notifications
      });
      // listen to dispatched synthetic events (so newNeedSupport can reuse same update flow)
      onSynthetic = (e) => {
        const payload = e && e.detail;
        if (!payload) return;
        try { console.debug('SupportDashboard: synthetic conversationUpdated', payload); } catch (e) {}
        setLists(prev => {
          const findExisting = (id) => {
            return (prev.needSupport || []).concat(prev.supportProvided || []).find(x => x._id === id) || null;
          };
          const existing = findExisting(payload.conversationId);
          const upsert = (arr) => {
            const idx = (arr||[]).findIndex(x => x._id === payload.conversationId);
            if (idx !== -1) {
              const copy = [...arr];
              const ex = copy[idx];
              copy[idx] = {
                ...ex,
                lastMessage: payload.lastMessage || ex.lastMessage,
                lastMessageAt: payload.lastMessageAt || ex.lastMessageAt,
                viewers: payload.viewers || ex.viewers,
                status: payload.status || ex.status,
                userDisplayName: payload.userDisplayName || ex.userDisplayName,
                userName: payload.userName || ex.userName,
                user: payload.user || ex.user,
              };
              return copy;
            }
            return arr || [];
          };
          const remove = (arr) => (arr || []).filter(x => x._id !== payload.conversationId);
          let need = remove(prev.needSupport || []);
          let prov = remove(prev.supportProvided || []);
          const newItemBase = {
            _id: payload.conversationId,
            lastMessage: payload.lastMessage || (existing && existing.lastMessage) || null,
            lastMessageAt: payload.lastMessageAt || (existing && existing.lastMessageAt) || null,
            viewers: payload.viewers || (existing && existing.viewers) || [],
            status: payload.status || (existing && existing.status) || null,
            userDisplayName: payload.userDisplayName || (existing && existing.userDisplayName) || (existing && (existing.userDisplayName || existing.user?.displayName)),
            userName: payload.userName || (existing && existing.userName) || (existing && existing.user?.name),
            user: payload.user || (existing && existing.user) || (existing && existing.user)
          };
          const target = (payload.status === 'need support') ? 'need' : 'prov';
          if (target === 'need') {
            need = [ { ...newItemBase }, ...need ];
          } else {
            prov = [ { ...newItemBase }, ...prov ];
          }
          need = upsert(need);
          prov = upsert(prov);
          return { needSupport: need, supportProvided: prov };
        });
      };
      window.addEventListener('support:conversationUpdated', onSynthetic);
    } catch (e) {}
    return () => {
      try { offViewers && offViewers(); } catch (e) {}
      try { offStatus && offStatus(); } catch (e) {}
      try { offConversationUpdated && offConversationUpdated(); } catch (e) {}
      try { offNew && offNew(); } catch (e) {}
      try { window.removeEventListener('support:conversationUpdated', onSynthetic); } catch (e) {}
    };
  }, [on, navigate, user]);

  const renderItem = (c) => {
    const sender = c.lastMessage && c.lastMessage.sender;
    // Prefer conversation user avatar (customer profile). Fall back to lastMessage sender avatar only if user avatar missing.
    const avatar = (c.user && c.user.avatar) ? getAvatarUrl(c.user.avatar) : (sender && sender.avatar ? getAvatarUrl(sender.avatar) : null);
    return (
      <div key={c._id} className={styles.item} onClick={() => navigate(`/support/chat/${c._id}`)}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {avatar ? <img src={avatar} alt="avatar" style={{ width:36, height:36, borderRadius:18, objectFit:'cover' }} /> : <img src="/images/logo.png" alt="logo" style={{ width:36, height:36, borderRadius:18 }} />}
            <div className={styles.itemTitle}>{
              c.userDisplayName || c.supportForUser?.displayName || c.supportForUser?.name ||
              c.user?.displayName || c.userName ||
              c.participants?.[0]?.displayName || c.participants?.[0]?.name ||
              'Customer'
            }</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-gray, #666)' }}>{new Date(c.lastMessageAt || c.lastMessage?.createdAt || c.updatedAt || c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div style={{ marginTop: 6, color: 'var(--text-dark, #444)' }}>{c.lastMessagePreview || c.lastMessage?.text || ''}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted, #888)' }}>{(c.viewers && c.viewers.length) ? `Viewers: ${c.viewers.length}` : ''}</div>
      </div>
    );
  };

  

  return (
    <div className={`sub-page ${styles.supportDash}`}>
      <header className={`account-header ${user?.role === 'support' ? 'center-logo' : ''}`}>
        <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
          <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
        </button>
        <h1>Support Dashboard</h1>
        <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <NotificationsButton />
        </div>
      </header>
      <div className="sub-content">
        <div className={styles.infoBox}>
          <p style={{ fontSize: 13, color: 'var(--text-gray)', margin: 0, lineHeight: 1.6 }}>
            Open a conversation to view and reply to messages on its dedicated page.
          </p>
        </div>

        <div className={styles.content}>
          <div className={styles.listColumn}>
            <div className={styles.listHeader}><strong>Need Support</strong></div>
            <div className={styles.listBody}>{loading ? <div className={styles.loading}>Loading...</div> : (lists.needSupport.length ? lists.needSupport.map(renderItem) : <div className={styles.empty}>No items</div>)}</div>
          </div>

          <div className={styles.listColumn}>
            <div className={styles.listHeader}><strong>Support Provided</strong></div>
            <div className={styles.listBody}>{loading ? <div className={styles.loading}>Loading...</div> : (lists.supportProvided.length ? lists.supportProvided.map(renderItem) : <div className={styles.empty}>No items</div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
