const express = require('express');
const router = express.Router();
const Detection = require('../models/Detection');

/**
 * GET /api/detections
 * Query params: category, state, minFrp, maxFrp, confidence, satellite,
 *               startDate, endDate, daynight, status, limit, page
 */
router.get('/', async (req, res) => {
  try {
    const {
      category, state, minFrp, maxFrp, confidence, satellite,
      startDate, endDate, daynight, status, verification,
      limit = 500, page = 1, bbox
    } = req.query;

    const query = {};

    if (category && category !== 'All') query.source_category = category;
    if (state) query.state = new RegExp(state, 'i');
    if (daynight) query.daynight = daynight;
    if (status) query.status = status;
    if (verification) query.verification_status = verification;
    if (satellite) query.satellite = satellite;

    if (minFrp || maxFrp) {
      query.frp = {};
      if (minFrp) query.frp.$gte = parseFloat(minFrp);
      if (maxFrp) query.frp.$lte = parseFloat(maxFrp);
    }

    if (startDate || endDate) {
      query.acq_date = {};
      if (startDate) query.acq_date.$gte = new Date(startDate);
      if (endDate) query.acq_date.$lte = new Date(endDate);
    }

    // Bounding box filter: bbox=minLng,minLat,maxLng,maxLat
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(parseFloat);
      query.latitude = { $gte: minLat, $lte: maxLat };
      query.longitude = { $gte: minLng, $lte: maxLng };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const detections = await Detection.find(query)
      .sort({ acq_date: -1, frp: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('-__v')
      .lean();

    const total = await Detection.countDocuments(query);

    res.json({
      success: true,
      count: detections.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: detections
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/detections/geojson
 * Returns GeoJSON FeatureCollection for map rendering
 */
router.get('/geojson', async (req, res) => {
  try {
    const { category, startDate, endDate, minFrp, bbox, limit = 1000 } = req.query;
    const query = {};

    if (category && category !== 'All') query.source_category = category;
    if (minFrp) query.frp = { $gte: parseFloat(minFrp) };
    if (startDate) query.acq_date = { $gte: new Date(startDate) };
    if (endDate) {
      query.acq_date = query.acq_date || {};
      query.acq_date.$lte = new Date(endDate);
    }
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(parseFloat);
      query.latitude = { $gte: minLat, $lte: maxLat };
      query.longitude = { $gte: minLng, $lte: maxLng };
    }

    const detections = await Detection.find(query)
      .sort({ frp: -1 })
      .limit(parseInt(limit))
      .select('latitude longitude frp source_category status confidence_score severity_score acq_date state satellite shap_reasons flags nearest_facility')
      .lean();

    const geojson = {
      type: 'FeatureCollection',
      features: detections.map(d => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
        properties: {
          id: d._id,
          frp: d.frp,
          category: d.source_category,
          status: d.status,
          confidence: d.confidence_score,
          severity: d.severity_score,
          acq_date: d.acq_date,
          state: d.state,
          satellite: d.satellite,
          reasons: d.shap_reasons,
          flags: d.flags,
          facility: d.nearest_facility
        }
      }))
    };

    res.json(geojson);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/detections/stats
 * Summary statistics for dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - parseInt(days) * 24 * 3600 * 1000);

    const [categoryStats, totalCount, highFrp, anomalous] = await Promise.all([
      Detection.aggregate([
        { $match: { acq_date: { $gte: since } } },
        { $group: { _id: '$source_category', count: { $sum: 1 }, avgFrp: { $avg: '$frp' }, totalFrp: { $sum: '$frp' } } },
        { $sort: { count: -1 } }
      ]),
      Detection.countDocuments({ acq_date: { $gte: since } }),
      Detection.countDocuments({ frp: { $gt: 100 }, acq_date: { $gte: since } }),
      Detection.countDocuments({ status: 'Anomalous', acq_date: { $gte: since } }),
    ]);

    // Daily trend
    const dailyTrend = await Detection.aggregate([
      { $match: { acq_date: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$acq_date' } },
          count: { $sum: 1 },
          avgFrp: { $avg: '$frp' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // State distribution
    const stateStats = await Detection.aggregate([
      { $match: { acq_date: { $gte: since } } },
      { $group: { _id: '$state', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        total: totalCount,
        high_frp: highFrp,
        anomalous,
        by_category: categoryStats,
        daily_trend: dailyTrend,
        by_state: stateStats,
        as_of: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/detections/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const detection = await Detection.findById(req.params.id)
      .populate('nearest_facility.facility_id', 'name type criticality detectability')
      .lean();
    if (!detection) {
      return res.status(404).json({ success: false, message: 'Detection not found' });
    }
    res.json({ success: true, data: detection });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
