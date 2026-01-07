const axios = require('axios');

/**
 * SMS Provider utility supporting Infobip and mock mode
 * Uses Infobip SMS API: https://www.infobip.com/docs/api/channels/sms
 */

// Send SMS via Infobip
const sendSmsInfobip = async (phone, message) => {
  const apiKey = process.env.SMS_API_KEY;
  const baseUrl = process.env.SMS_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error('Infobip SMS credentials not configured');
  }

  const response = await axios.post(
    `https://${baseUrl}/sms/2/text/advanced`,
    {
      messages: [
        {
          destinations: [{ to: phone }],
          from: 'FoodiQ',
          text: message,
        },
      ],
    },
    {
      headers: {
        Authorization: `App ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  return response.data;
};

// Mock SMS sender for development
const sendSmsMock = async (phone, message, code) => {
  console.log('='.repeat(50));
  console.log('📱 MOCK SMS SENT');
  console.log(`To: ${phone}`);
  console.log(`Message: ${message}`);
  if (code) {
    console.log(`Verification Code: ${code}`);
  }
  console.log('='.repeat(50));
  
  return { 
    success: true, 
    mock: true,
    // In mock mode, return the code for testing purposes
    ...(process.env.SMS_MOCK_RETURN_CODE === 'true' && { code })
  };
};

// Send verification code SMS
const sendVerificationCode = async (phone, code) => {
  const message = `Your FoodiQ verification code is: ${code}. This code expires in 15 minutes. Do not share this code with anyone.`;

  // Use mock mode if enabled
  if (process.env.SMS_MOCK === 'true') {
    return sendSmsMock(phone, message, code);
  }

  try {
    const result = await sendSmsInfobip(phone, message);
    return { success: true, result };
  } catch (error) {
    console.error('SMS send error:', error.response?.data || error.message);
    throw new Error('Failed to send SMS. Please try again later.');
  }
};

// Send generic SMS
const sendSms = async (phone, message) => {
  if (process.env.SMS_MOCK === 'true') {
    return sendSmsMock(phone, message);
  }

  try {
    const result = await sendSmsInfobip(phone, message);
    return { success: true, result };
  } catch (error) {
    console.error('SMS send error:', error.response?.data || error.message);
    throw new Error('Failed to send SMS. Please try again later.');
  }
};

module.exports = {
  sendVerificationCode,
  sendSms,
};
