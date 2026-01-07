import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "../styles/AuthPage.css";
import CountrySelect from "../components/CountrySelect";
import PhoneCountrySelect from "../components/PhoneCountrySelect";
import Dropdown from "../components/Dropdown";

const RegisterStep2 = () => {
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState("LK");
  const [skipAddress, setSkipAddress] = useState(false);
  const [address, setAddress] = useState({
    type: "home",
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "Sri Lanka",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step1Data, setStep1Data] = useState(null);

  const navigate = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    // Get step1 data from sessionStorage
    const storedStep1 = sessionStorage.getItem("registrationStep1");
    if (!storedStep1) {
      // No step1 data - redirect to step 1
      navigate("/register/step1");
      return;
    }
    try {
      setStep1Data(JSON.parse(storedStep1));
    } catch {
      navigate("/register/step1");
    }
  }, [navigate]);

  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setAddress((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!step1Data) {
      setError("Session expired. Please start registration again.");
      return;
    }

    // Validate address if not skipped
    if (!skipAddress) {
      if (!address.street.trim()) {
        setError("Please enter a street address or choose to skip");
        return;
      }
      if (!address.city.trim()) {
        setError("Please enter a city");
        return;
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await auth.registerFull({
        // Step 1 data
        ...step1Data,
        // Step 2 data
        phone: phone || null,
        phoneCountry: phoneCountry || null,
        phoneVerified: false, // Will be verified after account creation
        skipAddress,
        address: skipAddress ? null : address,
      });

      if (response.success) {
        // Clear the step1 data from session
        sessionStorage.removeItem("registrationStep1");
        
        // Determine message based on email status
        const message = response.emailSent 
          ? "Registration complete! Please check your email to verify your account."
          : "Registration complete! We couldn't send the verification email. Please use 'Resend verification' on the login page.";
        const type = response.emailSent ? "success" : "warning";
        
        // Show success and redirect to login
        navigate("/login", {
          state: {
            message,
            type,
          },
        });
      } else {
        setError(response.message || "Registration failed");
      }
    } catch (err) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!step1Data) {
      setError("Session expired. Please start registration again.");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await auth.registerFull({
        // Step 1 data
        ...step1Data,
        // Skip step 2 data
        phone: null,
        phoneCountry: null,
        phoneVerified: false,
        skipAddress: true,
        address: null,
      });

      if (response.success) {
        sessionStorage.removeItem("registrationStep1");
        
        // Determine message based on email status
        const message = response.emailSent 
          ? "Registration complete! Please check your email to verify your account."
          : "Registration complete! We couldn't send the verification email. Please use 'Resend verification' on the login page.";
        const type = response.emailSent ? "success" : "warning";
        
        navigate("/login", {
          state: {
            message,
            type,
          },
        });
      } else {
        setError(response.message || "Registration failed");
      }
    } catch (err) {
      setError(err?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container auth-container-wide">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Almost there!</h1>
            <p>Step 2 of 2 — Contact & Delivery Info</p>
          </div>

          <div className="step-indicator">
            <div className="step completed">✓</div>
            <div className="step-line completed"></div>
            <div className="step active">2</div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {/* Phone Section */}
            <div className="form-section">
              <h3 className="section-title">Phone Number (Optional)</h3>
              <p className="section-subtitle">
                For faster delivery updates and order notifications
              </p>
              
              <div className="form-group phone-input-wrapper">
                <PhoneInput
                  international
                  defaultCountry="LK"
                  value={phone}
                  onChange={setPhone}
                  onCountryChange={setPhoneCountry}
                  placeholder="Enter phone number"
                  className="phone-input"
                  countrySelectComponent={PhoneCountrySelect}
                />
              </div>

              {/* Info hint */}
              {phone && (
                <div className="phone-verify-section">
                  <p className="verify-hint">
                    You can verify your phone number after completing registration. Verification is required to place orders.
                  </p>
                </div>
              )}
            </div>

            {/* Address Section */}
            <div className="form-section">
              <div className="section-header-flex">
                <div>
                  <h3 className="section-title">Delivery Address</h3>
                  <p className="section-subtitle">
                    You can add more addresses later
                  </p>
                </div>
                <label className="skip-checkbox">
                  <input
                    type="checkbox"
                    checked={skipAddress}
                    onChange={(e) => setSkipAddress(e.target.checked)}
                  />
                  <span>Skip for now</span>
                </label>
              </div>
              
              {!skipAddress && (
                <div className="address-fields">
                  <div className="form-group">
                    <label>Address Type</label>
                    <Dropdown
                      options={[
                        { value: 'home', label: 'Home' },
                        { value: 'work', label: 'Work' },
                        { value: 'other', label: 'Other' },
                      ]}
                      value={address.type}
                      onChange={(val) => setAddress({ ...address, type: val })}
                      placeholder="Select type"
                    />
                  </div>

                  <div className="form-group">
                    <label>Street Address *</label>
                    <input
                      type="text"
                      name="street"
                      value={address.street}
                      onChange={handleAddressChange}
                      placeholder="123 Main Street, Apt 4B"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>City *</label>
                      <input
                        type="text"
                        name="city"
                        value={address.city}
                        onChange={handleAddressChange}
                        placeholder="Colombo"
                      />
                    </div>

                    <div className="form-group">
                      <label>State/Province</label>
                      <input
                        type="text"
                        name="state"
                        value={address.state}
                        onChange={handleAddressChange}
                        placeholder="Western Province"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>ZIP/Postal Code</label>
                      <input
                        type="text"
                        name="zip"
                        value={address.zip}
                        onChange={handleAddressChange}
                        placeholder="10200"
                      />
                    </div>

                    <div className="form-group">
                      <label>Country</label>
                      <CountrySelect
                        value={address.country}
                        onChange={(val) => setAddress((prev) => ({ ...prev, country: val }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="button-group">
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="btn-secondary"
              >
                Skip & Finish
              </button>
              
              <button type="submit" disabled={loading} className="btn-submit">
                {loading ? "Completing..." : "Complete Registration"}
              </button>
            </div>
          </form>

          <div className="auth-footer">
            <Link to="/register/step1">← Back to Step 1</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterStep2;
