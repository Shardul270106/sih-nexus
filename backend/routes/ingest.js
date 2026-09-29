const express = require('express');
const router = express.Router();
const { ingestFIRMSData, generateSyntheticData } = require('../services/firmsIngestion');

// POST /api/ingest/trigger — manually trigger FIRMS data ingestion
router.post('/trigger', async (req, res) => {
  try {
    const { days = 1 } = req.body;
    console.log('🔄 Manual ingestion triggered');
    const result = await ingestFIRMSData(parseInt(days));
    res.json({ success: true, message: 'Ingestion complete', result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ingest/demo — generate synthetic demo data
router.post('/demo', async (req, res) => {
  try {
    console.log('🎭 Generating synthetic demo data');
    const result = await generateSyntheticData();
    res.json({ success: true, message: 'Demo data generated', result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
