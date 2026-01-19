import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMapPin, FiPlus, FiEdit2, FiTrash2, FiX, FiStar } from 'react-icons/fi';
import addressService from '../services/addressService';
import QuickNavSidebar from '../components/QuickNavSidebar';
import ConfirmDialog from '../components/ConfirmDialog';
import Dropdown from '../components/Dropdown';
import '../styles/SubPage.css';

const AddressesPage = () => {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    label: 'Home',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'Sri Lanka'
  });

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      setLoading(true);
      const data = await addressService.getAddresses();
      setAddresses(data || []);
    } catch (err) {
      setError('Failed to load addresses');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (address = null) => {
    if (address) {
      setEditingAddress(address);
      setFormData({
        label: address.label || 'Home',
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        postalCode: address.postalCode || '',
        country: address.country || 'Sri Lanka'
      });
    } else {
      setEditingAddress(null);
      setFormData({
        label: 'Home',
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'Sri Lanka'
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAddress(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAddress) {
        await addressService.updateAddress(editingAddress._id, formData);
      } else {
        await addressService.createAddress(formData);
      }
      loadAddresses();
      handleCloseModal();
    } catch (err) {
      setError('Failed to save address');
    }
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await addressService.deleteAddress(deletingId);
      loadAddresses();
    } catch (err) {
      setError('Failed to delete address');
    } finally {
      setShowDeleteConfirm(false);
      setDeletingId(null);
    }
  };

  const handleSetPrimary = async (id) => {
    try {
      await addressService.setPrimary(id);
      loadAddresses();
    } catch (err) {
      setError('Failed to set primary address');
    }
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>My Addresses</h1>
        <button className="header-action" onClick={() => handleOpenModal()}>
          <FiPlus size={20} />
        </button>
      </header>

      <div className="sub-content">
        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : addresses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📍</div>
            <h3>No addresses saved</h3>
            <p>Add an address for faster checkout</p>
            <button className="btn" onClick={() => handleOpenModal()}>
              Add Address
            </button>
          </div>
        ) : (
          <div className="card-list">
            {addresses.map(address => (
              <div key={address._id} className="card-item" style={{ cursor: 'default' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiMapPin size={18} color="var(--primary-color)" />
                    <h3 className="card-title">{address.label}</h3>
                  </div>
                  {address.isDefault && (
                    <span className="card-badge primary">
                      <FiStar size={12} /> Primary
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <p>{address.street}</p>
                  <p>{address.city}, {address.state} {address.postalCode}</p>
                  <p>{address.country}</p>
                </div>
                <div className="card-actions" style={{ marginTop: 12 }}>
                  {!address.isDefault && (
                    <button 
                      className="card-action-btn primary"
                      onClick={() => handleSetPrimary(address._id)}
                    >
                      <FiStar size={14} /> Set Primary
                    </button>
                  )}
                  <button 
                    className="card-action-btn secondary"
                    onClick={() => handleOpenModal(address)}
                  >
                    <FiEdit2 size={14} /> Edit
                  </button>
                  <button 
                    className="card-action-btn danger"
                    onClick={() => handleDelete(address._id)}
                  >
                    <FiTrash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingAddress ? 'Edit Address' : 'Add Address'}</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                <FiX size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Label</label>
                  <Dropdown
                    options={[
                      { value: 'Home', label: 'Home' },
                      { value: 'Work', label: 'Work' },
                      { value: 'Other', label: 'Other' },
                    ]}
                    value={formData.label}
                    onChange={(val) => setFormData({ ...formData, label: val })}
                    placeholder="Select label"
                  />
                </div>
                <div className="form-group">
                  <label>Street Address</label>
                  <input
                    type="text"
                    value={formData.street}
                    onChange={e => setFormData({ ...formData, street: e.target.value })}
                    placeholder="123 Main Street"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Colombo"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>State/Province</label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={e => setFormData({ ...formData, state: e.target.value })}
                      placeholder="Western Province"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Postal Code</label>
                    <input
                      type="text"
                      value={formData.postalCode}
                      onChange={e => setFormData({ ...formData, postalCode: e.target.value })}
                      placeholder="10100"
                    />
                  </div>
                  <div className="form-group">
                    <label>Country</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={e => setFormData({ ...formData, country: e.target.value })}
                      placeholder="Sri Lanka"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-cancel" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-submit">
                  {editingAddress ? 'Update' : 'Add'} Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom navigation is now rendered globally in App.js */}
      
      {/* Quick Navigation Sidebar */}
      <QuickNavSidebar />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeletingId(null); }}
        onConfirm={confirmDelete}
        title="Delete Address"
        message="Are you sure you want to delete this address?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default AddressesPage;
