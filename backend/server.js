require('dotenv').config();

// ─── Environment check — MUST run first, before anything else ────────────────
const { checkEnv } = require('./config/envCheck');
checkEnv();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');

const connectDB = require('./config/db');
const { ingestFIRMSData } = require('./services/firmsIngestion');

// Route imports
const authRoutes = require('./routes/auth');
const detectionRoutes = require('./routes/detections');
const alertRoutes = require('./routes/alerts');
const facilityRoutes = require('./routes/facilities');
const ingestRoutes = require('./routes/ingest');

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// CORS_ORIGIN may be a comma-separated allowlist for production. In development
// any localhost / 127.0.0.1 port is accepted, because Vite increments the port
// when 5173 is already taken (5174, 5175, ...) and would otherwise be blocked.
const allowlist = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isDevLocalOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(cors({
  origin(origin, callback) {
    // No Origin header: same-origin, curl, or server-to-server call
    if (!origin) return callback(null, true);
    if (allowlist.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && isDevLocalOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AGNI-DRISHTI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    data_as_of: global.lastIngestionTime || 'Not yet ingested'
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/detections', detectionRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/ingest', ingestRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, async () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║  🔥 AGNI-DRISHTI  —  Fire Intelligence System      ║
║  Backend running on http://localhost:${PORT}          ║
║  SIH 2026 | NTRO | Problem Statement 26162         ║
╚════════════════════════════════════════════════════╝
    `);

    // Seed check (run `node scripts/seed.mjs` to create the demo admin + facilities)
    try {
      const Facility = require('./models/Facility');
      const facilityCount = await Facility.countDocuments();
      if (facilityCount === 0) {
        console.log('ℹ️  No facilities found — run `node scripts/seed.mjs` to seed demo data.');
      }
    } catch (e) {
      console.log('ℹ️  Facility seed: ', e.message);
    }

    // Initial FIRMS data load
    console.log('📡 Starting initial FIRMS data ingestion...');
    try {
      const result = await ingestFIRMSData(1);
      global.lastIngestionTime = new Date().toISOString();
      console.log(`✅ Initial ingestion complete: ${result.ingested} records`);
    } catch (err) {
      console.error('⚠️  Initial ingestion failed:', err.message);
    }

    // Cron: re-ingest every 30 minutes (FIRMS NRT update cadence)
    cron.schedule('*/30 * * * *', async () => {
      console.log('🔄 [CRON] Running FIRMS ingestion cycle...');
      try {
        const result = await ingestFIRMSData(1);
        global.lastIngestionTime = new Date().toISOString();
        console.log(`✅ [CRON] Ingested ${result.ingested} new records`);
      } catch (err) {
        console.error('❌ [CRON] Ingestion error:', err.message);
      }
    });

    console.log('⏱️  FIRMS auto-refresh scheduled every 30 minutes');
  });
};

startServer();
