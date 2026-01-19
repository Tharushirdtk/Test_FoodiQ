import React, { useEffect, useRef } from 'react';

const MessageList = ({ messages, userId }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [messages]);
  return (
    <div className="message-list" ref={ref}>
      {messages.map((m) => (
        <div key={m._id || m.id} className={`message ${m.sender === userId ? 'outgoing' : 'incoming'}`}>
          <div className="message-text">{m.text}</div>
          <div className="message-time">{new Date(m.createdAt || m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      ))}
    </div>
  );
};

export default MessageList;
