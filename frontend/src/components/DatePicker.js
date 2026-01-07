import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import "../styles/DatePicker.css";

const DatePicker = ({ 
  value, 
  onChange, 
  placeholder = "Select date",
  minDate,
  maxDate,
  fromYear = 1920,
  toYear = new Date().getFullYear(),
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value || new Date(2000, 0));
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Generate year options
  const years = [];
  for (let year = toYear; year >= fromYear; year--) {
    years.push(year);
  }

  // Generate month options
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        // Also check if clicking inside the portal dropdown
        const dropdown = document.querySelector('.datepicker-dropdown-portal');
        if (dropdown && dropdown.contains(event.target)) {
          return;
        }
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 380; // Approximate height of the dropdown
      const viewportHeight = window.innerHeight;
      
      // Check if there's enough space above
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;
      
      // Default to showing above, unless there's not enough space
      const showAbove = spaceAbove >= dropdownHeight || spaceAbove > spaceBelow;
      
      setDropdownPosition({
        top: showAbove ? rect.top - dropdownHeight - 8 : rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Format the display value
  const formatDisplayDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  };

  // Handle date selection
  const handleSelect = (date) => {
    if (date) {
      onChange(date);
    }
    setIsOpen(false);
  };

  // Handle month change from dropdown
  const handleMonthChange = (e) => {
    const newMonth = parseInt(e.target.value);
    const newDate = new Date(currentMonth);
    newDate.setMonth(newMonth);
    setCurrentMonth(newDate);
  };

  // Handle year change from dropdown
  const handleYearChange = (e) => {
    const newYear = parseInt(e.target.value);
    const newDate = new Date(currentMonth);
    newDate.setFullYear(newYear);
    setCurrentMonth(newDate);
  };

  // Navigate months
  const goToPreviousMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentMonth(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentMonth(newDate);
  };

  // Disable dates outside range
  const disabledDays = [];
  if (minDate) {
    disabledDays.push({ before: minDate });
  }
  if (maxDate) {
    disabledDays.push({ after: maxDate });
  }

  return (
    <div className="custom-datepicker" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`datepicker-trigger ${isOpen ? "active" : ""} ${value ? "has-value" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={value ? "value" : "placeholder"}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <svg 
          className="calendar-icon" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div 
          className="datepicker-dropdown datepicker-dropdown-portal"
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 10001,
          }}
        >  {/* Custom Header with Dropdowns */}
          <div className="datepicker-header">
            <button 
              type="button" 
              className="nav-btn" 
              onClick={goToPreviousMonth}
              aria-label="Previous month"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            
            <div className="header-dropdowns">
              <select 
                value={currentMonth.getMonth()} 
                onChange={handleMonthChange}
                className="month-select"
              >
                {months.map((month, index) => (
                  <option key={month} value={index}>{month}</option>
                ))}
              </select>
              
              <select 
                value={currentMonth.getFullYear()} 
                onChange={handleYearChange}
                className="year-select"
              >
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            
            <button 
              type="button" 
              className="nav-btn" 
              onClick={goToNextMonth}
              aria-label="Next month"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Day Picker */}
          <DayPicker
            mode="single"
            selected={value}
            onSelect={handleSelect}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            disabled={disabledDays}
            showOutsideDays
            fixedWeeks
            hideNavigation
          />

          {/* Quick Actions */}
          <div className="datepicker-footer">
            <button 
              type="button" 
              className="clear-btn"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DatePicker;
