import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/apiClient';

const ThemeContext = createContext();

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage first for immediate load
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [pushNotifications, setPushNotifications] = useState(() => {
    const saved = localStorage.getItem('pushNotifications');
    return saved !== 'false'; // Default to true
  });
  const [loading, setLoading] = useState(false);

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('pushNotifications', pushNotifications.toString());
  }, [pushNotifications]);

  // Load preferences from server when user is authenticated
  const loadPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await api.get('/preferences');
      if (response.data) {
        if (typeof response.data.darkMode === 'boolean') {
          setDarkMode(response.data.darkMode);
        }
        if (typeof response.data.pushNotifications === 'boolean') {
          setPushNotifications(response.data.pushNotifications);
        }
      }
    } catch (error) {
      console.log('Failed to load preferences:', error.message);
    }
  };

  // Save preferences to server
  const savePreferences = async (prefs) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      setLoading(true);
      await api.put('/preferences', prefs);
    } catch (error) {
      console.log('Failed to save preferences:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);
    await savePreferences({ darkMode: newValue });
  };

  const togglePushNotifications = async () => {
    const newValue = !pushNotifications;
    setPushNotifications(newValue);
    await savePreferences({ pushNotifications: newValue });
  };

  return (
    <ThemeContext.Provider value={{
      darkMode,
      pushNotifications,
      loading,
      toggleDarkMode,
      togglePushNotifications,
      loadPreferences,
      setDarkMode,
      setPushNotifications,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
