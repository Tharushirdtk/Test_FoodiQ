#!/usr/bin/env node
// Usage:
// node migrate-merge-order-conversations.js --orderId <orderId> [--dry-run]

// Load environment variables (MONGO_URI)
require('dotenv').config();
const connectDB = require('../src/config/database');
const mongoose = require('mongoose');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

const argv = require('minimist')(process.argv.slice(2));
const orderId = argv.orderId || argv.orderid || argv.o;
const dryRun = !!argv['dry-run'] || !!argv.dry;

if (!orderId) {
  console.error('Missing --orderId. Example: --orderId 6969e2ef81d6d1bc2368d4b7');
  process.exit(1);
}

(async () => {
  try {
    await connectDB();

    // ensure connection succeeded
    if (mongoose.connection.readyState !== 1) {
      console.error('Database not connected. Check MONGO_URI and network/DNS settings. Aborting.');
      process.exit(2);
    }

    console.log('Looking up non-support conversations for order', orderId);
    const convs = await Conversation.find({ order: orderId, isSupportConversation: false }).sort({ createdAt: 1 }).lean();
    console.log('Found', convs.length, 'conversations for order', orderId);
    if (!convs || convs.length <= 1) {
      console.log('Nothing to merge');
      process.exit(0);
    }

    // compute message counts for each conversation
    const withCounts = [];
    for (const c of convs) {
      const cnt = await Message.countDocuments({ conversation: c._id });
      withCounts.push({ conv: c, messages: cnt });
    }

    // choose primary: prefer highest message count, fallback to earliest
    withCounts.sort((a, b) => {
      if (a.messages !== b.messages) return b.messages - a.messages;
      return new Date(a.conv.createdAt) - new Date(b.conv.createdAt);
    });

    const primary = withCounts[0].conv;
    console.log('Selected primary conversation:', primary._id.toString(), 'messageCount=', withCounts[0].messages);

    for (let i = 1; i < withCounts.length; i++) {
      const other = withCounts[i].conv;
      const msgCount = withCounts[i].messages;

      console.log(`\nProcessing duplicate conversation ${other._id.toString()} (messages=${msgCount}) -> primary ${primary._id.toString()}`);
      if (dryRun) {
        console.log('[dry-run] would reassign', msgCount, 'messages to', primary._id.toString());
        console.log('[dry-run] would merge participants:', (primary.participants || []).concat(other.participants || []));
        console.log('[dry-run] would remove conversation', other._id.toString());
        continue;
      }

      // Reassign messages
      const res = await Message.updateMany({ conversation: other._id }, { $set: { conversation: primary._id } });
      console.log('Reassigned messages:', res.nModified || res.modifiedCount || res.n || 0);

      // Merge participants
      const primaryDoc = await Conversation.findById(primary._id);
      const otherDoc = await Conversation.findById(other._id);
      const pSet = new Set(((primaryDoc.participants || []).map(String)).concat(((otherDoc.participants || []).map(String))));
      primaryDoc.participants = Array.from(pSet);

      // Merge viewers (if any)
      const vSet = new Set(((primaryDoc.viewers || []).map(String)).concat(((otherDoc.viewers || []) .map(String))));
      primaryDoc.viewers = Array.from(vSet);

      // Update lastMessageAt to latest
      const lastA = primaryDoc.lastMessageAt ? new Date(primaryDoc.lastMessageAt) : null;
      const lastB = otherDoc.lastMessageAt ? new Date(otherDoc.lastMessageAt) : null;
      if (!lastA || (lastB && lastB > lastA)) primaryDoc.lastMessageAt = lastB || lastA;

      await primaryDoc.save();

      // Delete the other conversation
      await Conversation.deleteOne({ _id: other._id });
      console.log('Deleted duplicate conversation', other._id.toString());
    }

    // Recompute consistent lastMessageAt from messages
    const lastMsg = await Message.findOne({ conversation: primary._id }).sort({ createdAt: -1 });
    if (lastMsg) {
      await Conversation.findByIdAndUpdate(primary._id, { lastMessageAt: lastMsg.createdAt });
      console.log('Updated primary.lastMessageAt to', lastMsg.createdAt.toISOString());
    }

    console.log('\nMigration complete for order', orderId);
    process.exit(0);
  } catch (e) {
    console.error('Migration failed', e);
    process.exit(2);
  }
})();
