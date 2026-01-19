import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiCamera, FiTrash2, FiShoppingBag } from 'react-icons/fi';
import TextInput from './TextInput';
import profileService from '../services/profileService';
import DatePicker from './DatePicker';
import Dropdown from './Dropdown';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import PhoneCountrySelect from '../components/PhoneCountrySelect';
import '../styles/EditProfileModal.css';

const EditProfileModal = ({ isOpen, onClose, user, onProfileUpdated }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    displayName: user?.displayName || '',
    birthdate: user?.birthdate ? new Date(user.birthdate) : null,
    gender: user?.gender || '',
    // vendor fields
    vendorStoreName: user?.vendorProfile?.storeName || '',
    vendorStorePhone: user?.vendorProfile?.storePhone || '',
    vendorStoreAddress_street: user?.vendorProfile?.storeAddress?.street || '',
    vendorStoreAddress_city: user?.vendorProfile?.storeAddress?.city || '',
    vendorStoreAddress_state: user?.vendorProfile?.storeAddress?.state || '',
    vendorStoreAddress_zip: user?.vendorProfile?.storeAddress?.zip || '',
    vendorStoreAddress_country: user?.vendorProfile?.storeAddress?.country || '',
    vendorBusinessRegNumber: user?.vendorProfile?.businessRegNumber || '',
    vendorDescription: user?.vendorProfile?.description || '',
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [vehiclePreview, setVehiclePreview] = useState(user?.driverProfile?.vehicleImage || null);
  const [vehicleFile, setVehicleFile] = useState(null);
  const [vehicleNumberValue, setVehicleNumberValue] = useState(user?.driverProfile?.vehicleNumber || '');
  const [vehicleLicenseValue, setVehicleLicenseValue] = useState(user?.driverProfile?.licenseNumber || '');
  const [vehicleTypeValue, setVehicleTypeValue] = useState(user?.driverProfile?.vehicleType || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const fileInputRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: user?.name || '',
        displayName: user?.displayName || '',
        birthdate: user?.birthdate ? new Date(user.birthdate) : null,
        gender: user?.gender || '',
        vendorStoreName: user?.vendorProfile?.storeName || '',
        vendorStorePhone: user?.vendorProfile?.storePhone || '',
        vendorStoreAddress_street: user?.vendorProfile?.storeAddress?.street || '',
        vendorStoreAddress_city: user?.vendorProfile?.storeAddress?.city || '',
        vendorStoreAddress_state: user?.vendorProfile?.storeAddress?.state || '',
        vendorStoreAddress_zip: user?.vendorProfile?.storeAddress?.zip || '',
        vendorStoreAddress_country: user?.vendorProfile?.storeAddress?.country || '',
        vendorBusinessRegNumber: user?.vendorProfile?.businessRegNumber || '',
        vendorDescription: user?.vendorProfile?.description || '',
      });
      setAvatarPreview(user?.avatar || null);
      setVehiclePreview(user?.driverProfile?.vehicleImage || null);
      setVehicleFile(null);
      setVehicleNumberValue(user?.driverProfile?.vehicleNumber || '');
      setVehicleLicenseValue(user?.driverProfile?.licenseNumber || '');
      setVehicleTypeValue(user?.driverProfile?.vehicleType || '');
      setAvatarFile(null);
      setError(null);
      setSuccess(null);
      setLoading(false);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleVehicleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      setVehicleFile(file);
      setVehiclePreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleRemoveAvatar = async () => {
    if (user?.avatar) {
      try {
        await profileService.deleteAvatar();
      } catch (err) {
        console.error('Failed to delete avatar:', err);
      }
    }
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Upload avatar if changed
      let newAvatarUrl = user?.avatar;
      if (avatarFile) {
        const avatarRes = await profileService.uploadAvatar(avatarFile);
        newAvatarUrl = avatarRes.avatar;
      }

      // Upload vehicle image/number/license if driver
      let newDriverProfile = user?.driverProfile || null;
      if (user?.role === 'driver') {
        try {
          if (vehicleFile || vehicleNumberValue || vehicleLicenseValue || vehicleTypeValue) {
            const vehicleRes = await profileService.uploadVehicle(vehicleFile, vehicleNumberValue, vehicleLicenseValue);
            newDriverProfile = vehicleRes.driverProfile || newDriverProfile;
          }
        } catch (e) {
          console.error('Failed to upload vehicle info', e);
        }
      }

      // Update profile data
      const payload = {
        name: formData.name,
        birthdate: formData.birthdate || null,
        gender: formData.gender || null,
      };

      // Only include displayName for customers/admins (not vendor or driver)
      if (!(user?.role === 'vendor' || user?.role === 'driver')) {
        payload.displayName = formData.displayName || null;
      }

      // If vendor, include vendorProfile fields
      if (user?.role === 'vendor') {
        payload.vendorProfile = {
          storeName: formData.vendorStoreName || null,
          storePhone: formData.vendorStorePhone || null,
          storeAddress: {
            street: formData.vendorStoreAddress_street || null,
            city: formData.vendorStoreAddress_city || null,
            state: formData.vendorStoreAddress_state || null,
            zip: formData.vendorStoreAddress_zip || null,
            country: formData.vendorStoreAddress_country || null,
          },
          businessRegNumber: formData.vendorBusinessRegNumber || null,
          description: formData.vendorDescription || null,
        };
      }

      // If driver, include driverProfile fields as part of the update payload
      if (user?.role === 'driver') {
        payload.driverProfile = {
          vehicleType: vehicleTypeValue || null,
          vehicleNumber: vehicleNumberValue || null,
          licenseNumber: vehicleLicenseValue || null,
        };
      }

      const res = await profileService.updateProfile(payload);

      setSuccess('Profile updated successfully!');
      
      // Notify parent of update and wait for refresh
      if (onProfileUpdated) {
        await onProfileUpdated({
          ...res.user,
          avatar: newAvatarUrl,
          driverProfile: newDriverProfile,
        });
      }

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const getAvatarDisplay = () => {
    if (avatarPreview) {
      // Check if it's a URL or a local blob
      const src = avatarPreview.startsWith('blob:') || avatarPreview.startsWith('http') 
        ? avatarPreview 
        : `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${avatarPreview}`;
      return <img src={src} alt="Avatar" className="edit-profile-avatar-image" />;
    }
    // If vendor and no avatar, show a business icon placeholder
    if (user?.role === 'vendor') {
      return (
        <div className="edit-profile-avatar-placeholder">
          <FiShoppingBag size={42} />
        </div>
      );
    }
    return <span className="edit-profile-avatar-placeholder">👤</span>;
  };

  return (
    <div className="edit-profile-overlay">
      <div className="edit-profile-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-profile-modal-header">
          <h2>Edit Profile</h2>
          <button className="edit-profile-close-btn" onClick={onClose}>
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="edit-profile-modal-content">
          {/* Avatar Section */}
          <div className="edit-profile-avatar-section">
            <div className="edit-profile-avatar-container" onClick={handleAvatarClick}>
              {getAvatarDisplay()}
              <div className="edit-profile-avatar-overlay">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiCamera size={20} />
                  <span>{user?.role === 'vendor' ? 'Change Store Image' : 'Change Photo'}</span>
                </div>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <div className="edit-profile-avatar-actions">
              <button type="button" className="edit-profile-btn-text" onClick={handleAvatarClick}>
                {user?.role === 'vendor' ? 'Change Store Image' : 'Change Photo'}
              </button>
              {avatarPreview && (
                <button type="button" className="edit-profile-btn-text edit-profile-btn-danger" onClick={handleRemoveAvatar}>
                  <FiTrash2 size={14} /> {user?.role === 'vendor' ? 'Remove Image' : 'Remove'}
                </button>
              )}
            </div>
          </div>

          {/* Vehicle Section will be rendered after personal details for drivers (see below) */}

          {/* Form Fields */}
          {/* Section header: show only for vendors and drivers */}
          {(user?.role === 'vendor' || user?.role === 'driver') && (
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{user?.role === 'vendor' ? 'Vendor Details' : 'Personal Details'}</h3>
            </div>
          )}

          <div className="edit-profile-form-fields">
            <div className="edit-profile-form-group">
              <label htmlFor="name">{user?.role === 'vendor' ? 'Vendor Name *' : 'Full Name *'}</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Enter your full name"
              />
            </div>

            {/* Display name is not editable for vendors or drivers */}
            {(user?.role !== 'vendor' && user?.role !== 'driver') && (
              <div className="edit-profile-form-group">
                <label htmlFor="displayName">Display Name</label>
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="How you'd like to be called"
                />
                <span className="edit-profile-form-hint">This is how your name will appear in the app</span>
              </div>
            )}

            <div className="edit-profile-form-group">
              <label htmlFor="birthdate">Date of Birth</label>
              <DatePicker
                value={formData.birthdate}
                onChange={(date) => setFormData(prev => ({ ...prev, birthdate: date }))}
                placeholder="Select your birthday"
                maxDate={new Date()}
                fromYear={1920}
                toYear={new Date().getFullYear()}
              />
            </div>

            <div className="edit-profile-form-group">
              <label htmlFor="gender">Gender</label>
              <Dropdown
                options={[
                  { value: '', label: 'Select gender' },
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'other', label: 'Other' },
                  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
                ]}
                value={formData.gender}
                onChange={(val) => setFormData(prev => ({ ...prev, gender: val }))}
                placeholder="Select gender"
              />
            </div>

            {/* Vendor-specific fields */}
            {user?.role === 'vendor' && (
              <div className="vendor-block">
                <h3 style={{ margin: '8px 0' }}>Store Details</h3>
                <div className="vendor-grid">
                  <div className="edit-profile-form-group">
                    <label htmlFor="vendorStoreName">Store Name</label>
                    <TextInput id="vendorStoreName" name="vendorStoreName" value={formData.vendorStoreName} onChange={(v) => setFormData(prev => ({ ...prev, vendorStoreName: v }))} placeholder="Store or business name" />
                  </div>

                  <div className="edit-profile-form-group">
                    <label htmlFor="vendorStorePhone">Store Phone</label>
                    <PhoneInput
                      international
                      defaultCountry="LK"
                      value={formData.vendorStorePhone}
                      onChange={(val) => setFormData(prev => ({ ...prev, vendorStorePhone: val }))}
                      placeholder="Store phone number"
                      className="phone-input"
                      countrySelectComponent={PhoneCountrySelect}
                    />
                  </div>

                  <div className="edit-profile-form-group full-row">
                    <label htmlFor="vendorStoreAddress_street">Street</label>
                    <TextInput id="vendorStoreAddress_street" name="vendorStoreAddress_street" value={formData.vendorStoreAddress_street} onChange={(v) => setFormData(prev => ({ ...prev, vendorStoreAddress_street: v }))} placeholder="Street" />
                  </div>

                  <div className="edit-profile-form-group">
                    <label htmlFor="vendorStoreAddress_city">City</label>
                    <TextInput id="vendorStoreAddress_city" name="vendorStoreAddress_city" value={formData.vendorStoreAddress_city} onChange={(v) => setFormData(prev => ({ ...prev, vendorStoreAddress_city: v }))} placeholder="City" />
                  </div>

                  <div className="edit-profile-form-group">
                    <label htmlFor="vendorStoreAddress_state">State</label>
                    <TextInput id="vendorStoreAddress_state" name="vendorStoreAddress_state" value={formData.vendorStoreAddress_state} onChange={(v) => setFormData(prev => ({ ...prev, vendorStoreAddress_state: v }))} placeholder="State" />
                  </div>

                  <div className="edit-profile-form-group">
                    <label htmlFor="vendorStoreAddress_zip">ZIP</label>
                    <TextInput id="vendorStoreAddress_zip" name="vendorStoreAddress_zip" value={formData.vendorStoreAddress_zip} onChange={(v) => setFormData(prev => ({ ...prev, vendorStoreAddress_zip: v }))} placeholder="ZIP" />
                  </div>

                  <div className="edit-profile-form-group">
                    <label htmlFor="vendorStoreAddress_country">Country</label>
                    <TextInput id="vendorStoreAddress_country" name="vendorStoreAddress_country" value={formData.vendorStoreAddress_country} onChange={(v) => setFormData(prev => ({ ...prev, vendorStoreAddress_country: v }))} placeholder="Country" />
                  </div>

                  <div className="edit-profile-form-group full-row">
                    <label htmlFor="vendorBusinessRegNumber">Business Registration Number</label>
                    <TextInput id="vendorBusinessRegNumber" name="vendorBusinessRegNumber" value={formData.vendorBusinessRegNumber} onChange={(v) => setFormData(prev => ({ ...prev, vendorBusinessRegNumber: v }))} placeholder="Business registration or tax ID" />
                  </div>

                  <div className="edit-profile-form-group full-row">
                    <label htmlFor="vendorDescription">Store Description</label>
                    <TextInput id="vendorDescription" name="vendorDescription" multiline rows={4} value={formData.vendorDescription} onChange={(v) => setFormData(prev => ({ ...prev, vendorDescription: v }))} placeholder="Brief description of your store" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Vehicle details for drivers - placed after personal details */}
          {user?.role === 'driver' && (
            <div className="vendor-block">
              <h3 style={{ margin: '8px 0' }}>Vehicle Details</h3>
              <div className="vendor-grid">
                <div className="edit-profile-form-group">
                  <label style={{ marginBottom: 6 }}>Vehicle Type</label>
                  <input type="text" value={vehicleTypeValue} onChange={(e) => setVehicleTypeValue(e.target.value)} placeholder="Motorbike / Car" />
                </div>

                <div className="edit-profile-form-group">
                  <label style={{ marginBottom: 6 }}>Vehicle Number</label>
                  <input type="text" value={vehicleNumberValue} onChange={(e) => setVehicleNumberValue(e.target.value)} placeholder="Vehicle/plate number" />
                </div>

                <div className="edit-profile-form-group">
                  <label style={{ marginBottom: 6 }}>License Number</label>
                  <input type="text" value={vehicleLicenseValue} onChange={(e) => setVehicleLicenseValue(e.target.value)} placeholder="License number" />
                </div>

                <div className="edit-profile-form-group full-row">
                  <label style={{ marginBottom: 6 }}>Vehicle Image</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ width: '100%', height: 160, borderRadius: 8, overflow: 'hidden', background: '#f4f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {vehiclePreview ? (
                        <img
                          src={vehiclePreview.startsWith('blob:') || vehiclePreview.startsWith('http') ? vehiclePreview : `${process.env.REACT_APP_API_URL || ''}${vehiclePreview}`}
                          alt="vehicle"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ padding: 8 }}>No vehicle image</div>
                      )}
                    </div>
                    <div>
                      <input type="file" accept="image/*" onChange={handleVehicleFileChange} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {error && <div className="edit-profile-error-message">{error}</div>}
          {success && <div className="edit-profile-success-message">{success}</div>}

          {/* Actions */}
          <div className="edit-profile-modal-actions">
            <button type="button" className="edit-profile-btn edit-profile-btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="edit-profile-btn edit-profile-btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfileModal;
