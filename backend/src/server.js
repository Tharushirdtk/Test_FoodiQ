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
    origin: "http://localhost:3000", // Frontend URL
    methods: ["GET", "POST"]
  }
});

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
// Scaffolded routes (placeholders) — implement controllers to enable
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/users/addresses', require('./routes/addresses'));
app.use('/api/users/favorites', require('./routes/favorites'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/products/:id/reviews', require('./routes/reviews'));
app.use('/api/support', require('./routes/support'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/contacts', require('./routes/contacts'));
// Notifications
app.use('/api/notifications', require('./routes/notifications'));

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
          if (socket.role === 'driver') {
            socket.isDriver = true;
            socket.join('drivers');
            console.log(`Socket ${socket.id} authenticated as driver:${userId}`);
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

  // Join/leave order room for targeted order updates
  socket.on('joinOrder', (orderId) => {
    if (orderId) {
      socket.join(`order:${orderId}`);
      console.log(`Socket ${socket.id} joined order:${orderId}`);
    }
  });

  socket.on('leaveOrder', (orderId) => {
    if (orderId) {
      socket.leave(`order:${orderId}`);
      console.log(`Socket ${socket.id} left order:${orderId}`);
    }
  });

  // Join/leave products room for product updates
  socket.on('joinProducts', () => {
    socket.join('products');
  });

  socket.on('leaveProducts', () => {
    socket.leave('products');
  });

  // Driver/client can emit driverLocation to update order room (rate-limited)
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

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Make io accessible in routes/controllers
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };