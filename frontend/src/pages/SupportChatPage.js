import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import SupportChat from '../components/SupportChat';
import supportChatService from '../services/supportChatService';
import '../styles/SubPage.css';

const SupportChatPage = () => {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await supportChatService.getMyConversation();
        if (mounted && res && res.conversation && res.conversation._id) {
          setConversationId(res.conversation._id);
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/support')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Help & Support</h1>
      </header>
      <div className="sub-content">Loading chat…</div>
    </div>
  );

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/support')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Help & Support</h1>
      </header>

      <div className="sub-content">
        {conversationId ? (
          <SupportChat conversationId={conversationId} />
        ) : (
          <div style={{ padding: 16 }}>
            <p>No active conversation. You can start a conversation from the Contact options on the Support page.</p>
            <button className="btn btn-primary" onClick={async () => {
              try {
                const res = await supportChatService.getMyConversation();
                if (res && res.conversation && res.conversation._id) setConversationId(res.conversation._id);
              } catch (e) {}
            }}>Start Chat</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportChatPage;
