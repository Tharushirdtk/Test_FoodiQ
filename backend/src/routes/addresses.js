const express = require('express');
const router = express.Router();
const { getAddresses, createAddress, updateAddress, deleteAddress, setPrimary } = require('../controllers/addressController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getAddresses);
router.post('/', protect, createAddress);
router.put('/:id', protect, updateAddress);
router.put('/:id/primary', protect, setPrimary);
router.delete('/:id', protect, deleteAddress);

module.exports = router;
