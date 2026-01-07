const express = require('express');
const router = express.Router();
const { createPaymentIntent, handleWebhook } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

router.post('/create-intent', protect, createPaymentIntent);
router.post('/webhook', handleWebhook); // webhooks usually don't use auth

// Payment methods management
router.get('/methods', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('paymentMethods');
    res.json(user.paymentMethods || []);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/methods', protect, async (req, res) => {
  try {
    const { type, last4, brand, expiryMonth, expiryYear, isDefault } = req.body;
    
    // Check if user has any existing payment methods
    const existingUser = await User.findById(req.user.id).select('paymentMethods');
    const hasExistingMethods = existingUser.paymentMethods && existingUser.paymentMethods.length > 0;
    
    // Auto-set as primary if no existing payment methods
    const shouldBeDefault = isDefault || !hasExistingMethods;
    
    // If setting as default, unset other defaults first
    if (shouldBeDefault && hasExistingMethods) {
      await User.updateOne(
        { _id: req.user.id },
        { $set: { 'paymentMethods.$[].isDefault': false } }
      );
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        $push: { 
          paymentMethods: { type, last4, brand, expiryMonth, expiryYear, isDefault: shouldBeDefault } 
        } 
      },
      { new: true }
    ).select('paymentMethods');
    
    res.json(user.paymentMethods);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/methods/:id', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { paymentMethods: { _id: req.params.id } }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/methods/:id/default', protect, async (req, res) => {
  try {
    // Unset all defaults first
    await User.updateOne(
      { _id: req.user.id },
      { $set: { 'paymentMethods.$[].isDefault': false } }
    );
    
    // Set the selected one as default
    await User.updateOne(
      { _id: req.user.id, 'paymentMethods._id': req.params.id },
      { $set: { 'paymentMethods.$.isDefault': true } }
    );
    
    const user = await User.findById(req.user.id).select('paymentMethods');
    res.json(user.paymentMethods);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
