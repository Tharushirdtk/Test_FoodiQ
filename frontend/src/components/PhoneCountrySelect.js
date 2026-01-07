import React, { useState, useRef, useEffect } from "react";
import "../styles/PhoneCountrySelect.css";

/**
 * Custom country select for react-phone-number-input.
 * Props passed by the library:
 *  - value: ISO country code (e.g. "US")
 *  - onChange: (countryCode) => void
 *  - options: [{ value, label, divider }, ...]
 *  - iconComponent: Flag icon component
 *  - disabled, readOnly
 */
const PhoneCountrySelect = ({
  value,
  onChange,
  options = [],
  iconComponent: Icon,
  disabled,
  readOnly,
  ...rest
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter options (skip dividers)
  const filtered = options.filter(
    (o) => !o.divider && o.label?.toLowerCase().includes(query.toLowerCase())
  );

  const selected = options.find((o) => o.value === value);

  const handleSelect = (code) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  if (disabled || readOnly) {
    return (
      <div className="phone-country-select disabled">
        {Icon && value && <Icon country={value} label={selected?.label} />}
      </div>
    );
  }

  return (
    <div className="phone-country-select" ref={ref} {...rest}>
      <button
        type="button"
        className={`pcs-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {Icon && value && <Icon country={value} label={selected?.label} />}
        <svg
          className="pcs-arrow"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="pcs-dropdown" role="listbox">
          <div className="pcs-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country..."
              autoFocus
            />
          </div>
          <ul>
            {filtered.map((opt) => (
              <li
                key={opt.value || opt.label}
                role="option"
                aria-selected={opt.value === value}
                className={opt.value === value ? "selected" : ""}
                onClick={() => handleSelect(opt.value)}
              >
                {Icon && opt.value && (
                  <Icon country={opt.value} label={opt.label} />
                )}
                <span className="pcs-label">{opt.label}</span>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="no-results">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PhoneCountrySelect;
