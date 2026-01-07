import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiMessageCircle, FiPhone, FiMail, FiChevronRight, FiX } from 'react-icons/fi';
import supportService from '../services/supportService';
import QuickNavSidebar from '../components/QuickNavSidebar';
import Dropdown from '../components/Dropdown';
import '../styles/SubPage.css';

const SupportPage = () => {
  const navigate = useNavigate();
  const [showContactModal, setShowContactModal] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const faqs = [
    {
      question: 'How do I track my order?',
      answer: 'You can track your order by going to "My Orders" in your account. Click on any order to see real-time delivery updates.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept Visa, Mastercard, and Cash on Delivery. You can manage your payment methods in the Payment section of your account.'
    },
    {
      question: 'How can I cancel my order?',
      answer: 'You can cancel your order within 2 minutes of placing it. Go to My Orders, select the order, and click Cancel. After preparation begins, cancellation is not possible.'
    },
    {
      question: 'What is your delivery area?',
      answer: 'We currently deliver within Colombo and surrounding areas. Enter your address during checkout to confirm availability in your area.'
    },
    {
      question: 'How do I report an issue with my order?',
      answer: 'If you have any issues with your order, please contact us immediately through this support page or call our hotline.'
    },
    {
      question: 'Can I change my delivery address?',
      answer: 'You can change your delivery address before the order is confirmed. Once the order is being prepared, the address cannot be changed.'
    }
  ];

  const [expandedFaq, setExpandedFaq] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await supportService.submitTicket(formData);
      setSuccess(true);
      setFormData({ subject: '', message: '', email: '' });
      setTimeout(() => {
        setShowContactModal(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Help & Support</h1>
      </header>

      <div className="sub-content">
        {/* Contact Options */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-dark)' }}>
            Contact Us
          </h3>
          <div className="card-list faq-list">
            <div 
              className="card-item" 
              onClick={() => setShowContactModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <div style={{ 
                width: 48, 
                height: 48, 
                borderRadius: 12, 
                background: 'rgba(255, 107, 53, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-color)'
              }}>
                <FiMessageCircle size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-dark)' }}>
                  Send a Message
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-gray)' }}>
                  We'll respond within 24 hours
                </p>
              </div>
              <FiChevronRight size={20} color="var(--text-gray)" />
            </div>

            <a 
              href="tel:+94112345678" 
              className="card-item" 
              style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none' }}
            >
              <div style={{ 
                width: 48, 
                height: 48, 
                borderRadius: 12, 
                background: 'rgba(76, 175, 80, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--success-color)'
              }}>
                <FiPhone size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-dark)' }}>
                  Call Us
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-gray)' }}>
                  +94 11 234 5678
                </p>
              </div>
              <FiChevronRight size={20} color="var(--text-gray)" />
            </a>

            <a 
              href="mailto:support@foodiq.com" 
              className="card-item" 
              style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none' }}
            >
              <div style={{ 
                width: 48, 
                height: 48, 
                borderRadius: 12, 
                background: 'rgba(33, 150, 243, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2196F3'
              }}>
                <FiMail size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-dark)' }}>
                  Email Us
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-gray)' }}>
                  support@foodiq.com
                </p>
              </div>
              <FiChevronRight size={20} color="var(--text-gray)" />
            </a>
          </div>
        </div>

        {/* FAQs */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-dark)' }}>
            Frequently Asked Questions
          </h3>
          <div className="card-list faq-list">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="card-item" 
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-dark)', flex: 1 }}>
                    {faq.question}
                  </h4>
                  <FiChevronRight 
                    size={18} 
                    color="var(--text-gray)"
                    style={{ 
                      transform: expandedFaq === index ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }} 
                  />
                </div>
                {expandedFaq === index && (
                  <p style={{ 
                    margin: '12px 0 0', 
                    fontSize: 13, 
                    color: 'var(--text-gray)', 
                    lineHeight: 1.6,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border-color)'
                  }}>
                    {faq.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Send a Message</h2>
              <button className="modal-close" onClick={() => setShowContactModal(false)}>
                <FiX size={24} />
              </button>
            </div>
            {success ? (
              <div className="modal-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <h3 style={{ color: 'var(--text-dark)', marginBottom: 8 }}>Message Sent!</h3>
                <p style={{ color: 'var(--text-gray)' }}>We'll get back to you soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {error && <div className="error-message">{error}</div>}
                  <div className="form-group">
                    <label>Your Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Subject</label>
                    <Dropdown
                      options={[
                        { value: '', label: 'Select a topic' },
                        { value: 'order', label: 'Order Issue' },
                        { value: 'delivery', label: 'Delivery Problem' },
                        { value: 'payment', label: 'Payment Issue' },
                        { value: 'account', label: 'Account Help' },
                        { value: 'feedback', label: 'Feedback' },
                        { value: 'other', label: 'Other' },
                      ]}
                      value={formData.subject}
                      onChange={(val) => setFormData({ ...formData, subject: val })}
                      placeholder="Select a topic"
                    />
                  </div>
                  <div className="form-group">
                    <label>Message</label>
                    <textarea
                      value={formData.message}
                      onChange={e => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Describe your issue or question..."
                      required
                      rows={5}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-cancel" onClick={() => setShowContactModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-submit" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bottom navigation is now rendered globally in App.js */}
      
      {/* Quick Navigation Sidebar */}
      <QuickNavSidebar />
    </div>
  );
};

export default SupportPage;
