import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../styles/InfoPage.css';

const TermsConditionsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="info-page">
      {/* Header */}
      <header className="info-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Terms & Conditions</h1>
      </header>

      <div className="info-content">
        <div className="info-section">
          <h2>Agreement to Terms</h2>
          <p>
            By accessing or using FoodIQ, you agree to be bound by these Terms and Conditions. 
            If you disagree with any part of these terms, you may not access the service.
          </p>
        </div>

        <div className="info-section">
          <h2>Definitions</h2>
          <ul>
            <li><strong>"Service"</strong> refers to the FoodIQ mobile application and website</li>
            <li><strong>"User"</strong> refers to any individual who accesses or uses the Service</li>
            <li><strong>"Order"</strong> refers to a request for food items placed through the Service</li>
            <li><strong>"Restaurant Partner"</strong> refers to food establishments listed on our platform</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>User Accounts</h2>
          <h3>Registration</h3>
          <p>
            To use certain features of the Service, you must register for an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate and complete information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Promptly update any changes to your information</li>
            <li>Accept responsibility for all activities under your account</li>
          </ul>

          <h3>Account Termination</h3>
          <p>
            We reserve the right to suspend or terminate your account if you violate these Terms 
            or engage in fraudulent activity.
          </p>
        </div>

        <div className="info-section">
          <h2>Orders and Payments</h2>
          <h3>Placing Orders</h3>
          <ul>
            <li>All orders are subject to acceptance by the Restaurant Partner</li>
            <li>Prices displayed are in Sri Lankan Rupees (LKR) unless otherwise stated</li>
            <li>Prices may vary from in-restaurant prices</li>
            <li>We reserve the right to refuse or cancel orders at our discretion</li>
          </ul>

          <h3>Payment</h3>
          <ul>
            <li>Payment is required at the time of ordering</li>
            <li>We accept various payment methods including cards and cash on delivery</li>
            <li>All payment information is processed securely</li>
          </ul>

          <h3>Cancellations and Refunds</h3>
          <ul>
            <li>Orders may be cancelled before preparation begins</li>
            <li>Refunds are processed within 5-7 business days</li>
            <li>Refund eligibility is determined on a case-by-case basis</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>Delivery</h2>
          <ul>
            <li>Delivery times are estimates and may vary</li>
            <li>You must provide accurate delivery address and contact information</li>
            <li>Someone must be available to receive the order at delivery</li>
            <li>We are not responsible for delays due to circumstances beyond our control</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>User Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose</li>
            <li>Harass, abuse, or harm other users or delivery personnel</li>
            <li>Submit false or misleading information</li>
            <li>Attempt to gain unauthorized access to the Service</li>
            <li>Interfere with the proper functioning of the Service</li>
            <li>Use automated systems to access the Service without permission</li>
            <li>Engage in any form of fraud</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by 
            FoodIQ and are protected by international copyright, trademark, and other 
            intellectual property laws.
          </p>
          <p>
            You may not copy, modify, distribute, or create derivative works based on our 
            content without express written permission.
          </p>
        </div>

        <div className="info-section">
          <h2>Disclaimers</h2>
          <ul>
            <li>The Service is provided "as is" without warranties of any kind</li>
            <li>We do not guarantee the accuracy of restaurant information or menu items</li>
            <li>We are not responsible for food quality, which is the Restaurant Partner's responsibility</li>
            <li>We do not guarantee uninterrupted or error-free service</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, FoodIQ shall not be liable for any indirect, 
            incidental, special, consequential, or punitive damages resulting from:
          </p>
          <ul>
            <li>Your use or inability to use the Service</li>
            <li>Any food-related illness or allergic reactions</li>
            <li>Unauthorized access to your account</li>
            <li>Any third-party conduct on the Service</li>
          </ul>
        </div>

        <div className="info-section">
          <h2>Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless FoodIQ and its officers, directors, 
            employees, and agents from any claims, damages, losses, or expenses arising 
            from your use of the Service or violation of these Terms.
          </p>
        </div>

        <div className="info-section">
          <h2>Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of 
            Sri Lanka, without regard to its conflict of law provisions. Any disputes shall 
            be resolved in the courts of Colombo, Sri Lanka.
          </p>
        </div>

        <div className="info-section">
          <h2>Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify users 
            of any material changes. Continued use of the Service after changes constitutes 
            acceptance of the modified Terms.
          </p>
        </div>

        <div className="info-section">
          <h2>Contact Information</h2>
          <p>For questions about these Terms, please contact us:</p>
          <ul>
            <li>Email: <a href="mailto:legal@foodiq.com">legal@foodiq.com</a></li>
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

export default TermsConditionsPage;
