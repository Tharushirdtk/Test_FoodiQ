const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images only
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter
});

// memory storage for vehicle image uploads (Cloudinary)
const memoryStorage = multer.memoryStorage();
const uploadMemory = multer({ storage: memoryStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// @desc    Get user profile
// @route   GET /api/profile
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prepare driverProfile safely: if vehicleNumber looks like a bcrypt hash, do not expose it
    const safeDriverProfile = user.driverProfile
      ? (() => {
          const isHashed = (typeof user.driverProfile.vehicleNumber === 'string' && user.driverProfile.vehicleNumber.startsWith('$2'));
          return {
            vehicleType: user.driverProfile.vehicleType || null,
            vehicleNumber: isHashed ? null : (user.driverProfile.vehicleNumber || null),
            vehicleNumberIsHashed: isHashed,
            vehicleImage: user.driverProfile.vehicleImage || null,
            licenseNumber: user.driverProfile.licenseNumber || null,
            rating: typeof user.driverProfile.rating !== 'undefined' ? user.driverProfile.rating : 5,
            active: typeof user.driverProfile.active !== 'undefined' ? user.driverProfile.active : false,
            assignedOrders: Array.isArray(user.driverProfile.assignedOrders) ? user.driverProfile.assignedOrders : [],
          };
        })()
      : null;

    res.json({
      _id: user._id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      birthdate: user.birthdate,
      gender: user.gender,
      avatar: user.avatar,
      createdAt: user.createdAt,
      vendorProfile: user.vendorProfile || null,
      driverProfile: safeDriverProfile,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Update user profile
// @route   PUT /api/profile
// @access  Private
router.put('/', protect, async (req, res) => {
  try {
    const { name, displayName, birthdate, gender, vendorProfile, driverProfile } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update allowed fields
    if (name) user.name = name;
    if (displayName !== undefined) user.displayName = displayName || null;
    if (birthdate) user.birthdate = birthdate;
    if (gender !== undefined) user.gender = gender || null;

    // Accept vendorProfile updates when provided (for vendor users)
    if (vendorProfile && user.role === 'vendor') {
      if (!user.vendorProfile) user.vendorProfile = {};
      if (vendorProfile.storeName !== undefined) user.vendorProfile.storeName = vendorProfile.storeName || null;
      if (vendorProfile.storePhone !== undefined) user.vendorProfile.storePhone = vendorProfile.storePhone || null;
      if (vendorProfile.businessRegNumber !== undefined) user.vendorProfile.businessRegNumber = vendorProfile.businessRegNumber || null;
      if (vendorProfile.description !== undefined) user.vendorProfile.description = vendorProfile.description || null;
      if (vendorProfile.storeAddress) {
        user.vendorProfile.storeAddress = user.vendorProfile.storeAddress || {};
        const addr = vendorProfile.storeAddress;
        if (addr.street !== undefined) user.vendorProfile.storeAddress.street = addr.street || null;
        if (addr.city !== undefined) user.vendorProfile.storeAddress.city = addr.city || null;
        if (addr.state !== undefined) user.vendorProfile.storeAddress.state = addr.state || null;
        if (addr.zip !== undefined) user.vendorProfile.storeAddress.zip = addr.zip || null;
        if (addr.country !== undefined) user.vendorProfile.storeAddress.country = addr.country || null;
      }
    }

    // Accept driverProfile updates when provided (for driver users)
    if (driverProfile && user.role === 'driver') {
      if (!user.driverProfile) user.driverProfile = {};
      if (driverProfile.vehicleType !== undefined) user.driverProfile.vehicleType = driverProfile.vehicleType || null;
      if (driverProfile.vehicleNumber !== undefined) user.driverProfile.vehicleNumber = driverProfile.vehicleNumber || null;
      if (driverProfile.licenseNumber !== undefined) user.driverProfile.licenseNumber = driverProfile.licenseNumber || null;
    }

    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        emailVerified: user.emailVerified,
        birthdate: user.birthdate,
        gender: user.gender,
        avatar: user.avatar,
        vendorProfile: user.vendorProfile || null,
        driverProfile: user.driverProfile || null,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Upload avatar
// @route   POST /api/profile/avatar
// @access  Private
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete old avatar file if it exists and is a local file
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '../..', user.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Save new avatar URL
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    user.avatar = avatarUrl;
    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: avatarUrl,
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Upload driver vehicle image and update vehicle number
// @route   POST /api/profile/vehicle
// @access  Private (driver)
router.post('/vehicle', protect, uploadMemory.single('vehicleImage'), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

    const User = require('../models/User');
    const cloudinary = require('../utils/cloudinary');

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update vehicle number and license (store plaintext so frontend can display)
    const { vehicleNumber, licenseNumber } = req.body;
    if (!user.driverProfile) user.driverProfile = {};
    if (vehicleNumber) {
      // store as provided (no hashing) so the profile page can show it
      user.driverProfile.vehicleNumber = String(vehicleNumber);
    }
    if (licenseNumber) user.driverProfile.licenseNumber = licenseNumber;

    // If file buffer provided, upload to Cloudinary
    if (req.file && req.file.buffer) {
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, { folder: 'drivers', resource_type: 'image', overwrite: true });
      if (uploadResult && uploadResult.secure_url) {
        user.driverProfile.vehicleImage = uploadResult.secure_url;
      }
    }

    await user.save({ validateBeforeSave: false });
    return res.status(200).json({ message: 'Vehicle updated', driverProfile: user.driverProfile });
  } catch (error) {
    console.error('Upload vehicle error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Delete avatar
// @route   DELETE /api/profile/avatar
// @access  Private
router.delete('/avatar', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete avatar file if it exists and is a local file
    if (user.avatar && user.avatar.startsWith('/uploads/')) {
      const avatarPath = path.join(__dirname, '../..', user.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    // Clear avatar URL
    user.avatar = null;
    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'Avatar removed successfully',
      avatar: null,
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
