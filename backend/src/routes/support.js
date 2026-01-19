const express = require('express');
const router = express.Router();
const { createTicket } = require('../controllers/supportController');
const { protect, optionalAuth, requireRole } = require('../middleware/auth');
const { sendSupportEmail } = require('../utils/mailer');

// Only support and admin can create internal tickets
router.post('/tickets', protect, requireRole(['support', 'admin']), createTicket);

// Public ticket submission (with optional auth)
router.post('/ticket', optionalAuth, async (req, res) => {
  try {
    const { subject, message, email } = req.body;
    
    // Log the ticket
    console.log('Support ticket received:', { subject, message, email, userId: req.user?.id });
    
    // Send email notification to support team
    try {
      const { queueEmail } = require('../utils/notificationQueue');
      queueEmail(async () => { await sendSupportEmail({
        to: 'tharu.dev.foodiq@gmail.com',
        subject: `[Support] ${subject}`,
        customerEmail: email || req.user?.email || 'Not provided',
        customerName: req.user?.displayName || req.user?.name || 'Guest User',
        message: message,
      }); });
      console.log('Support email queued');
    } catch (emailError) {
      console.error('Failed to queue support email:', emailError);
      // Don't fail the request if email fails, still acknowledge receipt
    }
    
    res.json({ 
      success: true, 
      message: 'Your message has been received. We will get back to you soon.' 
    });
  } catch (error) {
    console.error('Support ticket error:', error);
    res.status(500).json({ message: 'Failed to submit ticket' });
  }
});

module.exports = router;
