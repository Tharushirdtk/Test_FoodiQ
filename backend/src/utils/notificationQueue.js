const { sendOrderReceiptEmail, sendSupportEmail } = require('./mailer');
const { sendSms } = require('./smsProvider');

// Simple in-memory queue with retry and exponential backoff.
// Note: this is intentionally lightweight. For production use, replace with a persistent queue (Bull/Redis, SQS, etc.).

const queue = [];
let processing = false;

const enqueue = (task) => {
  queue.push({ task, attempts: 0 });
  if (!processing) processNext();
};

const processNext = async () => {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const item = queue.shift();
    const { task } = item;
    try {
      await runWithRetry(task);
    } catch (e) {
      console.error('notificationQueue: task failed after retries', e && e.message);
    }
  }
  processing = false;
};

const runWithRetry = async (fn, maxAttempts = 3) => {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      attempt++;
      await fn();
      return;
    } catch (e) {
      console.warn(`notificationQueue: attempt ${attempt} failed`, e && e.message);
      if (attempt >= maxAttempts) throw e;
      // exponential backoff
      const delay = Math.min(30000, Math.pow(2, attempt) * 1000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
};

// Helper wrappers to enqueue common jobs
const queueEmail = (fn) => {
  enqueue(fn);
};

const queueSms = (fn) => {
  enqueue(fn);
};

module.exports = { queueEmail, queueSms };
