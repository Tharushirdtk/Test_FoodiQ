import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiCheck, FiX } from "react-icons/fi";
import "../styles/MultiSelectDropdown.css";

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
  placeholder = "Select...",
  label,
  allOptionLabel = "All",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;
      // If click is inside the trigger area, keep open
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      // If menu is rendered in a portal, clicks inside it should not close the dropdown
      if (menuRef.current && menuRef.current.contains(target)) return;

      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Normalize options to ensure consistent rendering length for placement
  const normalizedOptions = options.map((opt) =>
    opt === "All"
      ? { value: "All", label: allOptionLabel }
      : { value: opt, label: opt }
  );

  // Check if dropdown should open upward and compute portal placement
  useEffect(() => {
    const computePlacement = () => {
      if (dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        const menuHeight = Math.min(280, (normalizedOptions.length + 1) * 44);
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        const shouldOpenUpward =
          spaceBelow < menuHeight && spaceAbove > spaceBelow;
        setOpenUpward(shouldOpenUpward);

        const viewportWidth = window.innerWidth;
        let left = rect.left;
        let desiredWidth = rect.width;

        if (viewportWidth <= 480) {
          left = 8;
          desiredWidth = viewportWidth - 16;
        } else if (left + desiredWidth + 8 > viewportWidth) {
          desiredWidth = Math.max(120, viewportWidth - left - 8);
        }

        if (shouldOpenUpward) {
          const top = Math.max(8, rect.top - menuHeight - 8);
          setMenuStyle({
            left: Math.max(8, left) + "px",
            top: top + "px",
            width:
              Math.max(120, Math.min(desiredWidth, viewportWidth - 16)) + "px",
            position: "fixed",
          });
        } else {
          const top = Math.min(
            window.innerHeight - 8 - menuHeight,
            rect.bottom + 8
          );
          setMenuStyle({
            left: Math.max(8, left) + "px",
            top: top + "px",
            width:
              Math.max(120, Math.min(desiredWidth, viewportWidth - 16)) + "px",
            position: "fixed",
          });
        }
      }
    };

    computePlacement();

    if (isOpen) {
      window.addEventListener("resize", computePlacement);
      window.addEventListener("scroll", computePlacement, true);
      return () => {
        window.removeEventListener("resize", computePlacement);
        window.removeEventListener("scroll", computePlacement, true);
      };
    }
  }, [isOpen, normalizedOptions.length]);

  const isAllSelected = selected.length === 0 || selected.includes("All");

  const handleToggleOption = (option) => {
    if (option === "All") {
      // Select All = clear selection (show all)
      onChange([]);
      setIsOpen(false); // Close when selecting "All"
    } else {
      let newSelected;
      if (selected.includes(option)) {
        // Remove option
        newSelected = selected.filter((s) => s !== option && s !== "All");
      } else {
        // Add option, remove 'All' if present
        newSelected = [...selected.filter((s) => s !== "All"), option];
      }
      onChange(newSelected);
      // Don't close dropdown for individual selections - keep it open
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
    <div
      className={`multi-select-dropdown ${openUpward ? "upward" : ""} ${disabled ? 'disabled' : ''}`}
      ref={dropdownRef}
      aria-disabled={disabled}
    >
      {label && <label className="dropdown-label">{label}</label>}

      <div
        className={`dropdown-trigger ${isOpen ? "open" : ""} ${disabled ? 'disabled' : ''}`}
        onClick={() => { if (disabled) return; setIsOpen(!isOpen); }}
      >
        <span className="dropdown-text">{getDisplayText()}</span>
        <div className="dropdown-actions">
          {selected.length > 0 && !isAllSelected && !disabled && (
            <button className="clear-btn" onClick={clearSelection}>
              <FiX size={14} />
            </button>
          )}
          <FiChevronDown
            size={16}
            className={`dropdown-arrow ${isOpen ? "rotated" : ""}`}
          />
        </div>
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className={`dropdown-menu ${openUpward ? "upward" : ""}`}
            style={menuStyle}
          >
            {/* All option */}
            <div
              className={`dropdown-option ${isAllSelected ? "selected" : ""} ${disabled ? 'disabled' : ''}`}
              onClick={() => { if (disabled) return; handleToggleOption("All"); }}
            >
              <span className="option-checkbox">
                {isAllSelected && <FiCheck size={14} />}
              </span>
              <span className="option-label">{allOptionLabel}</span>
            </div>

            <div className="dropdown-divider" />

            {/* Individual options */}
            {normalizedOptions
              .filter((opt) => opt.value !== "All")
                  .map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className={`dropdown-option ${
                      isSelected ? "selected" : ""
                    } ${disabled ? 'disabled' : ''}`}
                    onClick={() => { if (disabled) return; handleToggleOption(option.value); }}
                  >
                    <span className="option-checkbox">
                      {isSelected && <FiCheck size={14} />}
                    </span>
                    <span className="option-label">{option.label}</span>
                  </div>
                );
              })}
          </div>,
          document.body
        )}
    </div>
  );
};

export default MultiSelectDropdown;
