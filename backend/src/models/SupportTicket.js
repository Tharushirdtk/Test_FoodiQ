const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: String,
  message: String,
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  status: { type: String, enum: ['open','closed','pending'], default: 'open' },
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', ticketSchema);
