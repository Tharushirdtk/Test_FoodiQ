import api from '../utils/apiClient';

const profileService = {
  // Get user profile
  getProfile: async () => {
    const res = await api.get('/profile');
    return res.data;
  },

  // Update user profile
  updateProfile: async (data) => {
    const res = await api.put('/profile', data);
    return res.data;
  },

  // Upload avatar
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    
    const res = await api.post('/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  // Delete avatar
  deleteAvatar: async () => {
    const res = await api.delete('/profile/avatar');
    return res.data;
  },
};

export default profileService;
