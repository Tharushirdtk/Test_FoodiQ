const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { sendVerificationCode } = require('../utils/smsProvider');

// @desc    Get all contacts
// @route   GET /api/contacts
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const contacts = user.contacts || [];
    const allContacts = [];
    
    // Normalize the primary phone number for comparison
    const normalizedPrimaryPhone = user.phone ? user.phone.replace(/\s+/g, '') : null;

    // Include primary phone as first contact (only if it's not already in the contacts array)
    if (user.phone) {
      const primaryExistsInArray = contacts.some(c => 
        c.number.replace(/\s+/g, '') === normalizedPrimaryPhone
      );
      
      // Only add synthetic primary if it doesn't exist in the array
      if (!primaryExistsInArray) {
        allContacts.push({
          _id: 'primary',
          label: 'Primary',
          number: user.phone,
          country: user.phoneCountry,
          isPrimary: true,
          verified: user.phoneVerified,
        });
      }
    }

    contacts.forEach(contact => {
      allContacts.push(contact);
    });

    res.json(allContacts);
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Add new contact
// @route   POST /api/contacts
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { label, number, country } = req.body;

    if (!number) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check limit (5 contacts max including primary)
    const totalContacts = (user.contacts?.length || 0) + (user.phone ? 1 : 0);
    if (totalContacts >= 5) {
      return res.status(400).json({ message: 'Maximum 5 contacts allowed' });
    }

    // Check if number already exists (in primary or contacts)
    const normalizedNumber = number.replace(/\s+/g, '');
    if (user.phone && user.phone.replace(/\s+/g, '') === normalizedNumber) {
      return res.status(400).json({ message: 'This phone number already exists as your primary number' });
    }
    
    const existingContact = user.contacts?.find(c => 
      c.number.replace(/\s+/g, '') === normalizedNumber
    );
    if (existingContact) {
      return res.status(400).json({ message: 'This phone number already exists in your contacts' });
    }

    // Auto-set as primary if no contacts exist and no primary phone
    const shouldBePrimary = (!user.contacts || user.contacts.length === 0) && !user.phone;

    const newContact = {
      label: label || 'Mobile',
      number,
      country: country || null,
      isPrimary: shouldBePrimary,
      verified: false,
    };

    // Use $push to atomically add to array (more reliable)
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $push: { contacts: newContact } },
      { new: true }
    );

    res.status(201).json({
      message: 'Contact added successfully',
      contact: updatedUser.contacts[updatedUser.contacts.length - 1],
    });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Update contact
// @route   PUT /api/contacts/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { label, number, country } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Cannot update primary contact this way
    if (req.params.id === 'primary') {
      return res.status(400).json({ message: 'Use phone update endpoint for primary contact' });
    }

    const contact = user.contacts.id(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    if (label) contact.label = label;
    if (number) contact.number = number;
    if (country !== undefined) contact.country = country;

    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'Contact updated successfully',
      contact,
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Delete contact
// @route   DELETE /api/contacts/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Handle deleting the primary phone (id === 'primary')
    if (req.params.id === 'primary') {
      // Clear primary phone fields
      user.phone = null;
      user.phoneCountry = null;
      user.phoneVerified = false;
      await user.save({ validateBeforeSave: false });
      return res.json({ message: 'Primary contact deleted successfully' });
    }

    const contact = user.contacts.find(c => c._id.toString() === req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // If deleting a primary contact from the array, clear the user's primary phone too
    if (contact.isPrimary) {
      user.phone = null;
      user.phoneCountry = null;
      user.phoneVerified = false;
      await user.save({ validateBeforeSave: false });
    }

    // Use $pull to atomically remove from array (more reliable)
    await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { contacts: { _id: req.params.id } } }
    );

    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Set contact as primary
// @route   PUT /api/contacts/:id/primary
// @access  Private
router.put('/:id/primary', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Cannot set non-existent contact as primary
    const contact = user.contacts.id(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    // Only verified contacts can be set as primary
    if (!contact.verified) {
      return res.status(400).json({ message: 'Only verified contacts can be set as primary' });
    }

    // Reset all contacts isPrimary to false
    user.contacts.forEach(c => {
      c.isPrimary = false;
    });

    // Set this contact as primary
    contact.isPrimary = true;

    // Update primary phone fields to match (keep in sync)
    user.phone = contact.number;
    user.phoneCountry = contact.country;
    user.phoneVerified = true; // Contact is already verified

    await user.save({ validateBeforeSave: false });

    res.json({ 
      message: 'Primary contact updated successfully',
      contact,
    });
  } catch (error) {
    console.error('Set primary contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Send verification code to a contact
// @route   POST /api/contacts/:id/send-code
// @access  Private
router.post('/:id/send-code', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let phoneToVerify;
    let contactId = req.params.id;

    if (contactId === 'primary') {
      // Verify primary phone
      if (!user.phone) {
        return res.status(400).json({ message: 'No primary phone number set' });
      }
      phoneToVerify = user.phone;
    } else {
      // Verify contact from array
      const contact = user.contacts.id(contactId);
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }
      if (contact.verified) {
        return res.status(400).json({ message: 'Contact is already verified' });
      }
      phoneToVerify = contact.number;
    }

    // Generate and store verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneVerificationCode = code;
    user.phoneVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.pendingVerificationContactId = contactId; // Store which contact is being verified
    await user.save({ validateBeforeSave: false });

    // Log the code for testing
    console.log('='.repeat(50));
    console.log(`📱 Verification Code for ${phoneToVerify}: ${code}`);
    console.log('='.repeat(50));

    // Send SMS
    try {
      await sendVerificationCode(phoneToVerify, code);
      console.log(`Verification code sent to ${phoneToVerify}`);
    } catch (smsError) {
      console.error('SMS send error:', smsError);
      return res.status(500).json({ message: 'Failed to send SMS. Please try again.' });
    }

    res.json({ 
      message: 'Verification code sent',
      phone: phoneToVerify,
    });
  } catch (error) {
    console.error('Send contact code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Verify a contact with code
// @route   POST /api/contacts/:id/verify
// @access  Private
router.post('/:id/verify', protect, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'Verification code is required' });
    }

    const user = await User.findById(req.user.id).select('+phoneVerificationCode +phoneVerificationExpiresAt +pendingVerificationContactId +contacts');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check code
    if (!user.phoneVerificationCode || user.phoneVerificationCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (user.phoneVerificationExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    const contactId = req.params.id;

    // Verify we're verifying the same contact the code was sent for
    if (user.pendingVerificationContactId && user.pendingVerificationContactId !== contactId) {
      return res.status(400).json({ message: 'Code was sent for a different contact' });
    }

    if (contactId === 'primary') {
      // Mark primary phone as verified
      user.phoneVerified = true;
    } else {
      // Mark contact as verified
      const contact = user.contacts.id(contactId);
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }
      contact.verified = true;

      // If this is the only verified contact and no primary is set, make it primary
      const verifiedContacts = user.contacts.filter(c => c.verified);
      if (verifiedContacts.length === 1 && !user.phoneVerified) {
        contact.isPrimary = true;
        user.phone = contact.number;
        user.phoneCountry = contact.country;
        user.phoneVerified = true;
      }
    }

    // Clear verification data
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpiresAt = undefined;
    user.pendingVerificationContactId = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ message: 'Contact verified successfully' });
  } catch (error) {
    console.error('Verify contact error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
