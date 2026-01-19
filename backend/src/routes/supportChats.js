const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const controller = require('../controllers/supportChatsController');

// List all support conversations (support/admin)
router.get('/', protect, requireRole(['support','admin']), controller.listSupportConversations);

// Get or create my support conversation (authenticated user)
router.get('/me', protect, controller.getMySupportConversation);

// Get messages for a support conversation
// Allow support/admin, the conversation owner (supportForUser), or participants to fetch messages
router.get('/:id/messages', protect, controller.getSupportConversationMessages);

module.exports = router;
