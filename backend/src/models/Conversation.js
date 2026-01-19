const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, refPath: 'participantModel' }],
  participantModel: { type: String, default: 'User' },
  // Canonical key for pairwise conversations (sorted user ids joined) to ensure uniqueness per order
  participantsKey: { type: String, index: false },
  // Support chat specific fields
  isSupportConversation: { type: Boolean, default: false },
  // If this conversation is a support thread, link to the user who owns the thread
  supportForUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // 'need support' | 'support provided'
  status: { type: String, enum: ['need support', 'support provided'], default: undefined },
  // support viewers (support user ids currently viewing)
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessageAt: { type: Date },
}, { timestamps: true });

// Debugging hooks: log when conversations are created or updated to help trace duplicates
try {
  conversationSchema.pre('save', function (next) {
    try {
      const info = {
        new: this.isNew,
        id: this._id && this._id.toString ? this._id.toString() : this._id,
        order: this.order && (this.order.toString ? this.order.toString() : this.order),
        participants: (this.participants || []).map(p => (p && p.toString ? p.toString() : p)),
        participantsKey: this.participantsKey
      };
      if (this.isNew) console.info('[Conversation][pre-save] creating', info);
      else console.info('[Conversation][pre-save] updating', info);
    } catch (e) { console.warn('[Conversation][pre-save] logging failed', e && e.message); }
    return next();
  });

  conversationSchema.post('save', function (doc) {
    try {
      const info = {
        id: doc._id && doc._id.toString ? doc._id.toString() : doc._id,
        order: doc.order && (doc.order.toString ? doc.order.toString() : doc.order),
        participants: (doc.participants || []).map(p => (p && p.toString ? p.toString() : p)),
        participantsKey: doc.participantsKey
      };
      console.info('[Conversation][post-save] saved', info, '\nstack:', (new Error()).stack.split('\n').slice(0,6).join('\n'));
    } catch (e) { console.warn('[Conversation][post-save] logging failed', e && e.message); }
  });
} catch (e) {
  console.warn('Conversation model: failed to attach debug hooks', e && e.message);
}

module.exports = mongoose.model('Conversation', conversationSchema);
