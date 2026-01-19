import React, { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FiEye, FiEyeOff } from "react-icons/fi";
import DatePicker from "../components/DatePicker";
import Dropdown from "../components/Dropdown";
import RadioGroup from "../components/RadioGroup";
import "../styles/AuthPage.css";

const RegisterStep1 = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    birthdate: null,
    gender: "",
    role: "customer",
  });
  const [error, setError] = useState(null);
  const errorRef = useRef(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const navigate = useNavigate();
  const auth = useAuth();

  // Prevent the persistence effect from running during restoration
  const isRestoringRef = useRef(true);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleDateChange = (date) => {
    setFormData((prev) => ({ ...prev, birthdate: date }));
    setError(null);
  };

  // Restore saved step1 data if present so navigating between steps preserves progress
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("registrationStep1");

      if (raw) {
        const saved = JSON.parse(raw);

        // Only accept a role from storage if it's one of the allowed public roles
        const allowedRoles = ["customer", "vendor", "driver"];
        const restoredRole =
          typeof saved.role === "string" && allowedRoles.includes(saved.role)
            ? saved.role
            : undefined;

        setFormData((prev) => ({
          ...prev,
          name: saved.name || prev.name,
          email: saved.email || prev.email,
          password: saved.password || prev.password,
          confirmPassword: saved.confirmPassword || prev.confirmPassword,
          birthdate: saved.birthdate
            ? new Date(saved.birthdate)
            : prev.birthdate,
          gender: saved.gender || prev.gender,
          role: restoredRole !== undefined ? restoredRole : prev.role,
        }));

        // Use setTimeout to ensure state has updated before allowing persistence
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 0);
      } else {
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 0);
      }
    } catch (e) {
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 0);
    }
    // run only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist step1 inputs so user can navigate between steps without losing progress
  useEffect(() => {
    if (isRestoringRef.current) {
      return;
    }

    const toStore = {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      birthdate: formData.birthdate ? formData.birthdate.toISOString() : null,
      gender: formData.gender || null,
      role: formData.role || "customer",
    };

    try {
      sessionStorage.setItem("registrationStep1", JSON.stringify(toStore));
    } catch (e) {
      // ignore quota/storage errors
    }
  }, [formData]);

  // Scroll to the error block when an error appears
  useEffect(() => {
    if (error && errorRef.current) {
      try {
        errorRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } catch (e) {
        // ignore
      }
    }
  }, [error]);

  // helper to force scroll to error (useful when setError may set same text)
  const scrollToError = () => {
    if (errorRef.current) {
      try {
        errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {}
    }
  };

  const validateForm = () => {
    const isVendor = formData.role === "vendor";
    if (!formData.name.trim()) {
      return isVendor
        ? "Please enter your vendor name"
        : "Please enter your full name";
    }
    if (!formData.email.trim()) {
      return isVendor
        ? "Please enter your vendor email address"
        : "Please enter your email";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return isVendor
        ? "Please enter a valid vendor email address"
        : "Please enter a valid email address";
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
    // Only require birthdate/age for non-vendor users
    if (formData.role !== "vendor") {
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
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }
      if (age < 13) {
        return "You must be at least 13 years old to register";
      }
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setTimeout(scrollToError, 0);
      return;
    }

    // Call server step1 to create provisional user and get userId for phone verification
    const step1Data = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      birthdate: formData.birthdate ? formData.birthdate.toISOString() : null,
      gender: formData.gender || null,
      role: formData.role || "customer",
    };

    try {
      const res = await auth.validateStep1(step1Data);
      if (
        res &&
        res.valid === false &&
        Array.isArray(res.errors) &&
        res.errors.length
      ) {
        setError(res.errors[0].message || "Validation failed");
        setTimeout(scrollToError, 0);
        return;
      }

      // Success: store sanitized data and proceed to step 2
      // Ensure we always persist the user's chosen role — some validation
      // responses may omit it, which would cause the form to revert to
      // the default ('customer') when restoring from sessionStorage.
      const payload = res && res.data ? { ...res.data } : { ...step1Data };
      payload.role = step1Data.role || "customer";
      sessionStorage.setItem("registrationStep1", JSON.stringify(payload));
      navigate("/register/step2");
    } catch (err) {
      // If the validation endpoint returned structured validation errors,
      // show them and do not proceed to step 2.
      const resp = err && err.response && err.response.data;
      if (resp && resp.valid === false && Array.isArray(resp.errors) && resp.errors.length) {
        setError(resp.errors[0].message || "Validation failed");
        setTimeout(scrollToError, 0);
        return;
      }

      // Otherwise (network/server error), fallback to local save and proceed
      sessionStorage.setItem("registrationStep1", JSON.stringify(step1Data));
      navigate("/register/step2");
    }
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

          {error && (
            <div ref={errorRef} className="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="radio-center">
              <RadioGroup
                name="role"
                options={[
                  { value: "customer", label: "Customer" },
                  { value: "vendor", label: "Vendor" },
                  { value: "driver", label: "Driver" },
                ]}
                value={formData.role}
                onChange={(val) => {
                  setFormData((prev) => ({ ...prev, role: val }));
                }}
                inline={true}
              />
            </div>

            <div className="form-group">
              <label>
                {formData.role === "vendor" ? "Vendor name *" : "Full name *"}
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder={
                  formData.role === "vendor" ? "Vendor Name" : "John Doe"
                }
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label>
                {formData.role === "vendor"
                  ? "Vendor email address *"
                  : "Email address *"}
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder={
                  formData.role === "vendor"
                    ? "vendor@example.com"
                    : "you@example.com"
                }
                autoComplete="email"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Password *</label>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
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
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <FiEyeOff size={18} />
                    ) : (
                      <FiEye size={18} />
                    )}
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
                <label>Confirm Password *</label>
                <div className="password-field">
                  <input
                    type={showConfirm ? "text" : "password"}
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
                    aria-label={
                      showConfirm
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                  >
                    {showConfirm ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  {formData.role === "vendor" ? "Birthdate" : "Birthdate *"}
                </label>
                <DatePicker
                  value={formData.birthdate}
                  onChange={handleDateChange}
                  placeholder={
                    formData.role === "vendor"
                      ? "Select birthdate (optional)"
                      : "Select your birthdate"
                  }
                  maxDate={maxDate}
                  toYear={maxDate.getFullYear()}
                />
              </div>

              <div className="form-group">
                <label>Gender</label>
                <Dropdown
                  options={[
                    { value: "", label: "Prefer not to say" },
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "other", label: "Other" },
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
