import React from 'react';
import '../styles/RadioGroup.css';

const RadioGroup = ({ name, options = [], value, onChange, className = '', inline = true, disabled = false }) => {
  return (
    <div className={`radio-group ${inline ? 'horizontal' : 'vertical'} ${className} ${disabled ? 'disabled' : ''}`} role="radiogroup" aria-label={name} aria-disabled={disabled}>
      {options.map((opt) => {
        const checked = String(opt.value) === String(value);
        return (
          <label
            key={opt.value}
            className={`radio-button ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(opt.value);
              }
            }}
            onClick={() => { if (!disabled) onChange(opt.value); }}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={(e) => onChange(opt.value)}
              disabled={disabled}
            />
            <span className="radio-label">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
};

export default RadioGroup;
