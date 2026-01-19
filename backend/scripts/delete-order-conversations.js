#!/usr/bin/env node
// Usage:
// node delete-order-conversations.js --orderId <orderId> [--dry-run] [--backup]

require('dotenv').config();
const connectDB = require('../src/config/database');
const mongoose = require('mongoose');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const fs = require('fs');
const path = require('path');

const argv = require('minimist')(process.argv.slice(2));
const orderId = argv.orderId || argv.orderid || argv.o;
const dryRun = !!argv['dry-run'] || !!argv.d;
const backup = !!argv.backup || !!argv.b;

if (!orderId) {
  console.error('Missing --orderId. Example: --orderId 6969e2ef81d6d1bc2368d4b7');
  process.exit(1);
}

(async () => {
  try {
    await connectDB();
    if (mongoose.connection.readyState !== 1) {
      console.error('Database not connected. Aborting.');
      process.exit(2);
    }

    console.log('Looking up non-support conversations for order', orderId);
    const convs = await Conversation.find({ order: orderId }).lean();
    console.log('Found', convs.length, 'conversations for order', orderId);
    if (!convs || convs.length === 0) return process.exit(0);

    const convIds = convs.map(c => c._id);
    const messages = await Message.find({ conversation: { $in: convIds } }).lean();
    console.log('Found', messages.length, 'messages for these conversations');

    if (backup) {
      const outDir = path.resolve(process.cwd(), 'backup_conversations_' + orderId);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const convFile = path.join(outDir, `conversations_${orderId}.json`);
      const msgFile = path.join(outDir, `messages_${orderId}.json`);
      fs.writeFileSync(convFile, JSON.stringify(convs, null, 2), 'utf8');
      fs.writeFileSync(msgFile, JSON.stringify(messages, null, 2), 'utf8');
      console.log('Backed up conversations ->', convFile);
      console.log('Backed up messages ->', msgFile);
    }

    if (dryRun) {
      console.log('[dry-run] would delete', messages.length, 'messages and', convIds.length, 'conversations for order', orderId);
      return process.exit(0);
    }

    const delMsg = await Message.deleteMany({ conversation: { $in: convIds } });
    console.log('Deleted messages:', delMsg.deletedCount || delMsg.n || 0);
    const delConv = await Conversation.deleteMany({ _id: { $in: convIds } });
    console.log('Deleted conversations:', delConv.deletedCount || delConv.n || 0);

    console.log('Done. Restart backend and reopen client chats so canonical conversations are recreated as needed.');
    process.exit(0);
  } catch (e) {
    console.error('Failed to cleanup conversations/messages', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
