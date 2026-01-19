import React from 'react';
import './CurrencyField.css';

// Reusable currency input that matches app field styles.
// Props: label, name, value, onChange, required, placeholder, min, step
export default function CurrencyField({
  label,
  name,
  value,
  onChange,
  required = false,
  placeholder = '',
  min,
  step = '0.01',
  id,
  disabled = false,
}) {
  const handleChange = (e) => {
    // pass raw value to parent (string) — parent handles conversion
    onChange && onChange(e);
  };

  return (
    <div className="cp-currency-field">
      {label && <label className="cp-currency-label" htmlFor={id || name}>{label}</label>}
      <div className={`cp-currency-input-group ${disabled ? 'disabled' : ''}`}>
        <span className="cp-currency-prefix">Rs.</span>
        <input
          id={id || name}
          name={name}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          aria-disabled={disabled}
          placeholder={placeholder}
          required={required}
          className="cp-currency-input"
        />
      </div>
    </div>
  );
}
