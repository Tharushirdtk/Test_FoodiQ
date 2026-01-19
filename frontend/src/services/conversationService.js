import api from '../utils/apiClient';

const conversationService = {
  createOrGet: async (orderId, participantId) => {
    // Accept optional participantId (other user id) to create per-participant order conversations
    const body = participantId ? { orderId, participantId } : { orderId };
    console.debug('conversationService.createOrGet', { orderId, participantId, body });
    const res = await api.post('/conversations', body);
    console.debug('conversationService.createOrGet response', res && res.data ? { convId: res.data._id, participants: res.data.participants } : res);
    return res.data;
  },

  getConversation: async (id) => {
    console.debug('conversationService.getConversation', id);
    const res = await api.get(`/conversations/${id}`);
    console.debug('conversationService.getConversation response', res && res.data ? { convId: res.data.conversation && res.data.conversation._id, messages: (res.data.messages || []).length } : res);
    return res.data;
  },

  listForOrder: async (orderId) => {
    console.debug('conversationService.listForOrder', orderId);
    const res = await api.get(`/conversations?orderId=${orderId}`);
    return res.data && res.data.conversations ? res.data.conversations : [];
  },

  postMessage: async (conversationId, senderId, text, attachments = []) => {
    const res = await api.post(`/conversations/${conversationId}/messages`, { senderId, text, attachments });
    return res.data;
  }
};

export default conversationService;
