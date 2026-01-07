import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/AuthPage.css";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const location = useLocation();
  const auth = useAuth();

  // Pre-fill email if passed from login page
  useEffect(() => {
    if (location.state?.email) {
      setEmail(location.state.email);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      await auth.forgotPassword(email.trim().toLowerCase());
      setSuccess(true);
    } catch (err) {
      // Show success anyway (to prevent email enumeration)
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
              <div className="success-icon">✉️</div>
              <h1>Check your inbox</h1>
              <p>
                If an account exists for <strong>{email}</strong>, we've sent a
                password reset link. Please check your email (and spam folder).
              </p>
            </div>

            <div className="info-box">
              <p>
                <strong>Note:</strong> The link will expire in 1 hour.
              </p>
            </div>

            <button
              onClick={() => setSuccess(false)}
              className="btn-secondary"
              style={{ width: "100%", marginBottom: "16px" }}
            >
              Try a different email
            </button>

            <Link to="/login" className="btn-submit" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
              Back to Login
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
            <h1>Forgot Password?</h1>
            <p>
              No worries! Enter your email and we'll send you a reset link.
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <div className="auth-footer">
            Remember your password?
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
