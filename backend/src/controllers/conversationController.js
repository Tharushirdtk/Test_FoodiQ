const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Message = require('../models/Message');
const Order = require('../models/Order');
const Notification = require('../models/Notification');

exports.createOrGetConversation = async (req, res) => {
  // body: { orderId, participantId }
  try {
    // Log incoming request for debugging: body and requester
    try {
      console.info('[conversationController] incoming request body', JSON.stringify(req.body));
    } catch (e) { console.info('[conversationController] incoming request body (non-serializable)', req.body); }
    let { orderId, participantId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId required' });
    // Fetch order snapshot for debugging and validation
    let orderSnapshot = null;
    try {
      orderSnapshot = await Order.findById(orderId).lean();
      if (orderSnapshot) {
        const orderParticipants = {
          user: orderSnapshot.user && (orderSnapshot.user._id || orderSnapshot.user) || null,
          driver: orderSnapshot.driver && (orderSnapshot.driver._id || orderSnapshot.driver) || null,
          vendorAddresses: Array.isArray(orderSnapshot.vendorAddresses) ? orderSnapshot.vendorAddresses.map(v => (v && (v.vendor && (v.vendor._id || v.vendor)) || v.vendorId || null)) : [],
          itemVendors: Array.isArray(orderSnapshot.items) ? orderSnapshot.items.map(it => (it && it.vendor && (it.vendor._id || it.vendor.id || it.vendor) || null)).filter(Boolean) : []
        };
        console.info('[conversationController] order snapshot participants', JSON.stringify(orderParticipants));
        // If participantId is provided but is not part of the known order participants, log a warning
        try {
          const pid = String(participantId);
          const allKnown = [String(orderParticipants.user || ''), String(orderParticipants.driver || ''), ...(orderParticipants.vendorAddresses || []), ...(orderParticipants.itemVendors || [])].map(x => String(x));
          if (participantId && !allKnown.includes(pid)) {
            console.warn('[conversationController] participantId does not match known order participants', { participantId: pid, knownParticipants: allKnown });
          }
        } catch (e) {}
      }
    } catch (e) { console.warn('[conversationController] could not load order snapshot for debugging', e && e.message); }
    console.info('[conversationController] createOrGetConversation called', { userId: req.user && req.user._id ? req.user._id.toString() : null, role: req.user && req.user.role, orderId, participantId });

    // Normalize participantId: if frontend passed a Driver document id (order.driver),
    // resolve it to the underlying User id (Driver.user) so conversations are canonical.
    try {
      const maybeDriverId = participantId;
      if (maybeDriverId) {
        const Driver = require('../models/Driver');
        const drv = await Driver.findById(maybeDriverId).select('user');
        if (drv && drv.user) {
          const resolved = drv.user && (drv.user._id || drv.user) || drv.user;
          if (resolved && String(resolved) !== String(participantId)) {
            console.info('[conversationController] normalized participantId from Driver._id to Driver.user id', { original: participantId, resolved: String(resolved) });
            participantId = String(resolved);
          } else if (resolved) {
            console.info('[conversationController] normalized participantId (Driver->user)', { original: participantId, resolved: String(resolved) });
            participantId = String(resolved);
          }
        }
      }
    } catch (e) {
      console.warn('[conversationController] participantId normalization failed', e && e.message);
    }

    // If participantId provided, try to find a conversation for this order and both participants
    if (participantId) {
      // include current user as participant as well
      const userId = req.user && req.user._id;
      if (!userId) return res.status(401).json({ message: 'Not authorized' });
      // find conversation that matches order and contains both participants
      let conv = await Conversation.findOne({ order: orderId, participants: { $all: [participantId, userId] } });
      // If an existing conversation is a support conversation, do not return it to non-support users.
      if (conv && conv.isSupportConversation) {
        const requesterRole = req.user && req.user.role;
        const requesterIsSupport = requesterRole === 'support' || requesterRole === 'admin';
        if (!requesterIsSupport && !(req.body && req.body.isSupportConversation)) {
          // create a separate non-support conversation for order chat
          const createObj = { order: orderId, participants: [participantId, userId], isSupportConversation: false };
          console.info('[conversationController] creating separate non-support conversation for requester', createObj);
          conv = await Conversation.create(createObj);
          console.info('[conversationController] created separate non-support conversation result', { convId: conv && conv._id ? conv._id.toString() : null });
          return res.json(conv);
        }
        // If the conversation exists and is a support conversation and the requester is not yet a participant,
        // do not auto-add non-support users to support threads. Return as-is.
        console.info('[conversationController] returning existing support conversation', { convId: conv._id.toString(), participants: conv.participants });
        return res.json(conv);
      }

      // If conversation exists but does not include the requester, add them so they can see subsequent messages.
      if (conv && conv.participants && userId) {
        const found = conv.participants.find(p => String(p) === String(userId));
        if (!found) {
          try {
            conv.participants.push(userId);
            await conv.save();
          } catch (e) { /* ignore save errors */ }
        }
      }

        if (!conv) {
        // If no exact pairwise conversation found, first try to find a non-support conversation that already
        // includes the desired participant (participantId). This ensures a driver opening a chat with the customer
        // will join the same conversation the customer is already using.
        try {
          if (participantId) {
            // Only reuse conversations that won't exceed two participants.
            // Find a non-support conversation that contains the requested participant.
            const q = { order: orderId, participants: participantId, isSupportConversation: false };
            console.info('[conversationController] lookup convWithParticipant query', JSON.stringify(q));
            const convWithParticipant = await Conversation.findOne(q);
            if (convWithParticipant) {
              const participants = (convWithParticipant.participants || []).map(p => String(p));
              // If conversation already contains requester, reuse it
              if (participants.includes(String(userId))) {
                conv = convWithParticipant;
                console.info('[conversationController] reusing conversation that already includes requester', { convId: conv._id.toString() });
              } else if (participants.length === 1) {
                // safe to add requester to a one-sided conversation (only participantId present)
                convWithParticipant.participants.push(userId);
                console.info('[conversationController] adding requester to one-sided conversation, save will be called', { convId: convWithParticipant._id.toString(), addedUser: String(userId) });
                await convWithParticipant.save();
                conv = convWithParticipant;
                console.info('[conversationController] added requester to one-sided conversation result', { convId: conv._id.toString(), participants: conv.participants });
              } else {
                // conversation contains other third party (e.g., vendor+customer). Do NOT reuse it for a different pair.
                console.info('[conversationController] skipping reuse of conversation because it would create multi-party chat', { convId: convWithParticipant._id.toString(), participants: convWithParticipant.participants });
              }
            }
          }
        } catch (e) {
          console.warn('[conversationController] error looking up conversation with participant', e && e.message);
        }

        if (!conv) {
          // Determine if this should be marked as a support conversation
          let isSupport = false;
          let supportForUser = null;
          try {
            const requester = req.user;
            const participantUser = await User.findById(participantId).select('role');
            if (req.body && req.body.isSupportConversation) isSupport = true;
            if (requester && requester.role === 'support') isSupport = true;
            if (participantUser && participantUser.role === 'support') isSupport = true;
            // If support involved, set supportForUser to the non-support participant when possible
            if (isSupport) {
              if (requester && requester.role === 'support') supportForUser = participantId;
              else if (participantUser && participantUser.role === 'support') supportForUser = userId;
              else if (req.body && req.body.supportForUser) supportForUser = req.body.supportForUser;
            }
          } catch (e) { /* ignore role resolution errors */ }

          if (!isSupport) {
            // For non-support pairwise conversations, use a canonical participantsKey and upsert atomically
            try {
              const pKey = [String(userId), String(participantId)].sort().join(':');
              const filter = { order: orderId, participantsKey: pKey, isSupportConversation: false };
              const update = { $setOnInsert: { order: orderId, participants: [participantId, userId], participantsKey: pKey, isSupportConversation: false } };
              console.info('[conversationController] performing upsert', { filter: JSON.stringify(filter), update: JSON.stringify(update) });
              conv = await Conversation.findOneAndUpdate(
                filter,
                update,
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
              console.info('[conversationController] upsert result', { convId: conv && conv._id ? conv._id.toString() : null, participants: conv && conv.participants ? conv.participants : null });
            } catch (e) {
              console.warn('[conversationController] upsert failed, falling back to create', e && e.message);
              const createObj = { order: orderId, participants: [participantId, userId], participantsKey: [String(userId), String(participantId)].sort().join(':') };
              console.info('[conversationController] fallback create with', createObj);
              conv = await Conversation.create(createObj);
              console.info('[conversationController] fallback create result', { convId: conv && conv._id ? conv._id.toString() : null });
            }
          } else {
            // Support conversation: create as before and mark support-specific fields
            const createObj = { order: orderId, participants: [participantId, userId] };
            createObj.isSupportConversation = true;
            if (supportForUser) createObj.supportForUser = supportForUser;
            console.info('[conversationController] creating support conversation with', createObj);
            conv = await Conversation.create(createObj);
            console.info('[conversationController] created support conversation', { convId: conv && conv._id ? conv._id.toString() : null, participants: conv && conv.participants ? conv.participants : null, isSupportConversation: conv && conv.isSupportConversation });
          }
        }
      }
      return res.json(conv);
    }

    // Fallback: require participantId for non-support callers to avoid creating ambiguous group chats.
    const role = req.user && req.user.role;
    const requesterIsSupport = role === 'support' || role === 'admin';
    if (!requesterIsSupport) {
      return res.status(400).json({ message: 'participantId required for non-support conversations' });
    }
    // Support/admin may create or get a generic order-level conversation
    let conv = await Conversation.findOne({ order: orderId, participants: { $size: 0 } });
    if (!conv) {
      conv = await Conversation.create({ order: orderId, participants: [], isSupportConversation: false });
      console.info('[conversationController] created generic order conversation (support)', { convId: conv._id.toString() });
    }
    console.info('[conversationController] returning conversation', { convId: conv._id.toString(), participants: conv.participants });
    return res.json(conv);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
      // If this is a support conversation, only support/admin may fetch it via this route
      if (conv.isSupportConversation) {
        const role = req.user && req.user.role;
        if (!(role === 'support' || role === 'admin')) return res.status(403).json({ message: 'Forbidden' });
      }
      const messages = await Message.find({ conversation: conv._id }).sort({ createdAt: 1 }).populate('sender', 'displayName name avatar role');
      return res.json({ conversation: conv, messages });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/conversations?orderId=...  - returns conversations for the order that include the requester
exports.listConversationsForOrder = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ message: 'orderId required' });
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    const role = req.user && req.user.role;
    const requesterIsSupport = role === 'support' || role === 'admin';

    // For non-support users, only return conversations that include them (and are non-support)
    const q = { order: orderId };
    if (!requesterIsSupport) {
      q.participants = userId;
      q.isSupportConversation = false;
    }

    let convs = await Conversation.find(q).sort({ lastMessageAt: -1, createdAt: -1 }).populate('participants', 'displayName name role avatar').lean();

    // Deduplicate conversations server-side to avoid returning multiple
    // conversations that represent the same other participant (e.g., one
    // created using Driver._id and another using Driver.user._id).
    try {
      const seen = new Set();
      const unique = [];
      for (const c of convs) {
        // prefer participantsKey when present
        let key = c.participantsKey || null;
        if (!key) {
          try {
            const parts = Array.isArray(c.participants) ? c.participants.map(p => (p && (p._id || p)) || p) : [];
            key = parts.map(p => String(p)).sort().join(':');
          } catch (e) { key = JSON.stringify(c.participants || []); }
        }

        // build a role+displayName signature for the 'other' participant
        let otherSig = null;
        try {
          const parts = Array.isArray(c.participants) ? c.participants : [];
          const other = parts.find(p => String((p && (p._id || p)) || p) !== String(userId));
          if (other) {
            const r = other.role || 'unknown';
            const n = (other.displayName || other.name || '').toString();
            otherSig = `${r}|${n}`;
          }
        } catch (e) { otherSig = null; }

        const chosen = otherSig || key;
        if (!seen.has(chosen)) {
          seen.add(chosen);
          unique.push(c);
        }
      }
      convs = unique;
    } catch (e) {
      console.warn('[conversationController] dedupe failed', e && e.message);
    }

    return res.json({ conversations: convs });
  } catch (e) {
    console.error('listConversationsForOrder', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.postMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { senderId, text, attachments } = req.body;
    if (!conversationId || !senderId) return res.status(400).json({ message: 'Missing conversationId or senderId' });
    const msg = await Message.create({ conversation: conversationId, sender: senderId, text, attachments: attachments || [] });
    // populate sender for clients
    try { await msg.populate('sender', 'displayName name avatar role'); } catch (e) {}

    // Update conversation lastMessageAt and possibly status
    const conv = await Conversation.findById(conversationId);
    if (conv) {
      conv.lastMessageAt = msg.createdAt || new Date();
      // Determine support status changes similar to socket handler
      try {
        const senderUser = await User.findById(senderId).select('role');
        if (conv.isSupportConversation) {
          if (senderUser && (senderUser.role === 'support' || senderUser.role === 'admin')) conv.status = 'support provided';
          else conv.status = 'need support';
        }
      } catch (e) {}
      await conv.save();
    }

    // Emit socket events so connected clients receive the message
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message', { conversationId, message: msg });
        if (conv && conv.isSupportConversation) {
          io.to(`conversation:${conversationId}`).emit('statusUpdated', { conversationId, status: conv.status });
          io.to('supporters').emit('statusUpdated', { conversationId, status: conv.status });
          // emit concise conversationUpdated to supporters
          try {
            const summary = {
              conversationId: conv._id,
              status: conv.status,
              lastMessageAt: conv.lastMessageAt,
              lastMessage: { text: msg.text, createdAt: msg.createdAt, sender: msg.sender },
              viewers: conv.viewers || []
            };
            io.to('supporters').emit('conversationUpdated', summary);
            const needCount = await Conversation.countDocuments({ isSupportConversation: true, status: 'need support' });
            io.to('supporters').emit('supportCounts', { needSupport: needCount, total: await Conversation.countDocuments({ isSupportConversation: true }) });
          } catch (e) { /* ignore emit errors */ }
        }
      }
    } catch (e) { console.warn('postMessage: socket emit failed', e && e.message); }

    // Create notification records and emit a websocket notification to other participants (except sender)
    try {
      // helper: resolve possible non-user participant ids (e.g., Driver._id) to underlying User id
      const resolveToUserId = async (rawId) => {
        if (!rawId) return null;
        try {
          // if it's already a User, return it
          const u = await User.findById(rawId).select('_id');
          if (u) return String(u._id);
        } catch (e) { /* ignore */ }
        try {
          const Driver = require('../models/Driver');
          const d = await Driver.findById(rawId).select('user');
          if (d && d.user) return String(d.user);
        } catch (e) { /* ignore */ }
        return String(rawId);
      };

      const allParticipantIds = (conv && Array.isArray(conv.participants)) ? conv.participants.map(p => String(p)) : [];
      const resolved = await Promise.all(allParticipantIds.map(id => resolveToUserId(id)));
      const resolvedSender = await resolveToUserId(senderId);
      const recipientUserIds = Array.from(new Set(resolved.filter(id => id && String(id) !== String(resolvedSender))));

      if (recipientUserIds.length && req.app && req.app.get) {
        const io = req.app.get('io');
        const noteBody = (msg && msg.text) ? (String(msg.text).slice(0, 200)) : 'New message';
        const createPromises = recipientUserIds.map(async (rid) => {
          try {
            const note = await Notification.create({ user: rid, title: 'New message', body: noteBody, data: { conversationId: String(conversationId), order: conv && conv.order ? String(conv.order) : undefined, type: conv && conv.isSupportConversation ? 'support' : 'order', status: conv && conv.status ? conv.status : undefined } });
            try {
              if (io) io.to(`user:${rid}`).emit('notification', note);
            } catch (emitErr) { console.warn('postMessage: emit notification failed', emitErr && emitErr.message); }
            return note;
          } catch (e) {
            console.warn('postMessage: create notification failed for', rid, e && e.message);
            return null;
          }
        });
        await Promise.all(createPromises);
      }
    } catch (e) {
      console.warn('postMessage: notifications handling failed', e && e.message);
    }

    return res.json(msg);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};
