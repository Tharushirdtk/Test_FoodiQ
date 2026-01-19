import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown, FiCheck } from 'react-icons/fi';
import '../styles/Dropdown.css';

/**
 * Custom Dropdown Component
 * 
 * @param {Object} props
 * @param {Array} props.options - Array of options: strings or { value, label } objects
 * @param {string} props.value - Currently selected value
 * @param {function} props.onChange - Callback when value changes
 * @param {string} props.placeholder - Placeholder text when no value selected
 * @param {string} props.className - Additional CSS class
 * @param {boolean} props.disabled - Disable the dropdown
 * @param {string} props.size - Size variant: 'sm', 'md', 'lg'
 * @param {boolean} props.showCheckmark - Show checkmark on selected option
 */
const Dropdown = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
  size = 'md',
  showCheckmark = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    // Use capture phase for outside click detection so it runs before
    // any stopPropagation handlers inside modals or other components.
    const handleClickOutside = (event) => {
      const target = event.target;
      if (!dropdownRef.current) return;
      // If menuRef exists (portal), consider clicks on it as inside
      const clickedInsideTrigger = dropdownRef.current.contains(target);
      const clickedInsideMenu = menuRef.current && menuRef.current.contains && menuRef.current.contains(target);
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    // support touch devices where touchstart may be used
    document.addEventListener('touchstart', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Check if dropdown should open upward
  useEffect(() => {
    const computePlacement = () => {
      if (isOpen && dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        const menuHeight = 240; // Approximate max height of dropdown menu
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Open upward if not enough space below but enough space above
        const shouldOpenUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
        setOpenUpward(shouldOpenUpward);

        // compute fixed coordinates for the menu so it renders outside any scrolling containers
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        // Default desired width is trigger width, but clamp to viewport with 8px padding
        let desiredWidth = rect.width;
        let left = rect.left;

        // On very small screens, make menu full-width with small side padding
        if (viewportWidth <= 480) {
          left = 8;
          desiredWidth = viewportWidth - 16;
        } else {
          // Clamp left so menu stays inside viewport
          if (left + desiredWidth + 8 > viewportWidth) {
            // shrink width to fit, but not below 120px
            desiredWidth = Math.max(120, viewportWidth - left - 8);
            if (desiredWidth < 120) {
              desiredWidth = Math.min(rect.width, viewportWidth - 16);
              left = 8;
            }
          }
        }

        if (shouldOpenUpward) {
          const menuRealHeight = Math.min(menuHeight, normalizedOptions.length * 44);
          let top = rect.top - menuRealHeight - 8;
          // Clamp top to viewport
          top = Math.max(8, Math.min(top, viewportHeight - menuRealHeight - 8));
          setMenuStyle({
            left: `${Math.max(8, left)}px`,
            top: `${top}px`,
            width: `${Math.max(120, Math.min(desiredWidth, viewportWidth - 16))}px`,
            position: 'fixed',
          });
        } else {
          const menuRealHeight = Math.min(menuHeight, normalizedOptions.length * 44);
          let top = rect.bottom + 8;
          // Clamp so it doesn't go off bottom
          top = Math.max(8, Math.min(top, viewportHeight - menuRealHeight - 8));
          setMenuStyle({
            left: `${Math.max(8, left)}px`,
            top: `${top}px`,
            width: `${Math.max(120, Math.min(desiredWidth, viewportWidth - 16))}px`,
            position: 'fixed',
          });
        }
      }
    };

    computePlacement();

    if (isOpen) {
      window.addEventListener('resize', computePlacement);
      window.addEventListener('scroll', computePlacement, true);
      return () => {
        window.removeEventListener('resize', computePlacement);
        window.removeEventListener('scroll', computePlacement, true);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, options.length]);

  // Normalize options to { value, label } format
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return { value: opt.value, label: opt.label || opt.value };
  });

  // Get current label
  const currentOption = normalizedOptions.find((opt) => opt.value === value);
  const displayText = currentOption ? currentOption.label : placeholder;

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault();
      const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
      const nextIndex = (currentIndex + 1) % normalizedOptions.length;
      handleSelect(normalizedOptions[nextIndex].value);
    } else if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
      const prevIndex = currentIndex <= 0 ? normalizedOptions.length - 1 : currentIndex - 1;
      handleSelect(normalizedOptions[prevIndex].value);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`dropdown ${size} ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${openUpward ? 'upward' : ''} ${className}`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      role="listbox"
      aria-expanded={isOpen}
      aria-disabled={disabled}
    >
      <div
        className={`dropdown-trigger ${!value ? 'placeholder' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="dropdown-value">{displayText}</span>
        <FiChevronDown
          className={`dropdown-arrow ${isOpen ? 'rotated' : ''}`}
          size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
        />
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className={`dropdown-menu ${openUpward ? 'upward' : ''}`}
          role="listbox"
          style={menuStyle}
        >
          {normalizedOptions.length === 0 ? (
            <div className="dropdown-empty">No options available</div>
          ) : (
            normalizedOptions.map((option) => (
              <div
                key={option.value}
                className={`dropdown-option ${value === option.value ? 'selected' : ''}`}
                onClick={() => handleSelect(option.value)}
                role="option"
                aria-selected={value === option.value}
              >
                <span className="option-label">{option.label}</span>
                {showCheckmark && value === option.value && (
                  <FiCheck className="option-check" size={14} />
                )}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default Dropdown;
