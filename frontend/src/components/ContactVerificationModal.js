import React, { useState, useEffect, useCallback } from "react";
import OtpInput from "./OtpInput";
import contactService from "../services/contactService";
import "../styles/PhoneVerificationModal.css";

/**
 * Contact Verification Modal - For verifying contacts from the contacts array
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - contact: { _id, number, label } - the contact to verify
 *  - onVerified: () => void (callback when verified)
 */
const ContactVerificationModal = ({
  isOpen,
  onClose,
  contact,
  onVerified,
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
    if (!contact?._id) {
      setError("No contact selected");
      return;
    }

    setSending(true);
    setError(null);

    try {
      await contactService.sendVerificationCode(contact._id);
      setCodeSent(true);
      setResendTimer(60); // 60 second cooldown
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send verification code");
    } finally {
      setSending(false);
    }
  }, [contact]);

  // Auto-send OTP when modal opens
  useEffect(() => {
    if (isOpen && contact && !codeSent) {
      sendOtp();
    }
  }, [isOpen, contact, codeSent, sendOtp]);

  // Verify OTP
  const verifyOtp = async () => {
    if (otp.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await contactService.verifyContact(contact._id, otp);
      setSuccess(true);
      
      // Callback after short delay
      setTimeout(() => {
        onVerified && onVerified();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Verification failed");
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
    if (!p) return "";
    return `****${p.slice(-4)}`;
  };

  return (
    <div className="phone-verify-overlay" onClick={onClose}>
      <div className="phone-verify-modal" onClick={(e) => e.stopPropagation()}>
        {success ? (
          <div className="verify-success">
            <div className="success-icon">✓</div>
            <h2>Verified!</h2>
            <p>Your phone number has been verified successfully.</p>
          </div>
        ) : (
          <>
            <h2>Verify Phone Number</h2>
            <p className="verify-subtitle">
              {codeSent
                ? `Enter the 6-digit code sent to ${formatPhone(contact?.number)}`
                : `We'll send a verification code to ${formatPhone(contact?.number)}`}
            </p>

            {!codeSent ? (
              <button
                className="send-code-btn"
                onClick={sendOtp}
                disabled={sending}
              >
                {sending ? "Sending..." : "Send Verification Code"}
              </button>
            ) : (
              <>
                <OtpInput value={otp} onChange={setOtp} disabled={loading} />

                {error && <p className="verify-error">{error}</p>}

                <button
                  className="verify-btn"
                  onClick={verifyOtp}
                  disabled={otp.length !== 6 || loading}
                >
                  {loading ? "Verifying..." : "Verify"}
                </button>

                <div className="resend-section">
                  {resendTimer > 0 ? (
                    <p className="resend-timer">Resend code in {resendTimer}s</p>
                  ) : (
                    <button
                      className="resend-btn"
                      onClick={sendOtp}
                      disabled={sending}
                    >
                      {sending ? "Sending..." : "Resend Code"}
                    </button>
                  )}
                </div>
              </>
            )}

            <button className="close-btn" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ContactVerificationModal;
