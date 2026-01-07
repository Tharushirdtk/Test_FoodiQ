import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiCamera, FiTrash2 } from 'react-icons/fi';
import profileService from '../services/profileService';
import DatePicker from './DatePicker';
import Dropdown from './Dropdown';
import '../styles/EditProfileModal.css';

const EditProfileModal = ({ isOpen, onClose, user, onProfileUpdated }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    displayName: user?.displayName || '',
    birthdate: user?.birthdate ? new Date(user.birthdate) : null,
    gender: user?.gender || '',
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const [avatarFile, setAvatarFile] = useState(null);
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
      });
      setAvatarPreview(user?.avatar || null);
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

      // Update profile data
      const res = await profileService.updateProfile({
        name: formData.name,
        displayName: formData.displayName || null,
        birthdate: formData.birthdate || null,
        gender: formData.gender || null,
      });

      setSuccess('Profile updated successfully!');
      
      // Notify parent of update and wait for refresh
      if (onProfileUpdated) {
        await onProfileUpdated({
          ...res.user,
          avatar: newAvatarUrl,
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
                <FiCamera size={24} />
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
                Change Photo
              </button>
              {avatarPreview && (
                <button type="button" className="edit-profile-btn-text edit-profile-btn-danger" onClick={handleRemoveAvatar}>
                  <FiTrash2 size={14} /> Remove
                </button>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="edit-profile-form-fields">
            <div className="edit-profile-form-group">
              <label htmlFor="name">Full Name *</label>
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
          </div>

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
