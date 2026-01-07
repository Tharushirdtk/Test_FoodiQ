import React from 'react';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import '../styles/ConfirmDialog.css';

/**
 * Modern Confirm Dialog Component
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - onConfirm: () => void
 *  - title: string (optional, default: "Confirm Action")
 *  - message: string
 *  - confirmText: string (optional, default: "Confirm")
 *  - cancelText: string (optional, default: "Cancel")
 *  - variant: 'danger' | 'warning' | 'info' (optional, default: 'danger')
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const getIconColor = () => {
    switch (variant) {
      case 'danger': return 'var(--danger-color)';
      case 'warning': return 'var(--warning-color)';
      case 'info': return 'var(--primary-color)';
      default: return 'var(--danger-color)';
    }
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <button className="confirm-dialog-close" onClick={onClose}>
          <FiX size={20} />
        </button>
        
        <div className="confirm-dialog-icon" style={{ backgroundColor: `${getIconColor()}15`, color: getIconColor() }}>
          <FiAlertTriangle size={28} />
        </div>
        
        <h3 className="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-message">{message}</p>
        
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose}>
            {cancelText}
          </button>
          <button className={`confirm-dialog-btn confirm ${variant}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
