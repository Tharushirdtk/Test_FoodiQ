const Address = require('../models/Address');

// GET /api/addresses
exports.getAddresses = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const addresses = await Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
    return res.status(200).json(addresses);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/addresses
exports.createAddress = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { label, street, city, state, postalCode, country, isDefault } = req.body;
    if (!street || !city) {
      return res.status(400).json({ message: 'Street and city are required' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await Address.updateMany({ user: userId }, { isDefault: false });
    }

    // If this is the first address, make it default
    const existingCount = await Address.countDocuments({ user: userId });
    const shouldBeDefault = isDefault || existingCount === 0;

    const address = await Address.create({
      user: userId,
      label: label || 'Home',
      street,
      city,
      state: state || '',
      postalCode: postalCode || '',
      country: country || 'Sri Lanka',
      isDefault: shouldBeDefault,
    });

    return res.status(201).json(address);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/addresses/:id
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const address = await Address.findById(req.params.id);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    if (address.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { label, street, city, state, postalCode, country, isDefault } = req.body;
    
    // If setting as default, unset others first
    if (isDefault && !address.isDefault) {
      await Address.updateMany({ user: userId, _id: { $ne: address._id } }, { isDefault: false });
    }

    if (label !== undefined) address.label = label;
    if (street !== undefined) address.street = street;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (postalCode !== undefined) address.postalCode = postalCode;
    if (country !== undefined) address.country = country;
    if (isDefault !== undefined) address.isDefault = isDefault;

    await address.save();
    return res.status(200).json(address);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/addresses/:id
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const address = await Address.findById(req.params.id);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    if (address.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const wasDefault = address.isDefault;
    await Address.findByIdAndDelete(req.params.id);

    // If deleted address was default, make another one default
    if (wasDefault) {
      const remaining = await Address.findOne({ user: userId }).sort({ createdAt: -1 });
      if (remaining) {
        remaining.isDefault = true;
        await remaining.save();
      }
    }

    return res.status(200).json({ message: 'Address removed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/addresses/:id/primary
exports.setPrimary = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const address = await Address.findById(req.params.id);
    if (!address) return res.status(404).json({ message: 'Address not found' });
    if (address.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Unset all other defaults
    await Address.updateMany({ user: userId, _id: { $ne: address._id } }, { isDefault: false });

    // Set this as primary
    address.isDefault = true;
    await address.save();

    return res.status(200).json({ message: 'Primary address updated', address });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
