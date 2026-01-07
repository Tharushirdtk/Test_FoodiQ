import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../styles/InfoPage.css';

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="info-page">
      {/* Header */}
      <header className="info-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Privacy Policy</h1>
      </header>

      <div className="info-content">
        <div className="info-section">
          <h2>Introduction</h2>
          <p>
            Welcome to FoodIQ. We are committed to protecting your personal information 
            and your right to privacy. This Privacy Policy explains how we collect, use, 
            disclose, and safeguard your information when you use our mobile application 
            and services.
          </p>
          <p>
            Please read this privacy policy carefully. If you do not agree with the terms 
            of this privacy policy, please do not access the application.
          </p>
        </div>

        <div className="info-section">
          <h2>Information We Collect</h2>
          
          <h3>Personal Information</h3>
          <p>We may collect personal information that you voluntarily provide to us when you:</p>
          <ul>
            <li>Register for an account</li>
            <li>Place an order</li>
            <li>Contact customer support</li>
            <li>Participate in promotions or surveys</li>
          </ul>
          <p>This information may include:</p>
          <ul>
            <li><strong>Name</strong> - to personalize your experience</li>
            <li><strong>Email address</strong> - for account verification and communication</li>
            <li><strong>Phone number</strong> - for order updates and delivery coordination</li>
            <li><strong>Delivery address</strong> - to fulfill your orders</li>
            <li><strong>Payment information</strong> - to process transactions (securely handled by payment processors)</li>
          </ul>

          <h3>Automatically Collected Information</h3>
          <p>When you use our app, we automatically collect certain information including:</p>
          <ul>
            <li>Device information (type, operating system, unique device identifiers)</li>
            <li>Usage data (pages visited, time spent, features used)</li>
            <li>Location data (with your consent) for delivery services</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>How We Use Your Information</h2>
          <p>We use the collected information for various purposes:</p>
          <ul>
            <li>To process and fulfill your food orders</li>
            <li>To create and manage your user account</li>
            <li>To send you order confirmations and updates</li>
            <li>To provide customer support and respond to inquiries</li>
            <li>To send promotional communications (with your consent)</li>
            <li>To improve our app and services</li>
            <li>To detect and prevent fraud</li>
            <li>To comply with legal obligations</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>Sharing Your Information</h2>
          <p>We may share your information with:</p>
          <ul>
            <li><strong>Restaurant partners</strong> - to prepare your orders</li>
            <li><strong>Delivery drivers</strong> - to deliver your orders</li>
            <li><strong>Payment processors</strong> - to process transactions</li>
            <li><strong>Service providers</strong> - who assist in operating our app</li>
            <li><strong>Legal authorities</strong> - when required by law</li>
          </ul>
          <p>
            We do not sell your personal information to third parties for marketing purposes.
          </p>
        </div>

        <div className="info-section">
          <h2>Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect 
            your personal information. However, no method of transmission over the Internet 
            or electronic storage is 100% secure.
          </p>
          <p>Security measures include:</p>
          <ul>
            <li>Encryption of sensitive data in transit and at rest</li>
            <li>Secure password hashing</li>
            <li>Regular security audits</li>
            <li>Access controls and authentication</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal information</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Opt-out of marketing communications</li>
            <li>Withdraw consent where applicable</li>
          </ul>
          <p>
            To exercise these rights, please contact us at <a href="mailto:privacy@foodiq.com">privacy@foodiq.com</a>
          </p>
        </div>

        <div className="info-section">
          <h2>Cookies and Tracking</h2>
          <p>
            We use cookies and similar tracking technologies to track activity on our app 
            and hold certain information. You can instruct your browser to refuse all cookies 
            or indicate when a cookie is being sent.
          </p>
        </div>

        <div className="info-section">
          <h2>Children's Privacy</h2>
          <p>
            Our service is not intended for children under 13 years of age. We do not knowingly 
            collect personal information from children under 13. If you become aware that a 
            child has provided us with personal information, please contact us.
          </p>
        </div>

        <div className="info-section">
          <h2>Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. We will notify you of any 
            changes by posting the new privacy policy on this page and updating the 
            "Last Updated" date.
          </p>
        </div>

        <div className="info-section">
          <h2>Contact Us</h2>
          <p>If you have questions about this Privacy Policy, please contact us:</p>
          <ul>
            <li>Email: <a href="mailto:privacy@foodiq.com">privacy@foodiq.com</a></li>
            <li>Phone: +94 11 234 5678</li>
            <li>Address: 123 Food Street, Colombo, Sri Lanka</li>
          </ul>
        </div>

        <p className="last-updated">Last Updated: January 1, 2026</p>
      </div>

      {/* Bottom navigation is now rendered globally in App.js */}
    </div>
  );
};

export default PrivacyPolicyPage;
