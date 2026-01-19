const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const cors = require('cors');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"], // Frontend URLs (dev)
    methods: ["GET", "POST"]
  }
});

// make io available to controllers via utils/socket
try {
  const socketUtil = require('./utils/socket');
  socketUtil.init(io);
} catch (e) {
  console.warn('Failed to init socket util', e && e.message);
}

// Helper: keep socket-persisted `options` compact (only `selectedAttributes`).
const sanitizeOptions = (opts) => {
  const o = Object.assign({}, opts || {});
  const sa = Array.isArray(o.selectedAttributes) ? o.selectedAttributes : undefined;
  const clean = {};
  if (sa) clean.selectedAttributes = sa;
  return clean;
};

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/vendors', require('./routes/vendors'));
// Register specific user subroutes before the generic /api/users router
app.use('/api/users/addresses', require('./routes/addresses'));
app.use('/api/users/favorites', require('./routes/favorites'));
app.use('/api/users', require('./routes/users'));
// Scaffolded routes (placeholders) — implement controllers to enable
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/products/:id/reviews', require('./routes/reviews'));
app.use('/api/support', require('./routes/support'));
app.use('/api/support-chats', require('./routes/supportChats'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/contacts', require('./routes/contacts'));
// Notifications
app.use('/api/notifications', require('./routes/notifications'));
// Drivers & conversations
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/admin', require('./routes/admin'));

// Socket.io for real-time updates
io.on('connection', async (socket) => {
  console.log('A socket connected:', socket.id);

  // Try to authenticate socket using token passed in handshake auth or query
  const token = socket.handshake.auth && socket.handshake.auth.token
    ? socket.handshake.auth.token
    : (socket.handshake.query && socket.handshake.query.token);

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      socket.userId = userId;
      // Fetch user record to determine role (if available)
      try {
        const user = await User.findById(userId).select('-password');
        if (user) {
          socket.role = user.role || 'customer';
          // Join role-specific rooms
          if (socket.role === 'driver') {
            socket.isDriver = true;
            socket.join('drivers');
            socket.join(`driver:${userId}`);
            console.log(`Socket ${socket.id} authenticated as driver:${userId}`);
          }
          if (socket.role === 'support' || socket.role === 'admin') {
            socket.isSupport = true;
            socket.join('supporters');
            socket.join(`support:${userId}`);
            console.log(`Socket ${socket.id} authenticated as support:${userId}`);
          }
        }
      } catch (e) {
        console.warn('Failed to load user for socket auth', e.message);
      }

      // Join per-user room so we can target messages to this user
      socket.join(`user:${userId}`);
      console.log(`Socket ${socket.id} authenticated as user:${userId}`);
    } catch (err) {
      console.warn('Socket auth failed:', err.message);
      // Do not disconnect automatically; keep unauthenticated sockets for public rooms
    }
  }

  // initialize a set to track order rooms this socket has joined
  socket.joinedOrders = new Set();

  // Join/leave order room for targeted order updates
  // (Validated) join/leave for orders handled later with payload validation.

  // Join/leave products room for product updates
  socket.on('joinProducts', () => {
    socket.join('products');
  });

  socket.on('leaveProducts', () => {
    socket.leave('products');
  });

  // Cart socket actions: get/add/update/remove/clear - provide ack callbacks
  try {
    const CartItem = require('./models/CartItem');
    const Product = require('./models/Product');

    socket.on('getCart', async (payload, cb) => {
      try {
        if (!socket.userId) return cb && cb({ message: 'Not authorized' });
        const items = await CartItem.find({ user: socket.userId }).populate('product').sort({ createdAt: -1 });
        return cb && cb(null, items);
      } catch (e) {
        console.error('getCart socket error', e);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('addToCart', async (payload, cb) => {
      try {
        if (!socket.userId) return cb && cb({ message: 'Not authorized' });
        const { productId, quantity = 1, options = {}, selectedAttributes = [] } = payload || {};
        if (!productId) return cb && cb({ message: 'productId is required' });
        const product = await Product.findById(productId);
        if (!product) return cb && cb({ message: 'Product not found' });
        // Normalize selectedAttributes into options for matching, then sanitize options
        const normalizedSelected = Array.isArray(selectedAttributes) ? selectedAttributes : (options.selectedAttributes || []);
        const sanitizedOptions = sanitizeOptions(Object.assign({}, options, { selectedAttributes: normalizedSelected }));
        console.log('[socket.addToCart] payload:', { productId, quantity, options, selectedAttributes: normalizedSelected, socketId: socket.id, userId: socket.userId });

        // compute snapshots similar to cartController
        const computeAttributeSnapshots = (productDoc, selectedArr) => {
          const prod = productDoc || {};
          const groups = prod.attributeGroups || [];
          const attrMap = new Map();
          for (const g of groups) {
            const key = g.key || '';
            for (const a of (g.attributes || [])) {
              if (a && a._id) attrMap.set(String(a._id), { groupKey: key, def: a });
            }
          }
          let sizeFlatSum = 0;
          let sizePercentDelta = 0;
          for (const s of selectedArr) {
            const sid = String(s.id || s._id || s.id);
            const entry = attrMap.get(sid);
            if (!entry || entry.groupKey !== 'size' || !entry.def) continue;
            const def = entry.def;
            const qty = Number(s.quantity || 1) || 1;
            const dpt = String(def.priceType || 'flat').toLowerCase();
            if (dpt === 'flat') {
              sizeFlatSum += (Number(def.amount || 0) * qty);
            } else if (dpt === 'minus-flat') {
              sizeFlatSum -= (Number(def.amount || 0) * qty);
            } else if (dpt === 'percent') {
              sizePercentDelta += (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
            } else if (dpt === 'minus-percent') {
              sizePercentDelta -= (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
            }
          }
          const productBasePrice = Number(prod.price || 0) + sizeFlatSum + sizePercentDelta;

          const snapshots = [];
          let attributesTotal = 0;
          for (const s of selectedArr) {
            const sid = String(s.id || s._id || s.id);
            const entry = attrMap.get(sid);
            let name = s.name || '';
            let priceType = s.priceType || 'flat';
            let amount = Number(s.amount || 0);
            const qty = Number(s.quantity || 1) || 1;
            if (entry && entry.def) {
              name = name || entry.def.name || name;
              priceType = entry.def.priceType || priceType;
              amount = (typeof entry.def.amount !== 'undefined') ? Number(entry.def.amount) : amount;
            }
              // Size attributes are represented by adjusting base price; do not double-count them in attributesTotal
              // Pricing rules (per request):
              // - flat -> + amount * quantity
              // - percent -> + (base * (amount/100)) * quantity
              // - minus-percent -> - amount * quantity
              // - minus-flat -> - (base * (amount/100)) * quantity
              let computed = 0;
              const isSize = entry && entry.groupKey === 'size';
              if (isSize) {
                computed = 0;
              } else if (priceType === 'percent') {
                computed = Math.round((productBasePrice * (amount / 100)) * 100) / 100;
                computed = computed * qty;
              } else if (priceType === 'minus-percent') {
                // minus-percent -> negative flat amount per quantity
                computed = - (Math.round(amount * 100) / 100) * qty;
              } else if (priceType === 'minus-flat') {
                // minus-flat -> negative percent of base per quantity
                computed = - (Math.round((productBasePrice * (amount / 100)) * 100) / 100) * qty;
              } else {
                // flat
                computed = Math.round(amount * 100) / 100;
                computed = computed * qty;
              }
              computed = Math.round(computed * 100) / 100;
            snapshots.push({ id: sid, name, priceType, amount, quantity: qty, computedAmount: computed });
            attributesTotal += computed;
          }
          attributesTotal = Math.round(attributesTotal * 100) / 100;
          return { snapshots, attributesTotal };
        };

        const { snapshots, attributesTotal } = computeAttributeSnapshots(product, normalizedSelected || []);
        console.log('[socket.addToCart] computed snapshots:', snapshots);
        console.log('[socket.addToCart] attributesTotal:', attributesTotal);

        const existing = await CartItem.findOne({ user: socket.userId, product: productId, options: sanitizedOptions || {} });
        let result;
        if (existing) {
          existing.quantity = (existing.quantity || 0) + Number(quantity);
          existing.selectedAttributes = snapshots;
          existing.attributesTotal = attributesTotal;
          existing.options = sanitizedOptions;
          await existing.save();
          result = await existing.populate('product');
        } else {
          const item = await CartItem.create({ user: socket.userId, product: productId, quantity, options: sanitizedOptions, selectedAttributes: snapshots, attributesTotal });
          result = await item.populate('product');
        }

        try { 
          io.to(`user:${socket.userId}`).emit('cartUpdate', { action: 'upsert', item: result }); 
          console.log('[socket.addToCart] emitted cartUpdate upsert for user:', socket.userId, 'itemId:', result._id);
        } catch (e) { console.warn('[socket.addToCart] emit failed', e && e.message); }

        return cb && cb(null, result);
      } catch (error) {
        console.error('addToCart socket error', error);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('updateCartItem', async (payload, cb) => {
      try {
        if (!socket.userId) return cb && cb({ message: 'Not authorized' });
        const { itemId, quantity, options, selectedAttributes = null } = payload || {};
        if (!itemId) return cb && cb({ message: 'itemId is required' });
        const item = await CartItem.findById(itemId);
        if (!item) return cb && cb({ message: 'Cart item not found' });
        if (item.user.toString() !== socket.userId.toString()) return cb && cb({ message: 'Forbidden' });
        if (quantity !== undefined) item.quantity = Number(quantity);
        if (options !== undefined) item.options = sanitizeOptions(options);

        if (selectedAttributes !== null) {
          const product = await Product.findById(item.product);
          const normalized = Array.isArray(selectedAttributes) ? selectedAttributes : (options && options.selectedAttributes) || [];
          console.log('[socket.updateCartItem] incoming selectedAttributes/options:', { normalized, options, itemId: item._id, socketId: socket.id });
          const computeAttributeSnapshots = (productDoc, selectedArr) => {
            const prod = productDoc || {};
            const groups = prod.attributeGroups || [];
            const attrMap = new Map();
            for (const g of groups) {
              const key = g.key || '';
              for (const a of (g.attributes || [])) {
                if (a && a._id) attrMap.set(String(a._id), { groupKey: key, def: a });
              }
            }
            let sizeFlatSum = 0;
            let sizePercentDelta = 0;
            for (const s of selectedArr) {
              const sid = String(s.id || s._id || s.id);
              const entry = attrMap.get(sid);
              if (!entry || entry.groupKey !== 'size' || !entry.def) continue;
              const def = entry.def;
              const qty = Number(s.quantity || 1) || 1;
              const dpt = String(def.priceType || 'flat').toLowerCase();
              if (dpt === 'flat') {
                sizeFlatSum += (Number(def.amount || 0) * qty);
              } else if (dpt === 'minus-flat') {
                sizeFlatSum -= (Number(def.amount || 0) * qty);
              } else if (dpt === 'percent') {
                sizePercentDelta += (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
              } else if (dpt === 'minus-percent') {
                sizePercentDelta -= (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
              }
            }
            const productBasePrice = Number(prod.price || 0) + sizeFlatSum + sizePercentDelta;

            const snapshots = [];
            let attributesTotal = 0;
            for (const s of selectedArr) {
              const sid = String(s.id || s._id || s.id);
              const entry = attrMap.get(sid);
              let name = s.name || '';
              let priceType = s.priceType || 'flat';
              let amount = Number(s.amount || 0);
              const qty = Number(s.quantity || 1) || 1;
              if (entry && entry.def) {
                name = name || entry.def.name || name;
                priceType = entry.def.priceType || priceType;
                amount = (typeof entry.def.amount !== 'undefined') ? Number(entry.def.amount) : amount;
              }
              // Size attributes are represented by adjusting base price; do not double-count them in attributesTotal
              // Pricing rules (per request):
              // - flat -> + amount * quantity
              // - percent -> + (base * (amount/100)) * quantity
              // - minus-percent -> - amount * quantity
              // - minus-flat -> - (base * (amount/100)) * quantity
              let computed = 0;
              const isSize = entry && entry.groupKey === 'size';
              if (isSize) {
                computed = 0;
              } else if (priceType === 'percent') {
                computed = Math.round((productBasePrice * (amount / 100)) * 100) / 100;
                computed = computed * qty;
              } else if (priceType === 'minus-percent') {
                // minus-percent -> negative flat amount per quantity
                computed = - (Math.round(amount * 100) / 100) * qty;
              } else if (priceType === 'minus-flat') {
                // minus-flat -> negative percent of base per quantity
                computed = - (Math.round((productBasePrice * (amount / 100)) * 100) / 100) * qty;
              } else {
                // flat
                computed = Math.round(amount * 100) / 100;
                computed = computed * qty;
              }
              computed = Math.round(computed * 100) / 100;
              snapshots.push({ id: sid, name, priceType, amount, quantity: qty, computedAmount: computed });
              attributesTotal += computed;
            }
            attributesTotal = Math.round(attributesTotal * 100) / 100;
            return { snapshots, attributesTotal };
          };

          const { snapshots, attributesTotal } = computeAttributeSnapshots(product, normalized || []);
          console.log('[socket.updateCartItem] computed snapshots:', snapshots);
          console.log('[socket.updateCartItem] attributesTotal:', attributesTotal);
          item.selectedAttributes = snapshots;
          item.attributesTotal = attributesTotal;
          // ensure options remains sanitized (use provided options if present, otherwise preserve existing)
          item.options = sanitizeOptions(options !== undefined ? options : item.options);
        }

        if (item.quantity <= 0) {
          await item.deleteOne();
          try { io.to(`user:${socket.userId}`).emit('cartUpdate', { action: 'remove', itemId }); } catch (e) {}
          return cb && cb(null, { message: 'Item removed' });
        }

        await item.save();
        const populated = await item.populate('product');
        try { io.to(`user:${socket.userId}`).emit('cartUpdate', { action: 'upsert', item: populated }); } catch (e) {}
        return cb && cb(null, populated);
      } catch (error) {
        console.error('updateCartItem socket error', error);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('removeCartItem', async (payload, cb) => {
      try {
        if (!socket.userId) return cb && cb({ message: 'Not authorized' });
        const { itemId } = payload || {};
        if (!itemId) return cb && cb({ message: 'itemId is required' });
        const item = await CartItem.findById(itemId);
        if (!item) return cb && cb({ message: 'Cart item not found' });
        if (item.user.toString() !== socket.userId.toString()) return cb && cb({ message: 'Forbidden' });
        await item.deleteOne();
        try { io.to(`user:${socket.userId}`).emit('cartUpdate', { action: 'remove', itemId }); } catch (e) {}
        return cb && cb(null, { message: 'Item removed' });
      } catch (error) {
        console.error('removeCartItem socket error', error);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('clearCart', async (payload, cb) => {
      try {
        if (!socket.userId) return cb && cb({ message: 'Not authorized' });
        await CartItem.deleteMany({ user: socket.userId });
        try { io.to(`user:${socket.userId}`).emit('cartUpdate', { action: 'clear' }); } catch (e) {}
        return cb && cb(null, { message: 'Cleared' });
      } catch (error) {
        console.error('clearCart socket error', error);
        return cb && cb({ message: 'Server error' });
      }
    });
  } catch (e) {
    console.warn('Cart socket handlers not initialized', e && e.message);
  }

  // Driver/client can emit driverLocation to update order room (rate-limited)
  // Conversation / chat handlers
  try {
    const Conversation = require('./models/Conversation');
    const Message = require('./models/Message');
    const { emitToConversation } = require('./utils/socketUtils');

    socket.on('joinConversation', async (payload, cb) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId) return cb && cb({ message: 'conversationId required' });
        const conv = await Conversation.findById(conversationId);
        if (!conv) return cb && cb({ message: 'Conversation not found' });
        if (!socket.userId && !socket.isDriver) return cb && cb({ message: 'Not authorized' });
        socket.join(`conversation:${conversationId}`);
        console.log(`joinConversation: socket joined conversation room`, { socketId: socket.id, userId: socket.userId, conversationId: String(conversationId), participants: conv.participants });
        // If support user joins a support conversation, record presence
        if (conv.isSupportConversation && socket.isSupport && socket.userId) {
          const already = (conv.viewers || []).some(v => v.toString() === socket.userId.toString());
          if (!already) {
            conv.viewers = conv.viewers || [];
            conv.viewers.push(socket.userId);
            await conv.save();
          }
          // Emit updated viewers to conversation room and to supporters so dashboards can update
          const viewersPayload = { conversationId, viewers: conv.viewers };
          console.log('joinConversation: viewers updated', viewersPayload);
          io.to(`conversation:${conversationId}`).emit('viewers', viewersPayload);
          io.to('supporters').emit('viewers', viewersPayload);
          try {
            // also emit a conversation summary so supporters can update list items live
            const lastMsg = await Message.findOne({ conversation: conv._id }).sort({ createdAt: -1 }).populate('sender', 'displayName name email avatar role');
            // include support user info so the dashboard can show displayName/avatar
            let supportUserInfo = null;
            try { if (conv.supportForUser) supportUserInfo = await User.findById(conv.supportForUser).select('displayName name avatar'); } catch (e) {}
            const summary = {
              conversationId: conv._id,
              status: conv.status,
              lastMessageAt: conv.lastMessageAt,
              lastMessage: lastMsg ? { text: lastMsg.text, createdAt: lastMsg.createdAt, sender: lastMsg.sender } : null,
              viewers: conv.viewers || [],
              userDisplayName: supportUserInfo ? (supportUserInfo.displayName || supportUserInfo.name) : null,
              userName: supportUserInfo ? supportUserInfo.name : null,
              user: supportUserInfo ? { _id: supportUserInfo._id, displayName: supportUserInfo.displayName, name: supportUserInfo.name, avatar: supportUserInfo.avatar } : null
            };
            io.to('supporters').emit('conversationUpdated', summary);
          } catch (e) { console.warn('joinConversation: failed to emit conversationUpdated', e && e.message); }
        }
        return cb && cb(null, { joined: true });
      } catch (e) {
        console.error('joinConversation error', e);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('leaveConversation', async (payload, cb) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId) return cb && cb({ message: 'conversationId required' });
        socket.leave(`conversation:${conversationId}`);
        // If support user, remove from viewers
        if (socket.isSupport && socket.userId) {
          try {
            const conv = await Conversation.findById(conversationId);
            if (conv && conv.viewers && conv.viewers.length) {
              conv.viewers = conv.viewers.filter(v => v.toString() !== socket.userId.toString());
              await conv.save();
              const viewersPayload = { conversationId, viewers: conv.viewers };
              io.to(`conversation:${conversationId}`).emit('viewers', viewersPayload);
              io.to('supporters').emit('viewers', viewersPayload);
              try {
                const lastMsg = await Message.findOne({ conversation: conv._id }).sort({ createdAt: -1 }).populate('sender', 'displayName name email avatar role');
                // include support user info so dashboard shows name/avatar
                let supportUserInfo = null;
                try { if (conv.supportForUser) supportUserInfo = await User.findById(conv.supportForUser).select('displayName name avatar'); } catch (e) {}
                const summary = {
                  conversationId: conv._id,
                  status: conv.status,
                  lastMessageAt: conv.lastMessageAt,
                  lastMessage: lastMsg ? { text: lastMsg.text, createdAt: lastMsg.createdAt, sender: lastMsg.sender } : null,
                  viewers: conv.viewers || [],
                  userDisplayName: supportUserInfo ? (supportUserInfo.displayName || supportUserInfo.name) : null,
                  userName: supportUserInfo ? supportUserInfo.name : null,
                  user: supportUserInfo ? { _id: supportUserInfo._id, displayName: supportUserInfo.displayName, name: supportUserInfo.name, avatar: supportUserInfo.avatar } : null
                };
                io.to('supporters').emit('conversationUpdated', summary);
              } catch (e) { console.warn('leaveConversation: failed to emit conversationUpdated', e && e.message); }
            }
          } catch (e) { console.warn('leaveConversation viewer cleanup failed', e && e.message); }
        }
        return cb && cb(null, { left: true });
      } catch (e) {
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('sendMessage', async (payload, cb) => {
      try {
        const { conversationId, text, attachments } = payload || {};
        if (!conversationId || !socket.userId) {
          console.warn('sendMessage rejected: missing conversationId or not authenticated', { conversationId, socketId: socket.id, userId: socket.userId });
          return cb && cb({ message: 'Missing conversationId or not authenticated' });
        }
        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          console.warn('sendMessage rejected: conversation not found', { conversationId });
          return cb && cb({ message: 'Conversation not found' });
        }
        let msg = await Message.create({ conversation: conversationId, sender: socket.userId, text, attachments: attachments || [] });
        // populate sender for emitting to clients
        try { msg = await msg.populate('sender', 'displayName name email avatar role'); } catch (e) {}
        // Update conversation lastMessageAt
        conv.lastMessageAt = msg.createdAt || new Date();

        // If this is a support conversation, update status based on sender
        if (conv.isSupportConversation) {
          if (socket.isSupport) {
            conv.status = 'support provided';
          } else {
            conv.status = 'need support';
          }
          await conv.save();
          // Emit status update to conversation room and to supporters so dashboards update live
          console.log('sendMessage: conversation status updated', { conversationId, status: conv.status, sender: socket.userId });
          io.to(`conversation:${conversationId}`).emit('statusUpdated', { conversationId, status: conv.status });
          io.to('supporters').emit('statusUpdated', { conversationId, status: conv.status });

          // If message created by a non-support user and moved to 'need support', notify supporters
          if (conv.status === 'need support' && !socket.isSupport) {
            // send emails to support users asynchronously
            try {
              const UserModel = require('./models/User');
              const supportUsers = await UserModel.find({ role: 'support' }).select('email name');
              const { sendSupportEmail } = require('./utils/mailer');
              // resolve conversation owner display name/email when possible
              let customerInfo = null;
              try { if (conv.supportForUser) customerInfo = await UserModel.findById(conv.supportForUser).select('displayName name email'); } catch (ee) {}
              const customerName = customerInfo ? (customerInfo.displayName || customerInfo.name) : (conv.supportForUser ? conv.supportForUser.toString() : 'User');
              const customerEmail = customerInfo && customerInfo.email ? customerInfo.email : '';
              const promises = supportUsers.map(su => sendSupportEmail({
                to: su.email,
                subject: `[Support] New message from ${customerName}`,
                customerEmail: customerEmail,
                customerName: customerName,
                message: `${text}`,
                conversationId: conv._id,
              }).catch(err => console.warn('support email send failed', err && err.message)));
              Promise.allSettled(promises).then(() => {});
            } catch (e) {
              console.warn('Failed to notify support users', e && e.message);
            }
            // emit a notification event to support sockets so UI can show a notification
            try {
              const lastMsg = msg; // already populated
              const supportSummary = {
                conversationId: conv._id,
                status: conv.status,
                lastMessageAt: conv.lastMessageAt,
                lastMessage: { text: lastMsg.text, createdAt: lastMsg.createdAt, sender: lastMsg.sender },
                viewers: conv.viewers || []
              };
              io.to('supporters').emit('newNeedSupport', supportSummary);
            } catch (e) { console.warn('sendMessage: failed to emit newNeedSupport', e && e.message); }

          }

          // If conversation moved to 'support provided' (support answered), mark related notifications read
          if (conv.status === 'support provided') {
            try {
              const Notification = require('./models/Notification');
              // mark notifications related to this conversation as read
              try {
                const convIdStr = conv._id && conv._id.toString ? conv._id.toString() : conv._id;
                await Notification.updateMany({ 'data.conversationId': { $in: [conv._id, convIdStr] }, read: false }, { $set: { read: true } });
                // emit notification update events to affected users so their UI can mark items read
                try {
                  const affected = await Notification.find({ 'data.conversationId': { $in: [conv._id, convIdStr] } }).select('_id user read');
                  console.log('sendMessage: marking notifications read for conversation', { conversationId: conv._id, affected: affected.length });
                  affected.forEach(n => {
                    try { io.to(`user:${n.user}`).emit('notificationRead', { notificationId: n._id, conversationId: conv._id }); } catch (e) {}
                  });
                } catch (e) { console.warn('sendMessage: failed to fetch affected notifications', e && e.message); }
              } catch (e) { console.warn('sendMessage: failed to update notifications read', e && e.message); }
            } catch (e) { console.warn('sendMessage: failed to mark notifications read', e && e.message); }
          }
        } else {
          await conv.save();
        }

        // include conversationId in payload so clients don't need to assume wrapper shape
        console.log('sendMessage: emitting message', { conversationId, messageId: msg._id, sender: msg.sender && msg.sender._id, avatar: msg.sender && msg.sender.avatar });
        emitToConversation(io, conversationId, 'message', { conversationId, message: msg });
        // Create notification records and emit a websocket notification to other participants (except sender)
        try {
          const resolveToUserId = async (rawId) => {
            if (!rawId) return null;
            try {
              const u = await User.findById(rawId).select('_id');
              if (u) return String(u._id);
            } catch (e) { /* ignore */ }
            try {
              const Driver = require('./models/Driver');
              const d = await Driver.findById(rawId).select('user');
              if (d && d.user) return String(d.user);
            } catch (e) { /* ignore */ }
            return String(rawId);
          };

          const allParticipantIds = (conv && Array.isArray(conv.participants)) ? conv.participants.map(p => String(p)) : [];
          const resolved = await Promise.all(allParticipantIds.map(id => resolveToUserId(id)));
          const resolvedSender = await resolveToUserId(socket.userId || msg.sender && msg.sender._id);
          const recipientUserIds = Array.from(new Set(resolved.filter(id => id && String(id) !== String(resolvedSender))));

          if (recipientUserIds.length) {
            const Notification = require('./models/Notification');
            const noteBody = (msg && msg.text) ? (String(msg.text).slice(0, 200)) : 'New message';
            const createPromises = recipientUserIds.map(async (rid) => {
              try {
                const note = await Notification.create({ user: rid, title: 'New message', body: noteBody, data: { conversationId: String(conversationId), order: conv && conv.order ? String(conv.order) : undefined, type: conv && conv.isSupportConversation ? 'support' : 'order', status: conv && conv.status ? conv.status : undefined } });
                try { if (io) io.to(`user:${rid}`).emit('notification', note); } catch (emitErr) { console.warn('sendMessage: emit notification failed', emitErr && emitErr.message); }
                return note;
              } catch (e) {
                console.warn('sendMessage: create notification failed for', rid, e && e.message);
                return null;
              }
            });
            await Promise.all(createPromises);
          }
        } catch (e) {
          console.warn('sendMessage: notifications handling failed', e && e.message);
        }
        try {
          // Only notify supporters about conversations that are support-related or
          // have escalated to 'need support'. Avoid emitting non-support order
          // conversations to the supporters room to prevent temporary dashboard
          // noise (clients will fetch canonical lists on reload).
          if (conv.isSupportConversation || conv.status === 'need support') {
            let supportUserInfo = null;
            try { if (conv.supportForUser) supportUserInfo = await User.findById(conv.supportForUser).select('displayName name avatar'); } catch (e) {}
            const summary = {
              conversationId: conv._id,
              status: conv.status,
              lastMessageAt: conv.lastMessageAt,
              lastMessage: { text: msg.text, createdAt: msg.createdAt, sender: msg.sender },
              viewers: conv.viewers || [],
              userDisplayName: supportUserInfo ? (supportUserInfo.displayName || supportUserInfo.name) : null,
              userName: supportUserInfo ? supportUserInfo.name : null,
              user: supportUserInfo ? { _id: supportUserInfo._id, displayName: supportUserInfo.displayName, name: supportUserInfo.name, avatar: supportUserInfo.avatar } : null
            };
            io.to('supporters').emit('conversationUpdated', summary);
          } else {
            console.debug('sendMessage: skipping conversationUpdated emit to supporters for non-support conversation', { conversationId: conv._id });
          }
        } catch (e) { console.warn('sendMessage: failed to emit conversationUpdated', e && e.message); }

        // Broadcast updated counts of need-support to supporters room
        try {
          const needCount = await Conversation.countDocuments({ isSupportConversation: true, status: 'need support' });
          console.log('supportCounts:', needCount);
          io.to('supporters').emit('supportCounts', { needSupportCount: needCount });
        } catch (e) { }

        return cb && cb(null, msg);
      } catch (e) {
        console.error('sendMessage error', e);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('typing', (payload) => {
      try {
        const { conversationId, typing } = payload || {};
        if (!conversationId) return;
        io.to(`conversation:${conversationId}`).emit('typing', { userId: socket.userId, typing: !!typing });
      } catch (e) {}
    });
  } catch (e) {
    console.warn('Chat socket handlers not initialized', e && e.message);
  }

  // Order viewers: drivers can join an order room to indicate they are viewing it
  try {
    const Order = require('./models/Order');

    socket.on('joinOrder', async (payload, cb) => {
      try {
        const { orderId } = payload || {};
        if (!orderId) return cb && cb({ message: 'orderId required' });
        const orderExists = await Order.exists({ _id: orderId });
        if (!orderExists) return cb && cb({ message: 'Order not found' });
        socket.join(`order:${String(orderId)}`);
        console.log(`Socket ${socket.id} joined order:${String(orderId)}`);
        // track viewers only for drivers using atomic update to avoid version conflicts
        if (socket.isDriver && socket.userId) {
          const updated = await Order.findOneAndUpdate(
            { _id: orderId },
            { $addToSet: { viewers: socket.userId } },
            { new: true }
          ).select('viewers');
          // track that this socket has joined this order so we can cleanup on disconnect
          try { socket.joinedOrders = socket.joinedOrders || new Set(); socket.joinedOrders.add(String(orderId)); } catch (e) {}
          const viewersPayload = { orderId, viewers: (updated && updated.viewers) || [] };
          io.to(`order:${orderId}`).emit('order:viewers', viewersPayload);
          io.to('drivers').emit('order:viewers', viewersPayload);
        }
        return cb && cb(null, { joined: true });
      } catch (e) {
        console.error('joinOrder error', e);
        return cb && cb({ message: 'Server error' });
      }
    });

    socket.on('leaveOrder', async (payload, cb) => {
      try {
        const { orderId } = payload || {};
        if (!orderId) return cb && cb({ message: 'orderId required' });
        socket.leave(`order:${String(orderId)}`);
        console.log(`Socket ${socket.id} left order:${String(orderId)}`);
        if (socket.isDriver && socket.userId) {
          try {
            const updated = await Order.findOneAndUpdate(
              { _id: orderId },
              { $pull: { viewers: socket.userId } },
              { new: true }
            ).select('viewers');
            try { if (socket.joinedOrders) { socket.joinedOrders.delete(String(orderId)); } } catch (e) {}
            const viewersPayload = { orderId, viewers: (updated && updated.viewers) || [] };
            io.to(`order:${orderId}`).emit('order:viewers', viewersPayload);
            io.to('drivers').emit('order:viewers', viewersPayload);
          } catch (e) { console.warn('leaveOrder viewer cleanup failed', e && e.message); }
        }
        return cb && cb(null, { left: true });
      } catch (e) {
        return cb && cb({ message: 'Server error' });
      }
    });
  } catch (e) {
    console.warn('Order viewer socket handlers not initialized', e && e.message);
  }
  socket.on('driverLocation', (payload) => {
    // payload: { orderId, lat, lng }
    if (!socket.isDriver) {
      // Only allow drivers to emit location updates
      return;
    }
    if (!payload || !payload.orderId) return;
    const { orderId, lat, lng } = payload;
    // rate limit per-socket (ms)
    const now = Date.now();
    if (socket._lastLocationAt && (now - socket._lastLocationAt) < 300) {
      return;
    }
    socket._lastLocationAt = now;
    io.to(`order:${orderId}`).emit('orderLocation', { orderId, lat, lng });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, 'reason=', reason);
    // Clean up any order viewers this socket may have left behind (useful when browser/tab closed)
    try {
      if (socket.isDriver && socket.userId && socket.joinedOrders && socket.joinedOrders.size) {
        const Order = require('./models/Order');
        const toCleanup = Array.from(socket.joinedOrders);
        // Fire-and-forget cleanup of viewers
        Promise.allSettled(toCleanup.map(async (orderId) => {
          try {
            const updated = await Order.findOneAndUpdate(
              { _id: orderId },
              { $pull: { viewers: socket.userId } },
              { new: true }
            ).select('viewers');
            const viewersPayload = { orderId, viewers: (updated && updated.viewers) || [] };
            try { io.to(`order:${orderId}`).emit('order:viewers', viewersPayload); } catch (e) {}
            try { io.to('drivers').emit('order:viewers', viewersPayload); } catch (e) {}
          } catch (e) {
            console.warn('disconnect: failed to cleanup viewer for order', orderId, e && e.message);
          }
        })).then(() => {}).catch(() => {});
      }
    } catch (e) { console.warn('disconnect cleanup failed', e && e.message); }
  });

  // Additional socket-level debugging handlers
  socket.on('error', (err) => {
    try { console.warn('Socket error on', socket.id, err && err.message ? err.message : err); } catch (e) {}
  });

  socket.on('disconnecting', (reason) => {
    try { console.log('Socket disconnecting:', socket.id, 'rooms=', Array.from(socket.rooms || []), 'reason=', reason); } catch (e) {}
  });
});

// Make io accessible in routes/controllers
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };