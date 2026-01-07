// Simple validation functions
const validateEmail = (email) => {
  const re = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return re.test(email);
};

const validatePassword = (password) => {
  return password.length >= 6;
};

const validateProduct = (product) => {
  const errors = [];
  if (!product.name || product.name.trim().length === 0) {
    errors.push('Name is required');
  }
  if (!product.description || product.description.trim().length === 0) {
    errors.push('Description is required');
  }
  if (!product.price || product.price < 0) {
    errors.push('Valid price is required');
  }
  if (!product.category || !['appetizer', 'main', 'dessert', 'beverage'].includes(product.category)) {
    errors.push('Valid category is required');
  }
  return errors;
};

module.exports = {
  validateEmail,
  validatePassword,
  validateProduct,
};