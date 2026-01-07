import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

const contactService = {
  // Get all contacts
  getContacts: async () => {
    const response = await axios.get(`${API_URL}/api/contacts`, getAuthHeader());
    return response.data;
  },

  // Add new contact
  addContact: async (contactData) => {
    const response = await axios.post(`${API_URL}/api/contacts`, contactData, getAuthHeader());
    return response.data;
  },

  // Update contact
  updateContact: async (contactId, contactData) => {
    const response = await axios.put(`${API_URL}/api/contacts/${contactId}`, contactData, getAuthHeader());
    return response.data;
  },

  // Delete contact
  deleteContact: async (contactId) => {
    const response = await axios.delete(`${API_URL}/api/contacts/${contactId}`, getAuthHeader());
    return response.data;
  },

  // Set primary contact
  setPrimaryContact: async (contactId) => {
    const response = await axios.put(`${API_URL}/api/contacts/${contactId}/primary`, {}, getAuthHeader());
    return response.data;
  },

  // Send verification code to contact
  sendVerificationCode: async (contactId) => {
    const response = await axios.post(`${API_URL}/api/contacts/${contactId}/send-code`, {}, getAuthHeader());
    return response.data;
  },

  // Verify contact with code
  verifyContact: async (contactId, code) => {
    const response = await axios.post(`${API_URL}/api/contacts/${contactId}/verify`, { code }, getAuthHeader());
    return response.data;
  },
};

export default contactService;
