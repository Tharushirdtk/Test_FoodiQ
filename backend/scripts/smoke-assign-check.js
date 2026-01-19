require('dotenv').config();
const axios = require('axios');

// Usage:
// set environment variables or create a .env with API_URL, TOKEN, ORDER_ID
// node backend/scripts/smoke-assign-check.js

const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const TOKEN = process.env.TOKEN; // driver JWT
const ORDER_ID = process.env.ORDER_ID;

if (!TOKEN || !ORDER_ID) {
  console.error('Please set TOKEN and ORDER_ID in environment (.env)');
  process.exit(1);
}

const client = axios.create({ baseURL: API_URL, timeout: 10000, headers: { Authorization: `Bearer ${TOKEN}` } });

const run = async () => {
  try {
    console.log('Assigning driver to order', ORDER_ID);
    const assignRes = await client.post(`/orders/${ORDER_ID}/assign`);
    console.log('Assign response:', assignRes.status, assignRes.data);

    // Fetch order
    const orderRes = await client.get(`/orders/${ORDER_ID}`);
    console.log('Order after assign:', orderRes.data && orderRes.data.status ? { _id: orderRes.data._id, status: orderRes.data.status, driver: orderRes.data.driver } : orderRes.data);

    if (orderRes.data && orderRes.data.status === 'assigned') {
      console.log('Smoke check: OK - status is assigned');
    } else {
      console.warn('Smoke check: unexpected status', orderRes.data && orderRes.data.status);
    }
  } catch (e) {
    console.error('Smoke check failed:', e.response ? e.response.data : e.message || e);
  }
};

run();
