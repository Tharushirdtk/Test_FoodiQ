import api from '../utils/apiClient';

const supportChatService = {
  // List support conversations (for supporters)
  list: async () => {
    const res = await api.get('/support-chats');
    return res.data;
  },

  // Get or create current user's support conversation
  getMyConversation: async () => {
    const res = await api.get('/support-chats/me');
    return res.data;
  },

  // Fetch messages for a conversation
  getMessages: async (conversationId) => {
    const res = await api.get(`/support-chats/${conversationId}/messages`);
    return res.data;
  }
};

export default supportChatService;
