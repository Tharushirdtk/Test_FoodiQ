const express = require('express');
const router = express.Router();
const conv = require('../controllers/conversationController');
const { protect } = require('../middleware/auth');

router.post('/', protect, conv.createOrGetConversation);
router.get('/:id', protect, conv.getConversation);
router.post('/:conversationId/messages', protect, conv.postMessage);

// List conversations for an order that involve the current user (non-support callers)
router.get('/', protect, conv.listConversationsForOrder);

module.exports = router;
