import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import SupportChat from '../components/SupportChat';
import '../styles/SubPage.css';

const SupportConversationPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/support')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Conversation</h1>
      </header>

      <div className="sub-content">
        {id ? (
          <SupportChat conversationId={id} />
        ) : (
          <div style={{ padding: 16 }}>
            <p>No conversation selected.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportConversationPage;
