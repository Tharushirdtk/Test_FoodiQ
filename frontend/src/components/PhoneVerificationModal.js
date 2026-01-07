import React, { useState, useEffect, useCallback } from "react";
import OtpInput from "./OtpInput";
import "../styles/PhoneVerificationModal.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

/**
 * Phone Verification Modal
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - phone: string (E.164 format)
 *  - onVerified: () => void (callback when verified)
 *  - userId: string (optional, for guest flow)
 *  - contactId: string (optional, for verifying contacts from contacts array)
 *  - preRegistration: boolean (optional, for registration flow before account exists)
 */
const PhoneVerificationModal = ({
  isOpen,
  onClose,
  phone,
  onVerified,
  userId,
  contactId,
  preRegistration = false,
}) => {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setOtp("");
      setError(null);
      setSuccess(false);
      setCodeSent(false);
      setResendTimer(0);
    }
  }, [isOpen]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Send OTP
  const sendOtp = useCallback(async () => {
    if (!phone) {
      setError("No phone number provided");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      
      // Use contact-specific endpoint if contactId is provided
      let endpoint = `${API_URL}/auth/phone/send-otp`;
      let body = { phone, userId };
      
      if (contactId) {
        endpoint = `${API_URL}/contacts/${contactId}/send-code`;
        body = {};
      }
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send OTP");
      }

      setCodeSent(true);
      setResendTimer(60); // 60 second cooldown
    } catch (err) {
      setError(err.message || "Failed to send verification code");
    } finally {
      setSending(false);
    }
  }, [phone, userId, contactId]);

  // Auto-send OTP when modal opens
  useEffect(() => {
    if (isOpen && phone && !codeSent) {
      sendOtp();
    }
  }, [isOpen, phone, codeSent, sendOtp]);

  // Verify OTP
  const verifyOtp = async () => {
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      
      // Use contact-specific endpoint if contactId is provided
      let endpoint = `${API_URL}/auth/phone/verify-otp`;
      let body = { phone, otp, userId };
      
      if (contactId) {
        endpoint = `${API_URL}/contacts/${contactId}/verify`;
        body = { code: otp };
      }
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invalid code");
      }

      setSuccess(true);
      
      // Callback after short delay
      setTimeout(() => {
        onVerified && onVerified();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Verification failed");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP complete
  useEffect(() => {
    if (otp.length === 6 && !loading && !success) {
      verifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  if (!isOpen) return null;

  const formatPhone = (p) => {
    // Simple format: show last 4 digits
    if (!p) return "";
    return `****${p.slice(-4)}`;
  };

  return (
    <div className="pvm-overlay">
      <div className="pvm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pvm-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="pvm-icon">
          {success ? (
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          )}
        </div>

        <h2 className="pvm-title">
          {success ? "Phone Verified!" : "Verify Your Phone"}
        </h2>

        {success ? (
          <p className="pvm-subtitle success">
            Your phone number has been verified successfully.
          </p>
        ) : (
          <>
            <p className="pvm-subtitle">
              {codeSent
                ? `We sent a 6-digit code to ${formatPhone(phone)}`
                : "Sending verification code..."}
            </p>

            <div className="pvm-otp-section">
              <label>Authentication code</label>
              <OtpInput
                value={otp}
                onChange={setOtp}
                disabled={loading || sending || success}
                error={!!error}
              />
            </div>

            {error && <p className="pvm-error">{error}</p>}

            <button
              className="pvm-verify-btn"
              onClick={verifyOtp}
              disabled={otp.length !== 6 || loading || success}
            >
              {loading ? "Verifying..." : "Verify"}
            </button>

            <div className="pvm-resend">
              {resendTimer > 0 ? (
                <span className="pvm-timer">
                  Resend code in {resendTimer}s
                </span>
              ) : (
                <button
                  className="pvm-resend-btn"
                  onClick={sendOtp}
                  disabled={sending}
                >
                  {sending ? "Sending..." : "Resend Code"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PhoneVerificationModal;
