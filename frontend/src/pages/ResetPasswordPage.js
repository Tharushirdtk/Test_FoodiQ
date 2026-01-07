import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    // Require at least one special character
    if (!/[^A-Za-z0-9]/.test(password)) {
      setError("Password must include at least one special character (e.g. !@#$%)");
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
      if (err?.message?.includes("expired") || err?.message?.includes("invalid")) {
        setTokenValid(false);
      } else {
        setError(err?.message || "Failed to reset password. Please try again.");
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

            <Link
              to="/login"
              className="btn-submit"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Go to Login
            </Link>
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
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                autoFocus
              />
              <p className="password-hint">At least 8 characters</p>
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                autoComplete="new-password"
              />
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
