// Helper utilities for emitting socket events to rooms

function emitToUser(io, userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

function emitToOrder(io, orderId, event, payload) {
  if (!io || !orderId) return;
  io.to(`order:${orderId}`).emit(event, payload);
}

function emitToProducts(io, event, payload) {
  if (!io) return;
  io.to('products').emit(event, payload);
}

function emitToConversation(io, conversationId, event, payload) {
  if (!io || !conversationId) return;
  io.to(`conversation:${conversationId}`).emit(event, payload);
}

function emitToDriver(io, driverId, event, payload) {
  if (!io || !driverId) return;
  io.to(`driver:${driverId}`).emit(event, payload);
}

module.exports = {
  emitToUser,
  emitToOrder,
  emitToProducts,
  emitToConversation,
  emitToDriver,
};
