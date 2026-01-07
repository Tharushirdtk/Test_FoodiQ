import api from '../utils/apiClient';

const reviewService = {
  getReviews: async (productId) => {
    const res = await api.get(`/reviews?productId=${productId}`);
    return res.data;
  },
  addReview: async ({ productId, rating, text }) => {
    const res = await api.post('/reviews', { productId, rating, text });
    return res.data;
  }
};

export default reviewService;
