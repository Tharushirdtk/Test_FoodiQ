import React, { useState, useEffect, useRef } from "react";
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
  const [vendorProfile, setVendorProfile] = useState({
    storeName: "",
    businessRegNumber: "",
    description: "",
    storePhone: "",
    // storePhoneVerified removed — verification not required on registration
    storeAddress: {
      type: "home",
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "Sri Lanka",
    },
  });
  const [driverProfile, setDriverProfile] = useState({
    vehicleType: "",
    licenseNumber: "",
    plateNumber: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const errorRef = useRef(null);
  const [step1Data, setStep1Data] = useState(null);
  // verification is removed from registration flow; keep phone fields only
  const [vendorStorePhoneCountry, setVendorStorePhoneCountry] = useState("LK");

  const navigate = useNavigate();
  const auth = useAuth();

  // phone completeness/verification helper removed — verification not done on register page

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

  // Restore any saved step2 partial data so navigating back and forth preserves progress
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("registrationStep2");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.phone) setPhone(saved.phone);
        if (saved.phoneCountry) setPhoneCountry(saved.phoneCountry);
        if (typeof saved.skipAddress === "boolean")
          setSkipAddress(saved.skipAddress);
        if (saved.address)
          setAddress((prev) => ({ ...prev, ...saved.address }));
        if (saved.vendorProfile)
          setVendorProfile((p) => ({ ...p, ...saved.vendorProfile }));
        if (saved.vendorStorePhoneCountry)
          setVendorStorePhoneCountry(saved.vendorStorePhoneCountry);
        if (saved.driverProfile)
          setDriverProfile((p) => ({ ...p, ...saved.driverProfile }));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist step2 inputs when they change
  useEffect(() => {
    const toStore = {
      phone: phone || null,
      phoneCountry: phoneCountry || null,
      vendorStorePhoneCountry: vendorStorePhoneCountry || null,
      skipAddress: !!skipAddress,
      address: address || null,
      vendorProfile: vendorProfile || null,
      driverProfile: driverProfile || null,
    };
    try {
      sessionStorage.setItem("registrationStep2", JSON.stringify(toStore));
    } catch (e) {
      // ignore storage errors
    }
  }, [phone, phoneCountry, skipAddress, address, vendorProfile, driverProfile]);

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

  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setAddress((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!step1Data) {
      setError("Session expired. Please start registration again.");
      setTimeout(scrollToError, 0);
      return;
    }

    // Validate address only for customers when address is not skipped
    if (!skipAddress && step1Data?.role === "customer") {
      if (!address.street.trim()) {
        setError("Please enter a street address or choose to skip");
        setTimeout(scrollToError, 0);
        return;
      }
      if (!address.city.trim()) {
        setError("Please enter a city");
        setTimeout(scrollToError, 0);
        return;
      }
    }

    // For vendor/driver require phone presence before completing registration
    if (
      (step1Data?.role === "vendor" || step1Data?.role === "driver") &&
      !phone
    ) {
      setError("Phone number is required for vendor and driver registration");
      setTimeout(scrollToError, 0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build base Step1 payload and ensure customer's role is explicitly 'customer'
      const baseStep1 = {
        name: step1Data.name,
        email: step1Data.email,
        password: step1Data.password,
        birthdate: step1Data.birthdate,
        gender: step1Data.gender || null,
        role: step1Data.role === "customer" ? "customer" : step1Data.role,
      };

      // Build payload to submit
      const payload = {
        ...baseStep1,
        phone: phone || null,
        phoneCountry: phoneCountry || null,
        skipAddress,
        address: skipAddress ? null : address,
      };

      if (step1Data.role === "vendor") payload.vendorProfile = vendorProfile;
      if (step1Data.role === "driver") {
        // Backend expects either licenseNumber, vehicleNumber or licensePlate.
        // Frontend collects `plateNumber`, so map it to `vehicleNumber` (and `licensePlate`) to satisfy backend checks.
        const driverPayload = {
          vehicleType: driverProfile.vehicleType || null,
          vehicleNumber: driverProfile.plateNumber || driverProfile.vehicleNumber || null,
          licensePlate: driverProfile.plateNumber || driverProfile.licensePlate || null,
          licenseNumber: driverProfile.licenseNumber || null,
        };
        payload.driverProfile = driverPayload;
      }

      // Submit registration immediately for all roles (verification not required here)
      try {
        const response = await auth.registerFull(payload);
        if (response.success) {
          sessionStorage.removeItem("registrationStep1");
          sessionStorage.removeItem("registrationStep2");
          const message = response.emailSent
            ? "Registration complete! Please check your email to verify your account."
            : "Registration complete! We couldn't send the verification email. Please use 'Resend verification' on the login page.";
          const type = response.emailSent ? "success" : "warning";
          navigate("/login", { state: { message, type } });
        } else {
          setError(response.message || "Registration failed");
          setTimeout(scrollToError, 0);
        }
      } catch (err) {
        // Prefer backend-provided message or Joi errors when available
        const apiMessage =
          err?.response?.data?.message ||
          (Array.isArray(err?.response?.data?.errors)
            ? err.response.data.errors.map((e) => e.message).join(" \n")
            : null);
        const finalMsg = apiMessage || err?.message || "Registration failed. Please try again.";
        setError(finalMsg);
        setTimeout(scrollToError, 0);
      } finally {
        setLoading(false);
      }
      return;
    } catch (err) {
      const apiMessage =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.errors)
          ? err.response.data.errors.map((e) => e.message).join(" \n")
          : null);
      const finalMsg = apiMessage || err?.message || "Registration failed. Please try again.";
      setError(finalMsg);
      setTimeout(scrollToError, 0);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!step1Data) {
      setError("Session expired. Please start registration again.");
      setTimeout(scrollToError, 0);
      return;
    }
    // Do not allow skipping for vendor/driver
    if (step1Data.role === "vendor" || step1Data.role === "driver") {
      setError(
        "You must complete phone verification to finish vendor/driver registration"
      );
      setTimeout(scrollToError, 0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // For customers: create user using ONLY the Step 1 payload and force role to 'customer'
      const payload = {
        name: step1Data.name,
        email: step1Data.email,
        password: step1Data.password,
        birthdate: step1Data.birthdate,
        gender: step1Data.gender || null,
        role: "customer",
      };

      const response = await auth.registerFull(payload);

      if (response.success) {
        sessionStorage.removeItem("registrationStep1");
        sessionStorage.removeItem("registrationStep2");

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
        setTimeout(scrollToError, 0);
      }
      } catch (err) {
        const apiMessage =
          err?.response?.data?.message ||
          (Array.isArray(err?.response?.data?.errors)
            ? err.response.data.errors.map((e) => e.message).join(" \n")
            : null);
        const finalMsg = apiMessage || err?.message || "Registration failed. Please try again.";
        setError(finalMsg);
        setTimeout(scrollToError, 0);
      } finally {
      setLoading(false);
    }
  };
  // Verification removed from registration flow; no verification handlers

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

          {error && (
            <div ref={errorRef} className="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {/* Phone Section */}
            <div className="form-section">
              <h3 className="section-title">
                {step1Data?.role === "vendor"
                  ? "Vendor contact number"
                  : step1Data?.role === "driver"
                  ? "Phone Number (Required)"
                  : "Phone Number (Optional)"}
              </h3>
              <p className="section-subtitle">
                {step1Data?.role === "vendor"
                  ? "Owner contact — required to complete vendor registration."
                  : step1Data?.role === "driver"
                  ? "Required for driver registration."
                  : "For faster delivery updates and order notifications"}
              </p>

              <div className="phone-input-wrapper">
                <div>
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
              </div>

              {/* Info hint */}
              {phone && (
                <div className="phone-verify-section">
                  <p className="verify-hint">
                    {step1Data?.role === "vendor" ||
                    step1Data?.role === "driver"
                      ? "Phone number is required to complete this registration."
                      : "You can verify your phone number after completing registration."}
                  </p>
                </div>
              )}
            </div>

            {/* Address Section */}
            {/* Show delivery address section only for customers (hide for drivers and vendors) */}
            {step1Data?.role === "customer" && (
              <div className="form-section">
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Delivery Address</h3>
                    <p className="section-subtitle">
                      You can add more addresses later
                    </p>
                  </div>
                  {/* Only show skip checkbox for customers */}
                  {step1Data?.role === "customer" && (
                    <label className="skip-checkbox">
                      <input
                        type="checkbox"
                        checked={skipAddress}
                        onChange={(e) => setSkipAddress(e.target.checked)}
                      />
                      <span>Skip for now</span>
                    </label>
                  )}
                </div>

                {!skipAddress && (
                  <div className="address-fields">
                    <div className="form-group">
                      <label>Address Type</label>
                      <Dropdown
                        options={[
                          { value: "home", label: "Home" },
                          { value: "work", label: "Work" },
                          { value: "other", label: "Other" },
                        ]}
                        value={address.type}
                        onChange={(val) =>
                          setAddress({ ...address, type: val })
                        }
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
                          onChange={(val) =>
                            setAddress((prev) => ({ ...prev, country: val }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Role specific fields */}
            {step1Data?.role === "vendor" && (
              <div className="form-section">
                <h3 className="section-title">Store Details</h3>
                <p className="section-subtitle">Information about your store</p>
                <div className="form-group">
                  <label>Store name *</label>
                  <input
                    type="text"
                    value={vendorProfile.storeName}
                    onChange={(e) =>
                      setVendorProfile((p) => ({
                        ...p,
                        storeName: e.target.value,
                      }))
                    }
                    placeholder="My Great Cafe"
                    required
                  />
                </div>
                {/* Owner phone is collected in the top Phone section and labeled appropriately for vendors */}
                <div className="form-group">
                  <label>Store contact number *</label>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div className="phone-input-wrapper">
                        <div style={{ flex: 1 }}>
                          <PhoneInput
                            international
                            defaultCountry={vendorStorePhoneCountry || "LK"}
                            value={vendorProfile.storePhone}
                            onChange={(val) =>
                              setVendorProfile((p) => ({
                                ...p,
                                storePhone: val,
                              }))
                            }
                            onCountryChange={(c) => setVendorStorePhoneCountry(c)}
                            placeholder="+94..."
                            className="phone-input"
                            countrySelectComponent={PhoneCountrySelect}
                          />
                        </div>
                      </div>
                    
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <h3 className="section-title">Location *</h3>
                  <div className="address-fields">
                    {/* Address type omitted for vendors (store address uses default type) */}
                    <div className="form-group">
                      <label>Street Address *</label>
                      <input
                        type="text"
                        name="street"
                        value={vendorProfile.storeAddress.street}
                        onChange={(e) =>
                          setVendorProfile((p) => ({
                            ...p,
                            storeAddress: {
                              ...p.storeAddress,
                              street: e.target.value,
                            },
                          }))
                        }
                        placeholder="123 Main Street, Apt 4B"
                        required
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>City *</label>
                        <input
                          type="text"
                          name="city"
                          value={vendorProfile.storeAddress.city}
                          onChange={(e) =>
                            setVendorProfile((p) => ({
                              ...p,
                              storeAddress: {
                                ...p.storeAddress,
                                city: e.target.value,
                              },
                            }))
                          }
                          placeholder="Colombo"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>State/Province</label>
                        <input
                          type="text"
                          name="state"
                          value={vendorProfile.storeAddress.state}
                          onChange={(e) =>
                            setVendorProfile((p) => ({
                              ...p,
                              storeAddress: {
                                ...p.storeAddress,
                                state: e.target.value,
                              },
                            }))
                          }
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
                          value={vendorProfile.storeAddress.zip}
                          onChange={(e) =>
                            setVendorProfile((p) => ({
                              ...p,
                              storeAddress: {
                                ...p.storeAddress,
                                zip: e.target.value,
                              },
                            }))
                          }
                          placeholder="10200"
                        />
                      </div>

                      <div className="form-group">
                        <label>Country</label>
                        <CountrySelect
                          value={vendorProfile.storeAddress.country}
                          onChange={(val) =>
                            setVendorProfile((prev) => ({
                              ...prev,
                              storeAddress: {
                                ...prev.storeAddress,
                                country: val,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Business registration number</label>
                  <input
                    type="text"
                    value={vendorProfile.businessRegNumber}
                    onChange={(e) =>
                      setVendorProfile((p) => ({
                        ...p,
                        businessRegNumber: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="form-group">
                  <label>Short description</label>
                  <input
                    type="text"
                    value={vendorProfile.description}
                    onChange={(e) =>
                      setVendorProfile((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Describe your food and services"
                  />
                </div>
              </div>
            )}

            {step1Data?.role === "driver" && (
              <div className="form-section">
                <h3 className="section-title">Driver details</h3>
                <p className="section-subtitle">
                  Vehicle and license information
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Vehicle type</label>
                    <input
                      type="text"
                      value={driverProfile.vehicleType}
                      onChange={(e) =>
                        setDriverProfile((p) => ({
                          ...p,
                          vehicleType: e.target.value,
                        }))
                      }
                      placeholder="Motorbike / Car"
                    />
                  </div>

                  <div className="form-group">
                    <label>Plate number</label>
                    <input
                      type="text"
                      value={driverProfile.plateNumber}
                      onChange={(e) =>
                        setDriverProfile((p) => ({
                          ...p,
                          plateNumber: e.target.value,
                        }))
                      }
                      placeholder="ABC-1234"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>License number</label>
                  <input
                    type="text"
                    value={driverProfile.licenseNumber}
                    onChange={(e) =>
                      setDriverProfile((p) => ({
                        ...p,
                        licenseNumber: e.target.value,
                      }))
                    }
                    placeholder="DL123456"
                  />
                </div>
              </div>
            )}

            <div className="button-group">
              {/* Only show Skip & Finish for customers */}
              {step1Data?.role === "customer" && (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={loading}
                  className="btn-secondary"
                >
                  Skip & Finish
                </button>
              )}

              <button type="submit" disabled={loading} className="btn-submit">
                {loading ? "Completing..." : "Complete Registration"}
              </button>
            </div>
          </form>

          {/* Phone verification removed from registration flow */}

          <div className="auth-footer">
            <Link to="/register/step1">← Back to Step 1</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterStep2;
