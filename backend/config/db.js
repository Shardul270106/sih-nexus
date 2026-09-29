const mongoose = require('mongoose');

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 3000;

/**
 * Connect to MongoDB with retry — the server should survive a DB that
 * starts slowly or restarts (docker compose race), not exit on first failure.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/agni_drishti';

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected — Mongoose will auto-reconnect');
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await mongoose.connect(uri);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (error) {
      console.error(`❌ MongoDB attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
      if (attempt === MAX_RETRIES) {
        console.error(`Giving up after ${MAX_RETRIES} attempts. Is MongoDB running?`);
        console.error('   Try: docker run -d -p 27017:27017 --name agni-mongo mongo:7');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
};

module.exports = connectDB;
