import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/AuthPage.css";

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const auth = useAuth();

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setError("Missing verification token");
        setLoading(false);
        return;
      }

      try {
        await auth.verifyEmail(token);
        setSuccess(true);
      } catch (err) {
        setError(err?.message || "Failed to verify email. The link may be invalid or expired.");
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [token, auth]);

  // Loading state
  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
              <div className="loading-spinner"></div>
              <h1>Verifying Email...</h1>
              <p>Please wait while we verify your email address.</p>
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
              <h1>Email Verified!</h1>
              <p>
                Your email has been successfully verified. You can now log in to
                your FoodiQ account.
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

  // Error state
  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
            <div className="error-icon">⚠️</div>
            <h1>Verification Failed</h1>
            <p>{error}</p>
          </div>

          <div className="info-box">
            <p>
              If your link has expired, you can request a new verification email
              from the login page.
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
};

export default VerifyEmailPage;
