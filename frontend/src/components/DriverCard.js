import React from 'react';
import { FiPhone, FiMessageSquare } from 'react-icons/fi';

const DriverCard = ({ driver, onCall, onChat, onAvatarClick, showChat = true, showCall = true, role }) => {
  if (!driver) {
    return (
      <div className="driver-card driver-card-placeholder">
        <div className="driver-image">🚗</div>
        <div className="driver-info">
          <h3>Assigning driver...</h3>
          <p>Your delivery driver will be assigned shortly</p>
        </div>
      </div>
    );
  }
  return (
    <div className="driver-card">
      <div className="driver-image" onClick={() => onAvatarClick && onAvatarClick(driver)} style={{ cursor: onAvatarClick ? 'pointer' : 'default' }}>
        {driver.avatar ? <img src={driver.avatar} alt={driver.name} /> : '👤'}
      </div>
      <div className="driver-info">
        <h3>{driver.displayName || driver.name || (driver.user && (driver.user.displayName || driver.user.name))}</h3>
        <p>{role === 'vendor' ? 'Assigned Delivery Driver' : role === 'customer' ? 'Your Delivery Driver' : 'Delivery Driver'}</p>
        {
          (() => {
            // Prefer driver.user.driverProfile when available (authoritative), else fall back to driver fields
            const userProfile = driver.user && driver.user.driverProfile ? driver.user.driverProfile : null;
            const rating = userProfile && typeof userProfile.rating === 'number' ? userProfile.rating : (typeof driver.rating === 'number' ? driver.rating : null);
            const trips = userProfile && typeof userProfile.trips === 'number' ? userProfile.trips : (driver.trips || 0);
            return (
              <div className="driver-rating">{typeof rating === 'number' ? `⭐ ${rating} • ${trips} trips` : `${trips} trips`}</div>
            );
          })()
        }
      </div>
      <div className="driver-actions">
        {showCall && <button className="btn btn-icon contact-btn" onClick={() => onCall && onCall(driver)}><FiPhone size={20} /></button>}
        {showChat && <button className="btn btn-icon contact-btn" onClick={() => onChat && onChat(driver)}><FiMessageSquare size={20} /></button>}
      </div>
    </div>
  );
};

export default DriverCard;
