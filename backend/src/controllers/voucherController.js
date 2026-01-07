const Voucher = require('../models/Voucher');

// POST /api/vouchers/validate { code }
exports.validateVoucher = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'code is required' });

    const voucher = await Voucher.findOne({ code: new RegExp(`^${code}$`, 'i') });
    if (!voucher) return res.status(404).json({ valid: false, message: 'Voucher not found' });

    if (voucher.expiresAt && voucher.expiresAt < new Date()) {
      return res.status(400).json({ valid: false, message: 'Voucher expired' });
    }

    if (voucher.usageLimit !== undefined && voucher.usageLimit !== null && voucher.usageLimit <= 0) {
      return res.status(400).json({ valid: false, message: 'Voucher usage limit reached' });
    }

    return res.status(200).json({ valid: true, discountType: voucher.discountType, amount: voucher.amount });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
