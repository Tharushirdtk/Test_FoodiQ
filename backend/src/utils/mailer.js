const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Base email template with FoodiQ theme
const getEmailTemplate = (content, previewText = '') => {
  const logoUrl = 'https://i.ibb.co/qFdsPp22/logo.png';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FoodiQ</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #FF6B35 0%, #e55a2b 100%);
      padding: 32px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
      letter-spacing: -1px;
    }
    .logo-img {
      max-width: 120px;
      max-height: 80px;
      margin: 0 auto;
      display: block;
    }
    .logo-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      margin-top: 12px;
    }
    .logo-placeholder {
      width: 80px;
      height: 80px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
    }
    .content {
      padding: 40px 32px;
    }
    .content h1 {
      font-size: 24px;
      color: #333;
      margin: 0 0 16px;
    }
    .content p {
      font-size: 16px;
      line-height: 1.6;
      color: #666;
      margin: 0 0 24px;
    }
    .btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #FF6B35 0%, #e55a2b 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
    }
    .btn:hover {
      background: linear-gradient(135deg, #e55a2b 0%, #d14a1b 100%);
    }
    .code-box {
      background: #f8f9fa;
      border: 2px dashed #FF6B35;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin: 24px 0;
    }
    .code {
      font-size: 32px;
      font-weight: 700;
      color: #FF6B35;
      letter-spacing: 8px;
    }
    .footer {
      background: #f8f9fa;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .footer p {
      font-size: 13px;
      color: #999;
      margin: 0;
    }
    .footer a {
      color: #FF6B35;
      text-decoration: none;
    }
    .warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      color: #856404;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div style="padding: 24px;">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="FoodiQ Logo" class="logo-img" style="max-width: 120px; max-height: 80px;" onerror="this.style.display='none'" />
        <div class="logo-text" style="color: #ffffff; font-size: 24px; font-weight: 700; margin-top: 12px;">🍔 FoodiQ</div>
      </div>
      ${content}
      <div class="footer">
        <p>© ${new Date().getFullYear()} FoodiQ. All rights reserved.</p>
        <p>If you didn't request this email, you can safely ignore it.</p>
        <p>Questions? <a href="mailto:support@foodiq.com">Contact Support</a></p>
      </div>
    </div>
  </div>
</body>
</html>
`;
};

// Email verification template
const getVerificationEmailContent = (name, verificationUrl) => `
  <div class="content">
    <h1>Welcome to FoodiQ, ${name}! 🎉</h1>
    <p>Thank you for signing up! Please verify your email address to complete your registration and start ordering delicious food.</p>
    <p style="text-align: center;">
      <a href="${verificationUrl}" class="btn">Verify Email Address</a>
    </p>
    <p class="warning">⚠️ This link will expire in 24 hours. If you can't find this email, check your spam folder.</p>
    <p style="font-size: 14px; color: #999;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${verificationUrl}" style="color: #FF6B35; word-break: break-all;">${verificationUrl}</a></p>
  </div>
`;

// Password reset template
const getPasswordResetContent = (name, resetUrl) => `
  <div class="content">
    <h1>Reset Your Password</h1>
    <p>Hi ${name}, we received a request to reset your password. Click the button below to create a new password.</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </p>
    <p class="warning">⚠️ This link will expire in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
    <p style="font-size: 14px; color: #999;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="color: #FF6B35; word-break: break-all;">${resetUrl}</a></p>
  </div>
`;

// Phone verification code template
const getPhoneCodeEmailContent = (name, code) => `
  <div class="content">
    <h1>Your Phone Verification Code</h1>
    <p>Hi ${name}, use the code below to verify your phone number.</p>
    <div class="code-box">
      <div class="code">${code}</div>
    </div>
    <p class="warning">⚠️ This code will expire in 15 minutes. Do not share this code with anyone.</p>
  </div>
`;

// Send email verification
const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const html = getEmailTemplate(getVerificationEmailContent(user.name, verificationUrl));
  
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"FoodiQ" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: 'Verify your FoodiQ account',
    html,
    text: `Welcome to FoodiQ, ${user.name}! Please verify your email by visiting: ${verificationUrl}`,
  });
};

// Send password reset email
const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  const html = getEmailTemplate(getPasswordResetContent(user.name, resetUrl));
  
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"FoodiQ" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: 'Reset your FoodiQ password',
    html,
    text: `Hi ${user.name}, reset your password by visiting: ${resetUrl}`,
  });
};

// Send phone verification code via email (backup/dev mode)
const sendPhoneCodeEmail = async (user, code) => {
  const html = getEmailTemplate(getPhoneCodeEmailContent(user.name, code));
  
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"FoodiQ" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: 'Your FoodiQ phone verification code',
    html,
    text: `Hi ${user.name}, your verification code is: ${code}. It expires in 15 minutes.`,
  });
};

// Support email content template
const getSupportEmailContent = (customerName, customerEmail, message, userId) => `
  <h1>New Support Request</h1>
  <p>A new support ticket has been submitted.</p>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 24px 0;">
    <p style="margin: 0 0 12px;"><strong>From:</strong> ${customerName}</p>
    <p style="margin: 0 0 12px;"><strong>Email:</strong> ${customerEmail}</p>
    <p style="margin: 0 0 12px;"><strong>User ID:</strong> ${userId}</p>
    <p style="margin: 0 0 8px;"><strong>Message:</strong></p>
    <div style="background: #fff; padding: 16px; border-radius: 8px; border-left: 4px solid #FF6B35;">
      ${message.replace(/\n/g, '<br>')}
    </div>
  </div>
  
  <p style="color: #999; font-size: 14px;">This email was sent from the FoodiQ support system.</p>
`;

// Send support email to support team
const sendSupportEmail = async ({ to, subject, customerEmail, customerName, message, userId }) => {
  const html = getEmailTemplate(getSupportEmailContent(customerName, customerEmail, message, userId), 'New support request received');
  
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"FoodiQ Support" <${process.env.EMAIL_FROM}>`,
    to: to,
    replyTo: customerEmail,
    subject: subject,
    html,
    text: `New support request from ${customerName} (${customerEmail}):\n\n${message}\n\nUser ID: ${userId}`,
  });
};

