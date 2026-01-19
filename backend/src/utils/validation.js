// Simple validation functions
const validateEmail = (email) => {
  const re = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return re.test(email);
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  // Require at least 8 chars, one uppercase, one lowercase, one digit and one special character
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
};

const validateProduct = (product) => {
  const errors = [];
  const sanitized = Object.assign({}, product);
  if (!product.name || product.name.trim().length === 0) {
    errors.push('Name is required');
  }
  if (!product.description || product.description.trim().length === 0) {
    errors.push('Description is required');
  }
  if (product.price == null || Number(product.price) < 0) {
    errors.push('Valid price is required');
  }
  // Accept any non-empty category string (categories are dynamic and provided by the DB/frontend)
  if (!product.category || !String(product.category).trim()) {
    errors.push('Valid category is required');
  }

  // AttributeGroups validation & sanitization
  const ag = Array.isArray(product.attributeGroups) ? product.attributeGroups : [];
  const sanitizedGroups = [];

  // find size group if present
  let sizeGroup = ag.find(g => (g.key && g.key.toLowerCase() === 'size') || (g.title && g.title.toLowerCase() === 'size'));

  // ensure attributes arrays and validate contents
  for (const group of ag) {
    const g = Object.assign({}, group);
    g.type = g.type || 'multi-select';
    g.optional = !!g.optional;
    // requiredMin defaults: for non-optional single-select groups it's 1, otherwise 0
    g.requiredMin = typeof g.requiredMin === 'number' ? g.requiredMin : (g.type === 'single-select' && !g.optional ? 1 : 0);
    g.attributes = Array.isArray(g.attributes) ? g.attributes.map(a => {
      const attr = Object.assign({}, a);
      // Allow plus and minus variants
      const pt = String(attr.priceType || '').toLowerCase();
      if (pt === 'percent' || pt === 'minus-percent') attr.priceType = pt;
      else if (pt === 'minus-flat') attr.priceType = 'minus-flat';
      else attr.priceType = 'flat';
      attr.amount = Number(attr.amount) || 0;
      attr.quantityEnabled = !!attr.quantityEnabled;
      attr.defaultSelected = !!attr.defaultSelected;
      const isSize = (g.key && String(g.key).toLowerCase() === 'size') || (g.title && String(g.title).toLowerCase() === 'size');
      // Only disallow negative amounts for non-size groups (size may use minus types)
      if (attr.amount < 0 && !isSize) errors.push(`Attribute amount cannot be negative (${attr.name || 'unnamed'})`);
      // Vendors must not mark an attribute as default when it has a non-zero amount
      if (attr.defaultSelected && Number(attr.amount) > 0) errors.push(`Attribute "${attr.name || 'unnamed'}" cannot be default when amount is non-zero.`);
      if ((attr.priceType === 'percent' || attr.priceType === 'minus-percent') && (attr.amount < 0 || attr.amount > 100)) errors.push(`Percent attribute amount must be between 0 and 100 (${attr.name || 'unnamed'})`);
      return attr;
    }) : [];

    // single-select groups must have exactly one defaultSelected; if missing we'll fix later
    sanitizedGroups.push(g);
  }

  // Legacy: do NOT auto-insert a Size group here — that caused silent data mutations
  // and confusing client state (e.g., stray "Regular" selections). Require the
  // frontend/vendor to supply a Size group explicitly and report it as a validation error.
  if (!sizeGroup) {
    errors.push('A required "Size" attribute group is missing.');
  }

  // ensure single-select groups have exactly one defaultSelected when they are NOT optional;
  // If a single-select group is optional, clear any defaultSelected flags.
  // For non-optional single-select groups, require vendors to explicitly set exactly one default; do not auto-pick.
  for (const g of sanitizedGroups) {
    if (g.type === 'single-select') {
      if (g.optional) {
        for (const a of g.attributes) {
          if (a && typeof a === 'object') a.defaultSelected = false;
        }
        continue;
      }
      const defaults = g.attributes.filter(a => a && a.defaultSelected);
      if (defaults.length !== 1) {
        errors.push(`Single-select group "${g.title || g.key}" must have exactly one default selection.`);
      }
      // If vendor set multiple defaults, normalize by keeping the first to avoid downstream ambiguity
      if (defaults.length > 1) {
        let kept = false;
        for (const a of g.attributes) {
          if (a && a.defaultSelected) {
            if (!kept) kept = true;
            else a.defaultSelected = false;
          }
        }
      }
    }
  }

  sanitized.attributeGroups = sanitizedGroups;

  return { errors, sanitized };
};

module.exports = {
  validateEmail,
  validatePassword,
  validateProduct,
};