import React, { useState } from 'react';

const MessageInput = ({ onSend, disabled }) => {
  const [text, setText] = useState('');
  const handleSend = async () => {
    if (!text.trim()) return;
    await onSend(text.trim());
    setText('');
  };
  return (
    <div className="message-input">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." disabled={disabled} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
      <button className="btn btn-primary" onClick={handleSend} disabled={disabled || !text.trim()}>Send</button>
    </div>
  );
};

export default MessageInput;
