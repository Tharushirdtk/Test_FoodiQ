import api from '../utils/apiClient';

const getRevenueSeries = async ({ entity, entityId, from, to, interval, range } = {}) => {
  const params = { entity, entityId };
  if (from) params.from = from;
  if (to) params.to = to;
  // prefer `interval` param; fall back to legacy `range` if provided
  if (interval) params.interval = interval;
  else if (range) params.range = range;
  const res = await api.get(`/analytics/revenue`, { params });
  return res.data;
};

const analyticsService = { getRevenueSeries };

export default analyticsService;