import React, { useState, useRef, useEffect } from "react";
import "../styles/OtpInput.css";

/**
 * Modern 6-digit OTP input with individual boxes.
 * Props:
 *  - length: number of digits (default 6)
 *  - value: current OTP string
 *  - onChange: (otp: string) => void
 *  - disabled: boolean
 *  - error: boolean (highlight red)
 *  - autoFocus: boolean
 */
const OtpInput = ({
  length = 6,
  value = "",
  onChange,
  disabled = false,
  error = false,
  autoFocus = true,
}) => {
  const [otp, setOtp] = useState(value.split("").slice(0, length));
  const inputRefs = useRef([]);

  useEffect(() => {
    // Sync external value changes
    setOtp(value.split("").slice(0, length));
  }, [value, length]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index, e) => {
    const val = e.target.value;
    
    // Handle paste
    if (val.length > 1) {
      const pasted = val.replace(/\D/g, "").slice(0, length);
      const newOtp = pasted.split("");
      setOtp(newOtp);
      onChange && onChange(newOtp.join(""));
      
      // Focus last filled or next empty
      const focusIndex = Math.min(pasted.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    // Single digit
    if (/^\d$/.test(val) || val === "") {
      const newOtp = [...otp];
      newOtp[index] = val;
      setOtp(newOtp);
      onChange && onChange(newOtp.join(""));

      // Auto-focus next
      if (val && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        // Move to previous and clear
        const newOtp = [...otp];
        newOtp[index - 1] = "";
        setOtp(newOtp);
        onChange && onChange(newOtp.join(""));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleFocus = (e) => {
    e.target.select();
  };

  return (
    <div className={`otp-input-container ${error ? "error" : ""} ${disabled ? "disabled" : ""}`}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={length} // Allow paste
          value={otp[i] || ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={handleFocus}
          disabled={disabled}
          className="otp-box"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
};

export default OtpInput;
