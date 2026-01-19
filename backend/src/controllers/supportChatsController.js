const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// GET /api/support-chats - list support conversations grouped by status
exports.listSupportConversations = async (req, res) => {
  try {
    // Only support/admin allowed (middleware should enforce)
    let convs = await Conversation.find({ isSupportConversation: true }).sort({ lastMessageAt: -1 });
    // Defensive: ensure we only work with conversations explicitly marked as support
    convs = (convs || []).filter(c => !!c.isSupportConversation);

    const results = { needSupport: [], supportProvided: [] };

    await Promise.all(convs.map(async (c) => {
      const lastMsg = await Message.findOne({ conversation: c._id }).sort({ createdAt: -1 }).populate('sender', 'displayName name email avatar role');
      const user = c.supportForUser ? await User.findById(c.supportForUser).select('displayName name email avatar') : null;
      const entry = {
        isSupportConversation: !!c.isSupportConversation,
        _id: c._id,
        supportForUser: c.supportForUser,
        userDisplayName: user ? (user.displayName || user.name) : null,
        userName: user ? user.name : null,
        userEmail: user ? user.email : null,
        user: user ? { _id: user._id, displayName: user.displayName, name: user.name, avatar: user.avatar } : null,
        lastMessageAt: c.lastMessageAt,
        lastMessage: lastMsg ? { text: lastMsg.text, sender: lastMsg.sender, createdAt: lastMsg.createdAt } : null,
        viewers: c.viewers || [],
        status: c.status || null,
      };
      if (c.status === 'need support') results.needSupport.push(entry);
      else results.supportProvided.push(entry);
    }));

      console.log('listSupportConversations: needSupport=', results.needSupport.length, 'supportProvided=', results.supportProvided.length);
      // Log sample avatars for debugging
      try {
        const sample = (results.needSupport[0] || results.supportProvided[0]);
        if (sample && sample.lastMessage && sample.lastMessage.sender) {
          console.log('sample last message sender avatar:', sample.lastMessage.sender.avatar);
        }
      } catch (e) {}
      return res.json(results);
  } catch (e) {
    console.error('listSupportConversations', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/support-chats/me - get or create a support conversation for the authenticated user
exports.getMySupportConversation = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    let conv = await Conversation.findOne({ isSupportConversation: true, supportForUser: userId });
    if (!conv) {
      console.info('[supportChatsController] no existing support conversation found for user', String(userId), 'creating new one');
      try {
        conv = await Conversation.create({ isSupportConversation: true, supportForUser: userId, participants: [userId], lastMessageAt: new Date(), status: 'need support' });
        console.info('[supportChatsController] created support conversation', { convId: conv && conv._id ? conv._id.toString() : null, supportForUser: String(userId) });
      } catch (e) {
        console.warn('[supportChatsController] create support conversation failed, attempting to re-query', e && e.message);
        // Race: another process may have created it concurrently. Re-query and return whichever exists.
        try { conv = await Conversation.findOne({ isSupportConversation: true, supportForUser: userId }); } catch (ee) { console.error('[supportChatsController] re-query failed', ee && ee.message); }
        if (conv) console.info('[supportChatsController] found conversation after concurrent create', { convId: conv._id.toString() });
      }
      try {
        // notify supporters that a new conversation was created
        const io = req.app && req.app.get && req.app.get('io');
        if (io) {
          const user = await User.findById(userId).select('displayName name avatar');
          const summary = {
            conversationId: conv._id,
            status: conv.status,
            lastMessageAt: conv.lastMessageAt,
            lastMessage: null,
            viewers: conv.viewers || [],
            userDisplayName: user ? (user.displayName || user.name) : null,
            userName: user ? user.name : null,
            user: user ? { _id: user._id, displayName: user.displayName, name: user.name, avatar: user.avatar } : null
          };
          io.to('supporters').emit('newNeedSupport', summary);
        }
      } catch (e) { console.warn('getMySupportConversation: failed to emit newNeedSupport', e && e.message); }
    }
    const messages = await Message.find({ conversation: conv._id }).sort({ createdAt: 1 }).populate('sender', 'displayName name email avatar role');
    console.log('getMySupportConversation:', conv._id, 'messages=', messages.length);
    try { messages.slice(0,3).forEach(m => console.log('msg sender avatar:', m.sender && m.sender.avatar)); } catch (e) {}
    return res.json({ conversation: conv, messages });
  } catch (e) {
    console.error('getMySupportConversation', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/support-chats/:id/messages - get messages for a support conversation
exports.getSupportConversationMessages = async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });

    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    // If this is a support conversation, allow access to support/admin users,
    // OR to the conversation owner (`supportForUser`), OR to any participant of the conversation.
    if (conv.isSupportConversation) {
      const role = req.user && req.user.role;
      const isSupport = role === 'support' || role === 'admin';
      const isOwner = conv.supportForUser && conv.supportForUser.toString() === userId.toString();
      const isParticipant = Array.isArray(conv.participants) && conv.participants.some(p => p && p.toString() === userId.toString());
      if (!isSupport && !isOwner && !isParticipant) return res.status(403).json({ message: 'Forbidden: insufficient role' });
    } else {
      // Non-support conversations: allow if user is a participant
      const isParticipant = Array.isArray(conv.participants) && conv.participants.some(p => p && p.toString() === userId.toString());
      if (!isParticipant) return res.status(403).json({ message: 'Forbidden: not a participant' });
    }

    const messages = await Message.find({ conversation: conv._id }).sort({ createdAt: 1 }).populate('sender', 'displayName name email avatar role');
    console.log('getSupportConversationMessages:', conv._id, 'messages=', messages.length);
    try { messages.slice(0,3).forEach(m => console.log('msg sender avatar:', m.sender && m.sender.avatar)); } catch (e) {}
    return res.json({ conversation: conv, messages });
  } catch (e) {
    console.error('getSupportConversationMessages', e);
    return res.status(500).json({ message: 'Server error' });
  }
};
