import React, { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiCheck, FiX } from 'react-icons/fi';
import '../styles/MultiSelectDropdown.css';

/**
 * MultiSelectDropdown Component
 * Props:
 *  - options: string[] - array of option values
 *  - selected: string[] - array of selected values
 *  - onChange: (selected: string[]) => void
 *  - placeholder: string
 *  - label: string (optional)
 *  - allOptionLabel: string (optional) - label for "All" option, defaults to "All"
 */
const MultiSelectDropdown = ({
  options = [],
  selected = [],
  onChange,
  placeholder = 'Select...',
  label,
  allOptionLabel = 'All',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if dropdown should open upward
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const menuHeight = 280; // Max height of dropdown menu
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  const isAllSelected = selected.length === 0 || selected.includes('All');

  const handleToggleOption = (option) => {
    if (option === 'All') {
      // Select All = clear selection (show all)
      onChange([]);
    } else {
      let newSelected;
      if (selected.includes(option)) {
        // Remove option
        newSelected = selected.filter((s) => s !== option && s !== 'All');
      } else {
        // Add option, remove 'All' if present
        newSelected = [...selected.filter((s) => s !== 'All'), option];
      }
      onChange(newSelected);
    }
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const getDisplayText = () => {
    if (isAllSelected) {
      return allOptionLabel;
    }
    if (selected.length === 1) {
      return selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <div className={`multi-select-dropdown ${openUpward ? 'upward' : ''}`} ref={dropdownRef}>
      {label && <label className="dropdown-label">{label}</label>}
      
      <div
        className={`dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="dropdown-text">{getDisplayText()}</span>
        <div className="dropdown-actions">
          {selected.length > 0 && !isAllSelected && (
            <button className="clear-btn" onClick={clearSelection}>
              <FiX size={14} />
            </button>
          )}
          <FiChevronDown
            size={16}
            className={`dropdown-arrow ${isOpen ? 'rotated' : ''}`}
          />
        </div>
      </div>

      {isOpen && (
        <div className={`dropdown-menu ${openUpward ? 'upward' : ''}`}>
          {/* All option */}
          <div
            className={`dropdown-option ${isAllSelected ? 'selected' : ''}`}
            onClick={() => handleToggleOption('All')}
          >
            <span className="option-checkbox">
              {isAllSelected && <FiCheck size={14} />}
            </span>
            <span className="option-label">{allOptionLabel}</span>
          </div>

          <div className="dropdown-divider" />

          {/* Individual options */}
          {options
            .filter((opt) => opt !== 'All')
            .map((option) => {
              const isSelected = selected.includes(option);
              return (
                <div
                  key={option}
                  className={`dropdown-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleOption(option)}
                >
                  <span className="option-checkbox">
                    {isSelected && <FiCheck size={14} />}
                  </span>
                  <span className="option-label">{option}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
