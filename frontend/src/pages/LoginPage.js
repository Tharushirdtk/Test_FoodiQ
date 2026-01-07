import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import '../styles/AuthPage.css';

// Modern Login Page Component
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [warningMessage, setWarningMessage] = useState(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  // Check for success/warning message from registration
  useEffect(() => {
    if (location.state?.message) {
      if (location.state.type === 'warning') {
        setWarningMessage(location.state.message);
      } else {
        setSuccessMessage(location.state.message);
      }
      // Clear the state so message doesn't persist on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    setEmailNotVerified(false);
    
    try {
      const res = await auth.login({ email, password });
      if (res) {
        navigate('/');
      } else {
        setError('Invalid credentials');
      }
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      
      if (status === 403 && data?.emailNotVerified) {
        setEmailNotVerified(true);
        setError('Please verify your email before logging in. Check your inbox or spam folder.');
      } else if (status === 401) {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(data?.message || 'Unable to sign in. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    setResending(true);
    try {
      await auth.resendVerificationEmail(email);
      setSuccessMessage('Verification email sent! Please check your inbox.');
      setEmailNotVerified(false);
      setError(null);
    } catch (err) {
      // Still show success to prevent enumeration
      setSuccessMessage('If an account exists, a verification email has been sent.');
      setEmailNotVerified(false);
      setError(null);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <img src="/images/logo.png" alt="FoodiQ" className="auth-logo" />
            <h1>Welcome to FoodiQ</h1>
            <p>Sign in to continue to your account</p>
          </div>

          {successMessage && (
            <div className="auth-success">
              {successMessage}
            </div>
          )}

          {warningMessage && (
            <div className="auth-warning">
              {warningMessage}
            </div>
          )}

          {error && (
            <div className="auth-error">
              {error}
              {emailNotVerified && (
                <button 
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="resend-link"
                >
                  {resending ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

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
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  required
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
            </div>

            <div className="remember-forgot">
              <label className="remember-label">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" state={{ email }} className="forgot-link">
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-submit">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="divider">
            <span>Or</span>
          </div>

          <button
            type="button"
            onClick={() => {
              auth.continueAsGuest();
              navigate('/');
            }}
            className="btn-guest"
          >
            Continue as guest
          </button>

          <div className="auth-footer">
            Don't have an account?
            <Link to="/register">Create account</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;