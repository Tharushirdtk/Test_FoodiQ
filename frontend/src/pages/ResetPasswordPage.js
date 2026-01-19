import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth } from "../context/AuthContext";
import "../styles/AuthPage.css";

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const auth = useAuth();

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!password) {
      setError("Please enter a new password");
      return;
    }

    // Require password complexity: min 8, upper, lower, digit, special
    const missing = [];
    if (password.length < 8) missing.push('At least 8 characters');
    if (!/[A-Z]/.test(password)) missing.push('At least one uppercase letter (A-Z)');
    if (!/[a-z]/.test(password)) missing.push('At least one lowercase letter (a-z)');
    if (!/\d/.test(password)) missing.push('At least one number (0-9)');
    if (!/[^A-Za-z0-9]/.test(password)) missing.push('At least one special character (e.g. !@#$%)');

    if (missing.length > 0) {
      setError(missing.join(' | '));
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      await auth.resetPassword(token, password);
      setSuccess(true);
      
      // Close this tab after 3 seconds and let user know
      setTimeout(() => {
        window.close();
      }, 5000);
    } catch (err) {
      const resp = err?.response?.data;
      // Token invalid/expired check
      const msg = resp?.message || err?.message;
      if (msg && (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid"))) {
        setTokenValid(false);
      } else if (resp?.details && Array.isArray(resp.details) && resp.details.length > 0) {
        setError(resp.details.join(' | '));
      } else {
        setError(msg || "Failed to reset password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Invalid or missing token
  if (!tokenValid) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
              <div className="error-icon">⚠️</div>
              <h1>Invalid or Expired Link</h1>
              <p>
                This password reset link is invalid or has expired. Please request
                a new one.
              </p>
            </div>

            <Link
              to="/forgot-password"
              className="btn-submit"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Request New Link
            </Link>

            <div className="auth-footer">
              Remember your password?
              <Link to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
              <div className="success-icon">✅</div>
              <h1>Password Updated!</h1>
              <p>
                Your password has been successfully reset. You can now log in with
                your new password.
              </p>
            </div>

            <div className="info-box">
              <p>
                This window will close automatically in 5 seconds. If it doesn't,
                you can close it manually.
              </p>
            </div>

            {/* Removed 'Go to Login' button per UX: window auto-closes after success */}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
            <h1>Create New Password</h1>
            <p>
              Enter your new password below. Make sure it's at least 8 characters.
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>New Password</label>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
              <div className="password-hint">
                <p>Requirements:</p>
                <ul className="password-criteria">
                  <li>At least 8 characters</li>
                  <li>At least one uppercase letter (A-Z)</li>
                  <li>At least one lowercase letter (a-z)</li>
                  <li>At least one number (0-9)</li>
                  <li>At least one special character (e.g. !@#$%)</li>
                </ul>
              </div>
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <div className="password-field">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirm ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>

          <div className="auth-footer">
            <Link to="/login">Cancel and return to Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
