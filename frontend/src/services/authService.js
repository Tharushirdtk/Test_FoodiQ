import api from '../utils/apiClient';

const authService = {
  // Legacy register - calls step1
  register: async ({ name, email, password }) => {
    return authService.registerStep1({ name, email, password, birthdate: new Date().toISOString() });
  },

  // Step 1: Create account with basic info
  registerStep1: async ({ name, email, password, birthdate, gender }) => {
    const res = await api.post('/auth/register/step1', { name, email, password, birthdate, gender });
    return res.data;
  },

  // Step 1 validation-only endpoint
  validateStep1: async ({ name, email, password, birthdate, gender, role }) => {
    const res = await api.post('/auth/register/validate-step1', { name, email, password, birthdate, gender, role });
    return res.data;
  },

  // Step 2: Add contact and address info (legacy)
  registerStep2: async ({ userId, phone, phoneCountry, skipAddress, address }) => {
    const res = await api.post('/auth/register/step2', { userId, phone, phoneCountry, skipAddress, address });
    return res.data;
  },

  // Full registration - creates account with all info
  registerFull: async (payload) => {
    const res = await api.post('/auth/register', payload);
    return res.data;
  },

  login: async ({ email, password }) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data && res.data.token) api.setToken(res.data.token);
    return res.data;
  },

  logout: async () => {
    api.setToken(null);
    return true;
  },

  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },

  // Email verification
  verifyEmail: async (token) => {
    const res = await api.get(`/auth/verify-email?token=${token}`);
    return res.data;
  },

  resendVerificationEmail: async (email) => {
    const res = await api.post('/auth/resend-email', { email });
    return res.data;
  },

  // Password reset
  forgotPassword: async (email) => {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  },

  resetPassword: async (token, password) => {
    const res = await api.post('/auth/reset-password', { token, password });
    return res.data;
  },

  // Phone verification (public - during registration)
  sendPhoneCode: async (userId, phone, phoneCountry) => {
    const res = await api.post('/auth/send-phone-code', { userId, phone, phoneCountry });
    return res.data;
  },

  verifyPhone: async (userId, code) => {
    const res = await api.post('/auth/verify-phone', { userId, code });
    return res.data;
  },

  // Phone verification (authenticated)
  resendPhoneCode: async () => {
    const res = await api.post('/auth/resend-phone-code');
    return res.data;
  },

  verifyPhoneAuthenticated: async (code) => {
    const res = await api.post('/auth/verify-phone-authenticated', { code });
    return res.data;
  },

  updatePhone: async (phone, phoneCountry) => {
    const res = await api.put('/auth/phone', { phone, phoneCountry });
    return res.data;
  },
};

export default authService;
