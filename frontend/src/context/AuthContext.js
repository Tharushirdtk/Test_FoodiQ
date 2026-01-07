import React, { createContext, useContext, useEffect, useState } from 'react';
import authService from '../services/authService';
import api from '../utils/apiClient';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const loadUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      api.setToken(token);
      const me = await authService.getMe();
      setUser(me);
    } catch (err) {
      api.setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legacy register - redirects to step 1
  const register = async (payload) => {
    return registerStep1(payload);
  };

  // Step 1: Just validates (no longer creates account)
  const registerStep1 = async (payload) => {
    const data = await authService.registerStep1(payload);
    return data;
  };

  // Step 2: Add contact and address info (legacy - kept for compatibility)
  const registerStep2 = async (payload) => {
    const data = await authService.registerStep2(payload);
    return data;
  };

  // Full registration - creates account with all info in one call
  const registerFull = async (payload) => {
    const data = await authService.registerFull(payload);
    return data;
  };

  const login = async (payload) => {
    const data = await authService.login(payload);
    if (data) {
      try {
        const me = await authService.getMe();
        setUser(me);
        setIsGuest(false);
      } catch (e) {
        setUser(null);
      }
    }
    return data;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setIsGuest(false);
  };

  const continueAsGuest = () => {
    // clear any token and mark guest mode
    api.setToken(null);
    setUser(null);
    setIsGuest(true);
  };

  // Email verification
  const verifyEmail = async (token) => {
    return authService.verifyEmail(token);
  };

  const resendVerificationEmail = async (email) => {
    return authService.resendVerificationEmail(email);
  };

  // Password reset
  const forgotPassword = async (email) => {
    return authService.forgotPassword(email);
  };

  const resetPassword = async (token, password) => {
    return authService.resetPassword(token, password);
  };

  // Phone verification
  const sendPhoneCode = async (userId, phone, phoneCountry) => {
    return authService.sendPhoneCode(userId, phone, phoneCountry);
  };

  const verifyPhone = async (userId, code) => {
    return authService.verifyPhone(userId, code);
  };

  // Phone verification for logged-in users
  const resendPhoneCode = async () => {
    return authService.resendPhoneCode();
  };

  const verifyPhoneAuthenticated = async (code) => {
    const result = await authService.verifyPhoneAuthenticated(code);
    if (result.phoneVerified) {
      setUser(prev => prev ? { ...prev, phoneVerified: true } : null);
    }
    return result;
  };

  const updatePhone = async (phone, phoneCountry) => {
    const result = await authService.updatePhone(phone, phoneCountry);
    if (result.phone) {
      setUser(prev => prev ? { ...prev, phone: result.phone, phoneVerified: false } : null);
    }
    return result;
  };

  // Refresh user data
  const refreshUser = async () => {
    try {
      const me = await authService.getMe();
      setUser(me);
      return me;
    } catch (e) {
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      register,
      registerStep1,
      registerStep2,
      registerFull,
      login, 
      logout, 
      isAuthenticated: !!user, 
      isGuest, 
      continueAsGuest,
      verifyEmail,
      resendVerificationEmail,
      forgotPassword,
      resetPassword,
      sendPhoneCode,
      verifyPhone,
      resendPhoneCode,
      verifyPhoneAuthenticated,
      updatePhone,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
