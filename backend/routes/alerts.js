const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const { protect } = require('../middleware/auth');

// GET /api/alerts — list alerts with filters
router.get('/', async (req, res) => {
  try {
    const { status, tier, category, limit = 50, page = 1 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (tier) query.tier = tier;
    if (category) query.category = category;

    const alerts = await Alert.find(query)
      .sort({ severity_score: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('acknowledged_by', 'name')
      .lean();

    const total = await Alert.countDocuments(query);
    res.json({ success: true, count: alerts.length, total, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/alerts/stats — must be registered BEFORE /:id to avoid being shadowed
router.get('/stats', async (req, res) => {
  try {
    const stats = await Alert.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const priority = await Alert.countDocuments({ tier: 'Priority', status: 'Open' });
    res.json({ success: true, data: { by_status: stats, priority_open: priority } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/alerts/:id — update alert status
router.patch('/:id', protect, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = { status, notes };
    if (status === 'Acknowledged') update.acknowledged_by = req.user._id;
    if (status === 'Resolved') {
      update.resolved_by = req.user._id;
      update.resolved_at = new Date();
    }
    const alert = await Alert.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
