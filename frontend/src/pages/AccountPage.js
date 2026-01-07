import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { FiSettings, FiMapPin, FiHeart, FiCreditCard, FiMessageSquare, FiLogOut, FiCheck, FiAlertCircle, FiPackage, FiBell, FiEdit2, FiCalendar, FiUser, FiPlus, FiTrash2, FiStar } from 'react-icons/fi';
import NotificationsButton from '../components/NotificationsButton';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import PhoneVerificationModal from '../components/PhoneVerificationModal';
import EditProfileModal from '../components/EditProfileModal';
import ConfirmDialog from '../components/ConfirmDialog';
import Dropdown from '../components/Dropdown';
import contactService from '../services/contactService';
import '../styles/AccountPage.css';

const AccountPage = () => {
  const { user, logout, isAuthenticated, isGuest, loading, refreshUser } = useAuth();
  const { darkMode, pushNotifications, toggleDarkMode, togglePushNotifications, loadPreferences } = useTheme();
  const userData = user || { name: 'Guest User', email: '', phone: '', avatar: '👤' };
  const navigate = useNavigate();

  // Phone verification state
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [phoneError, setPhoneError] = useState(null);
  const [phoneSuccess, setPhoneSuccess] = useState(null);
  
  // Edit profile modal state
  const [showEditModal, setShowEditModal] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactLabel, setNewContactLabel] = useState('Mobile');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [verifyingContact, setVerifyingContact] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState(null);

  // Load contacts
  const loadContacts = async () => {
    try {
      const data = await contactService.getContacts();
      setContacts(data || []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      loadContacts();
    }
  }, [isAuthenticated, isGuest]);

  useEffect(() => {
    // Wait for auth loading to complete before redirecting
    if (!loading && !isAuthenticated && !isGuest) {
      navigate('/login');
    }
  }, [loading, isAuthenticated, isGuest, navigate]);

  // Load preferences when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadPreferences();
    }
  }, [isAuthenticated, loadPreferences]);

  // quickActions: show full set for authenticated users, only support for guests
  const quickActions = isGuest
    ? [
        { id: 6, icon: <FiMessageSquare size={24} />, label: 'Help & Support', subtitle: 'Get assistance', color: '#FF9800', path: '/support' }
      ]
    : [
        { id: 1, icon: <FiPackage size={24} />, label: 'My Orders', subtitle: 'Track your orders', color: '#FF6B35', path: '/orders' },
        { id: 2, icon: <FiMapPin size={24} />, label: 'Addresses', subtitle: 'Manage locations', color: '#4CAF50', path: '/account/addresses' },
        { id: 3, icon: <FiHeart size={24} />, label: 'Favorites', subtitle: 'Saved items', color: '#E91E63', path: '/account/favorites' },
        { id: 4, icon: <FiCreditCard size={24} />, label: 'Payment', subtitle: 'Cards & wallet', color: '#2196F3', path: '/account/payment' },
        { id: 5, icon: <FiBell size={24} />, label: 'Notifications', subtitle: 'Alerts & updates', color: '#9C27B0', path: '/account/notifications' },
        { id: 6, icon: <FiMessageSquare size={24} />, label: 'Help & Support', subtitle: 'Get assistance', color: '#FF9800', path: '/support' }
      ];

  // handleUpdatePhone removed because phone update UI isn't active in this page

  const handleVerificationSuccess = () => {
    setShowVerifyModal(false);
    setVerifyingContact(null);
    setPhoneSuccess('Phone verified successfully!');
    setTimeout(() => setPhoneSuccess(null), 3000);
    loadContacts(); // Reload contacts to update verification status
  };

  const handleProfileUpdated = async (updatedUser) => {
    // Refresh user data from server
    await refreshUser();
  };

  // Contact management functions
  const handleAddContact = async () => {
    if (!newContactPhone) {
      setPhoneError('Please enter a phone number');
      return;
    }
    setContactsLoading(true);
    setPhoneError(null);
    try {
      await contactService.addContact({
        label: newContactLabel,
        number: newContactPhone,
      });
      setPhoneSuccess('Contact added successfully!');
      setTimeout(() => setPhoneSuccess(null), 3000);
      setShowAddContact(false);
      setNewContactPhone('');
      setNewContactLabel('Mobile');
      loadContacts();
    } catch (err) {
      setPhoneError(err?.response?.data?.message || 'Failed to add contact');
    } finally {
      setContactsLoading(false);
    }
  };

  const handleDeleteContact = (contactId) => {
    setDeletingContactId(contactId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteContact = async () => {
    if (!deletingContactId) return;
    try {
      await contactService.deleteContact(deletingContactId);
      setPhoneSuccess('Contact deleted successfully!');
      setTimeout(() => setPhoneSuccess(null), 3000);
      loadContacts();
    } catch (err) {
      setPhoneError(err?.response?.data?.message || 'Failed to delete contact');
    } finally {
      setDeletingContactId(null);
    }
  };

  const handleSetPrimary = async (contactId) => {
    try {
      await contactService.setPrimaryContact(contactId);
      setPhoneSuccess('Primary contact updated!');
      setTimeout(() => setPhoneSuccess(null), 3000);
      loadContacts();
      refreshUser();
    } catch (err) {
      setPhoneError(err?.response?.data?.message || 'Failed to set primary contact');
    }
  };

  // Helper to format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // Helper to format gender
  const formatGender = (gender) => {
    if (!gender) return 'Not set';
    const labels = {
      male: 'Male',
      female: 'Female',
      other: 'Other',
      prefer_not_to_say: 'Prefer not to say',
    };
    return labels[gender] || gender;
  };

  // Get avatar display
  const getAvatarDisplay = () => {
    if (userData.avatar && typeof userData.avatar === 'string') {
      if (userData.avatar.startsWith('/uploads') || userData.avatar.startsWith('http')) {
        const src = userData.avatar.startsWith('http') 
          ? userData.avatar 
          : `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}${userData.avatar}`;
        return <img src={src} alt="Avatar" className="profile-avatar-img" />;
      }
    }
    return <span className="profile-avatar-text">{userData.avatar || '👤'}</span>;
  };

  return (
    <div className="account-page">
      {/* Header */}
      <header className="account-header">
            <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
              <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
            </button>
            <h1>My Account</h1>
            <button
              className="btn btn-icon"
              onClick={() => {
                const el = document.getElementById('preferences');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                else navigate('/account/settings');
              }}
            >
              <FiSettings size={24} />
            </button>
            <div style={{ marginLeft: 10, display: 'inline-block' }}>
              <NotificationsButton />
            </div>
          </header>

        <div className="account-content">
        {/* Profile Card */}
        <div className="profile-card">
          <div className="profile-avatar">{getAvatarDisplay()}</div>
          <div className="profile-info">
              <h2>{userData.displayName || userData.name}</h2>
              {userData.displayName && userData.name !== userData.displayName && (
                <p className="profile-full-name">{userData.name}</p>
              )}
              <p>{userData.email}</p>
              {userData.phone && <p className="profile-phone">{userData.phone}</p>}
              {isGuest && (
                <div className="guest-banner">
                  <p>You are browsing as a guest.</p>
                  <div className="guest-actions" style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center', alignItems: 'center' }}>
                    <button className="btn" onClick={() => navigate('/login')}>Login</button>
                    <button className="btn btn-secondary" onClick={() => navigate('/register')}>Register</button>
                  </div>
                </div>
              )}
          </div>
          {!isGuest && (
            <button className="btn btn-secondary edit-profile-btn" onClick={() => setShowEditModal(true)}>
              <FiEdit2 size={16} />
              Edit Profile
            </button>
          )}
        </div>

        {/* User Details - Only for authenticated users */}
        {isAuthenticated && !isGuest && (
          <div className="section user-details-section">
            <h3>Personal Information</h3>
            <div className="details-grid">
              <div className="detail-item">
                <div className="detail-icon">
                  <FiUser size={18} />
                </div>
                <div className="detail-content">
                  <span className="detail-label">Display Name</span>
                  <span className="detail-value">{userData.displayName || 'Not set'}</span>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon">
                  <FiCalendar size={18} />
                </div>
                <div className="detail-content">
                  <span className="detail-label">Date of Birth</span>
                  <span className="detail-value">{formatDate(userData.birthdate)}</span>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon">
                  <FiUser size={18} />
                </div>
                <div className="detail-content">
                  <span className="detail-label">Gender</span>
                  <span className="detail-value">{formatGender(userData.gender)}</span>
                </div>
              </div>
              {userData.createdAt && (
                <div className="detail-item">
                  <div className="detail-icon">
                    <FiCalendar size={18} />
                  </div>
                  <div className="detail-content">
                    <span className="detail-label">Member Since</span>
                    <span className="detail-value">{formatDate(userData.createdAt)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Verification Status - Only for authenticated users */}
        {isAuthenticated && !isGuest && (
          <div className="section verification-section">
            <h3>Account Verification</h3>
            
            {/* Email Status */}
            <div className="verification-item">
              <div className="verification-info">
                <span className="verification-label">Email</span>
                <span className="verification-value">{userData.email}</span>
              </div>
              <div className={`verification-badge ${userData.emailVerified ? 'verified' : 'unverified'}`}>
                {userData.emailVerified ? (
                  <><FiCheck size={14} /> Verified</>
                ) : (
                  <><FiAlertCircle size={14} /> Not Verified</>
                )}
              </div>
            </div>

            {/* Contacts Section */}
            <div className="contacts-section">
              <div className="contacts-header">
                <h4>Phone Numbers</h4>
                {contacts.length < 5 && (
                  <button 
                    className="btn-text-small"
                    onClick={() => setShowAddContact(!showAddContact)}
                  >
                    <FiPlus size={14} /> Add Contact
                  </button>
                )}
              </div>

              {/* Add Contact Form */}
              {showAddContact && (
                <div className="add-contact-form">
                  <div className="contact-form-row">
                    <Dropdown
                      options={[
                        { value: 'Mobile', label: 'Mobile' },
                        { value: 'Home', label: 'Home' },
                        { value: 'Work', label: 'Work' },
                        { value: 'Other', label: 'Other' },
                      ]}
                      value={newContactLabel}
                      onChange={setNewContactLabel}
                      placeholder="Label"
                      size="sm"
                      className="contact-label-dropdown"
                    />
                    <PhoneInput
                      international
                      defaultCountry="LK"
                      value={newContactPhone}
                      onChange={setNewContactPhone}
                      placeholder="Enter phone number"
                      className="phone-input-mini contact-phone-input"
                    />
                  </div>
                  <div className="contact-form-actions">
                    <button 
                      className="btn btn-small" 
                      onClick={handleAddContact} 
                      disabled={contactsLoading}
                    >
                      {contactsLoading ? 'Adding...' : 'Add'}
                    </button>
                    <button 
                      className="btn btn-small btn-secondary" 
                      onClick={() => {
                        setShowAddContact(false);
                        setNewContactPhone('');
                        setNewContactLabel('Mobile');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Contacts List */}
              {contacts.length === 0 ? (
                <p className="no-contacts">No phone numbers added yet</p>
              ) : (
                <div className="contacts-list">
                  {contacts.map((contact) => (
                    <div key={contact._id} className="contact-item">
                      <div className="contact-info">
                        <span className="contact-label">{contact.label}</span>
                        <span className="contact-number">{contact.number}</span>
                      </div>
                      <div className="contact-badges">
                        {contact.isPrimary && (
                          <span className="verification-badge primary">
                            <FiStar size={12} /> Primary
                          </span>
                        )}
                        {contact.verified ? (
                          <span className="verification-badge verified">
                            <FiCheck size={12} /> Verified
                          </span>
                        ) : (
                          <span className="verification-badge unverified">
                            <FiAlertCircle size={12} /> Unverified
                          </span>
                        )}
                      </div>
                      <div className="contact-actions">
                        {/* Verify button - only for unverified contacts */}
                        {!contact.verified && (
                          <button 
                            className="contact-action-btn verify"
                            onClick={() => {
                              setVerifyingContact(contact);
                              setShowVerifyModal(true);
                            }}
                            title="Verify"
                          >
                            <FiCheck size={16} />
                          </button>
                        )}
                        {/* Set as Primary - only for verified non-primary contacts */}
                        {contact.verified && !contact.isPrimary && contact._id !== 'primary' && (
                          <button 
                            className="contact-action-btn"
                            onClick={() => handleSetPrimary(contact._id)}
                            title="Set as Primary"
                          >
                            <FiStar size={16} />
                          </button>
                        )}
                        {/* Delete - can delete any contact */}
                        <button 
                          className="contact-action-btn delete"
                          onClick={() => handleDeleteContact(contact._id)}
                          title="Delete"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Messages */}
            {phoneError && <p className="phone-error">{phoneError}</p>}
            {phoneSuccess && <p className="phone-success">{phoneSuccess}</p>}
          </div>
        )}

        {/* Quick Actions */}
        <div className="section">
          <h3>Quick Actions</h3>
          <div className="actions-grid">
            {quickActions.map((action) => (
              <div
                key={action.id}
                className="action-card"
                onClick={() => (action.path ? navigate(action.path) : null)}
              >
                <div className="action-icon" style={{ backgroundColor: `${action.color}15`, color: action.color }}>
                  {action.icon}
                </div>
                <div className="action-info">
                  <h4>{action.label}</h4>
                  <p>{action.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div id="preferences" className="section">
          <h3>Preferences</h3>
          <div className="settings-list">
            {/* Dark Mode Toggle */}
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Dark Mode</span>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={darkMode} 
                  onChange={toggleDarkMode}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {/* Push Notifications Toggle */}
            <div className="setting-item">
              <div className="setting-info">
                <span className="setting-label">Push Notifications</span>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={pushNotifications} 
                  onChange={togglePushNotifications}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {/* Privacy Policy Link */}
            <div 
              className="setting-item" 
              onClick={() => navigate('/privacy-policy')}
              style={{ cursor: 'pointer' }}
            >
              <div className="setting-info">
                <span className="setting-label">Privacy Policy</span>
              </div>
              <span className="setting-arrow">›</span>
            </div>

            {/* Terms & Conditions Link */}
            <div 
              className="setting-item" 
              onClick={() => navigate('/terms')}
              style={{ cursor: 'pointer' }}
            >
              <div className="setting-info">
                <span className="setting-label">Terms & Conditions</span>
              </div>
              <span className="setting-arrow">›</span>
            </div>
          </div>
        </div>

        {/* Sign Out */}
        {!isGuest && isAuthenticated && (
          <button className="btn sign-out-btn" onClick={async () => { await logout(); navigate('/login'); }}>
            <FiLogOut size={20} />
            Sign Out
          </button>
        )}
      </div>

      {/* Bottom navigation is now rendered globally in App.js */}

      {/* Phone Verification Modal */}
      <PhoneVerificationModal
        isOpen={showVerifyModal}
        onClose={() => {
          setShowVerifyModal(false);
          setVerifyingContact(null);
        }}
        phone={verifyingContact?.number}
        contactId={verifyingContact?._id}
        onVerified={handleVerificationSuccess}
      />

      {/* Edit Profile Modal */}
      {isAuthenticated && !isGuest && (
        <EditProfileModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          user={userData}
          onProfileUpdated={handleProfileUpdated}
        />
      )}

      {/* Delete Contact Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeletingContactId(null);
        }}
        onConfirm={confirmDeleteContact}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default AccountPage;
