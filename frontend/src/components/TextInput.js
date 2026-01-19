import React from 'react';
import './TextInput.css';

const TextInput = ({ id, name, value, onChange, placeholder, type = 'text', className = '', multiline = false, rows = 3, ...rest }) => {
  const handle = (e) => {
    if (onChange) onChange(e.target.value, e);
  };

  return (
    <div className={`text-input-wrapper ${className}`}>
      {multiline ? (
        <textarea id={id} name={name} value={value || ''} onChange={handle} placeholder={placeholder} rows={rows} {...rest} />
      ) : (
        <input id={id} name={name} type={type} value={value || ''} onChange={handle} placeholder={placeholder} {...rest} />
      )}
    </div>
  );
};

export default TextInput;
