const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const multer = require('multer');

// Use memory storage and upload to Cloudinary from buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });
const { protect, requireRole } = require('../middleware/auth');

router.route('/')
  .get(getProducts)
  .post(protect, requireRole(['vendor', 'admin']), upload.single('image'), createProduct);
router
  .route('/:id')
  .get(getProduct)
  .put(protect, requireRole(['vendor', 'admin']), upload.single('image'), updateProduct)
  .delete(protect, requireRole(['vendor', 'admin']), deleteProduct);

module.exports = router;