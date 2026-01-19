const connectDB = require('../src/config/database');
const mongoose = require('mongoose');
const CartItem = require('../src/models/CartItem');

async function sanitize() {
  await connectDB();
  console.log('Connected to DB');
  const cursor = CartItem.find().cursor();
  let count = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const o = doc.options || {};
    const top = Array.isArray(doc.selectedAttributes) ? doc.selectedAttributes : [];
    const saFromOptions = Array.isArray(o.selectedAttributes) ? o.selectedAttributes : null;
    const saFromTop = top.length > 0 ? top.map(s => ({ id: s.id || s._id || s._id, name: s.name, priceType: s.priceType, amount: s.amount, quantity: s.quantity })) : null;
    const newOptions = {};
    if (saFromOptions) newOptions.selectedAttributes = saFromOptions;
    else if (saFromTop) newOptions.selectedAttributes = saFromTop;

    // detect if options need updating (keys other than selectedAttributes present)
    const keys = Object.keys(o || {});
    const onlySelected = keys.length === 0 || (keys.length === 1 && keys[0] === 'selectedAttributes');
    if (!onlySelected) {
      doc.options = newOptions;
      await doc.save();
      count++;
      if (count % 50 === 0) console.log('Updated', count, 'documents...');
    }
  }
  console.log('Sanitization complete. Documents updated:', count);
  await mongoose.disconnect();
}

sanitize().catch(e => { console.error(e); process.exit(1); });
