import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FiEye, FiEyeOff } from 'react-icons/fi';
import DatePicker from "../components/DatePicker";
import Dropdown from "../components/Dropdown";
import "../styles/AuthPage.css";

const RegisterStep1 = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    birthdate: null,
    gender: "",
  });
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const navigate = useNavigate();
  const auth = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleDateChange = (date) => {
    setFormData((prev) => ({ ...prev, birthdate: date }));
    setError(null);
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      return "Please enter your full name";
    }
    if (!formData.email.trim()) {
      return "Please enter your email";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return "Please enter a valid email address";
    }
    if (!formData.password) {
      return "Please enter a password";
    }
    if (formData.password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    // Require at least one special character
    if (!/[^A-Za-z0-9]/.test(formData.password)) {
      return "Password must include at least one special character (e.g. !@#$%)";
    }
    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match";
    }
    if (!formData.birthdate) {
      return "Please enter your birthdate";
    }
    // Check age (must be at least 13)
    const today = new Date();
    const birth = formData.birthdate;
    if (!(birth instanceof Date) || isNaN(birth.getTime())) {
      return "Please enter a valid birthdate";
    }
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    if (age < 13) {
      return "You must be at least 13 years old to register";
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Store form data in sessionStorage for step 2 (no account creation yet)
    const step1Data = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      birthdate: formData.birthdate.toISOString(),
      gender: formData.gender || null,
    };
    
    sessionStorage.setItem("registrationStep1", JSON.stringify(step1Data));
    navigate("/register/step2");
  };

  // Calculate max date (13 years ago)
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 13);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Create your FoodiQ account</h1>
            <p>Step 1 of 2 — Personal Information</p>
          </div>

          <div className="step-indicator">
            <div className="step active">1</div>
            <div className="step-line"></div>
            <div className="step">2</div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label>Full name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label>Email address *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Password *</label>
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete="new-password"
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
                <p className="password-hint">At least 8 characters</p>
              </div>

              <div className="form-group">
                <label>Confirm Password *</label>
                <div className="password-field">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
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
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Birthdate *</label>
                <DatePicker
                  value={formData.birthdate}
                  onChange={handleDateChange}
                  placeholder="Select your birthdate"
                  maxDate={maxDate}
                  toYear={maxDate.getFullYear()}
                />
              </div>

              <div className="form-group">
                <label>Gender</label>
                <Dropdown
                  options={[
                    { value: '', label: 'Prefer not to say' },
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                  value={formData.gender}
                  onChange={(val) => setFormData({ ...formData, gender: val })}
                  placeholder="Select gender"
                />
              </div>
            </div>

            <div className="terms-checkbox">
              <input type="checkbox" id="terms" required />
              <label htmlFor="terms">
                I agree to the{" "}
                <Link to="/terms" className="terms-link">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="terms-link">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <button type="submit" className="btn-submit">
              Continue to Step 2
            </button>
          </form>

          <div className="divider">
            <span>Or</span>
          </div>

          <button
            type="button"
            onClick={() => {
              auth.continueAsGuest();
              navigate("/");
            }}
            className="btn-guest"
          >
            Continue as guest
          </button>

          <div className="auth-footer">
            Already have an account?
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterStep1;