// Order receipt email content template
const getOrderReceiptContent = (order, userName) => {
  const itemsHtml = order.items.map(item => {
    const optionsText = [];
    if (item.options) {
      if (item.options.size) optionsText.push(item.options.size);
      if (item.options.spiceLevel) optionsText.push(item.options.spiceLevel);
      if (item.options.extras && item.options.extras.length > 0) {
        const extrasNames = item.options.extras.map(e => typeof e === 'string' ? e : e.name).join(', ');
        optionsText.push(`+ ${extrasNames}`);
      }
      if (item.options.instructions) {
        const instr = Array.isArray(item.options.instructions) ? item.options.instructions.join(', ') : item.options.instructions;
        if (instr) optionsText.push(`📝 ${instr}`);
      }
    }
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${item.name}</strong>
          ${optionsText.length > 0 ? `<br><span style="font-size: 12px; color: #888;">${optionsText.join(' • ')}</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">Rs ${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const subtotal = order.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);
  const deliveryFee = order.deliveryFee || 200;
  const tax = order.tax || (subtotal * 0.01);
  const discount = order.discount || 0;
  const total = subtotal + deliveryFee + tax - discount;

  const addressHtml = order.address ? `
    <p style="margin: 0; color: #666;">
      ${order.address.street || ''}<br>
      ${order.address.city || ''}${order.address.zip ? ', ' + order.address.zip : ''}
    </p>
  ` : '<p style="color: #888;">Pickup</p>';

  return `
  <div class="content">
    <h1>Order Confirmed! 🎉</h1>
    <p>Hi ${userName}, thank you for your order! We're preparing your delicious food right now.</p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 24px 0;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #666;">Order ID</p>
      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #FF6B35;">#${order._id}</p>
    </div>

    <h3 style="margin: 24px 0 12px; color: #333;">Order Details</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th style="padding: 12px; text-align: left; font-weight: 600;">Item</th>
          <th style="padding: 12px; text-align: center; font-weight: 600;">Qty</th>
          <th style="padding: 12px; text-align: right; font-weight: 600;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div style="margin-top: 20px; padding-top: 16px; border-top: 2px solid #eee;">
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Subtotal</td>
          <td style="padding: 8px 0; text-align: right;">Rs ${subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Delivery Fee</td>
          <td style="padding: 8px 0; text-align: right;">Rs ${deliveryFee.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Tax</td>
          <td style="padding: 8px 0; text-align: right;">Rs ${tax.toFixed(2)}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td style="padding: 8px 0; color: #4CAF50;">Discount</td>
          <td style="padding: 8px 0; text-align: right; color: #4CAF50;">-Rs ${discount.toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr style="font-size: 18px; font-weight: 700;">
          <td style="padding: 16px 0 8px; border-top: 2px solid #333;">Total</td>
          <td style="padding: 16px 0 8px; border-top: 2px solid #333; text-align: right; color: #FF6B35;">Rs ${total.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin: 24px 0 12px; color: #333;">Delivery Address</h3>
    <div style="background: #f8f9fa; padding: 16px; border-radius: 12px;">
      ${addressHtml}
    </div>

    <div style="margin-top: 32px; text-align: center;">
      <a href="${process.env.FRONTEND_URL}/order/${order._id}" class="btn">Track Your Order</a>
    </div>

    <p style="margin-top: 24px; font-size: 14px; color: #888; text-align: center;">
      Estimated delivery: 30-45 minutes
    </p>
  </div>
`;
};

// Send order receipt email
const sendOrderReceiptEmail = async (user, order) => {
  const html = getEmailTemplate(getOrderReceiptContent(order, user.name || 'Customer'), 'Your FoodiQ order is confirmed!');
  
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"FoodiQ" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: `Order Confirmed! #${order._id}`,
    html,
    text: `Hi ${user.name || 'Customer'}, your order #${order._id} has been confirmed! Total: Rs ${order.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0).toFixed(2)}. Track your order at: ${process.env.FRONTEND_URL}/order/${order._id}`,
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPhoneCodeEmail,
  sendSupportEmail,
  sendOrderReceiptEmail,
};
