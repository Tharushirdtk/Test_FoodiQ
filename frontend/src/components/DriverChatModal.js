import React, { useEffect, useState } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import conversationService from '../services/conversationService';
import orderService from '../services/orderService';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import DriverModal from './DriverModal';
import VendorModal from './VendorModal';

const DriverChatModal = ({ isOpen, onClose, orderId, driver }) => {
  const { user } = useAuth();
  const { on, joinConversation, leaveConversation, sendMessage } = useSocket();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverModalId, setDriverModalId] = useState(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorModalId, setVendorModalId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // Try to derive a canonical participant for the order (prefer order owner/customer)
        let participantId = null;
        try {
          const o = await orderService.getOrder(orderId);
          if (o && o.user) participantId = (o.user._id || o.user.id || o.user);
        } catch (e) {
          console.debug('DriverChatModal: could not fetch order to derive participantId', e && e.message);
        }

        const conv = await conversationService.createOrGet(orderId, participantId);
        if (!mounted) return;
        setConversation(conv);
        const data = await conversationService.getConversation(conv._id || conv.id);
        setMessages(data.messages || []);
        // join socket room (wait for ack)
        try { await joinConversation(conv._id || conv.id); setJoined(true); } catch (e) { setJoined(false); }
      } catch (e) {
        console.error(e);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [isOpen, orderId, joinConversation]);

  useEffect(() => {
    if (!on) return;
    const offMsg = on('message', (payload) => {
      try {
        const msg = payload && payload.message;
        if (!msg) return;
        if (!conversation) return;
        const convId = conversation._id || conversation.id;
        if ((msg.conversation && (msg.conversation === convId || msg.conversation._id === convId)) || (msg.conversationId && msg.conversationId === convId)) {
          setMessages((prev) => [...prev, msg]);
        }
      } catch (e) {}
    });
    return () => { try { offMsg && offMsg(); } catch (e) {} };
  }, [on, conversation]);

  const handleSend = async (text) => {
    if (!conversation) return;
    const convId = conversation._id || conversation.id;
    try {
      // send via socket with ack, fallback to HTTP
      let res = null;
      // ensure we've joined the conversation room before sending via socket
      if (!joined) {
        try { await joinConversation(convId); setJoined(true); } catch (e) { setJoined(false); }
      }
      if (sendMessage) {
        res = await sendMessage(convId, text);
      }
      if (!res) {
        res = await conversationService.postMessage(convId, user?._id || user?.id, text);
      }
      // optimistic append if res
      if (res) setMessages((prev) => [...prev, res]);
    } catch (e) {
      console.error('send failed', e);
    }
  };

  const handleClose = async () => {
    try { if (conversation) await leaveConversation(conversation._id || conversation.id); } catch (e) {}
    setMessages([]);
    setConversation(null);
    onClose && onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="chat-modal-overlay">
      <div className="chat-modal">
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden' }}>
              {driver?.avatar ? <img src={driver.avatar} alt={driver?.name || 'participant'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>💬</div>}
            </div>
            <h3>Chat with {driver?.name || 'Driver'}</h3>
          </div>
          <button className="btn btn-text" onClick={handleClose}>Close</button>
        </div>
        <div className="chat-body">
          {loading ? <p>Loading...</p> : <MessageList messages={messages} userId={user?._id || user?.id} />}
        </div>
        <div className="chat-footer">
          <MessageInput onSend={handleSend} />
        </div>
      </div>
      <DriverModal driverId={driverModalId} isOpen={showDriverModal} onClose={() => setShowDriverModal(false)} />
      <VendorModal vendorId={vendorModalId} isOpen={showVendorModal} onClose={() => setShowVendorModal(false)} />
    </div>
  );
};

export default DriverChatModal;
