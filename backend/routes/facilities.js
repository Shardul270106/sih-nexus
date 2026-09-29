const express = require('express');
const router = express.Router();
const Facility = require('../models/Facility');

// GET /api/facilities
router.get('/', async (req, res) => {
  try {
    const { type, state, criticality, limit = 200 } = req.query;
    const query = {};
    if (type) query.type = type;
    if (state) query.state = new RegExp(state, 'i');
    if (criticality) query.criticality = criticality;

    const facilities = await Facility.find(query)
      .limit(parseInt(limit))
      .select('-__v')
      .lean();

    res.json({ success: true, count: facilities.length, data: facilities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/facilities/geojson
router.get('/geojson', async (req, res) => {
  try {
    const facilities = await Facility.find({ is_sensitive: false })
      .select('name type location criticality detectability state status')
      .lean();

    const geojson = {
      type: 'FeatureCollection',
      features: facilities.map(f => ({
        type: 'Feature',
        geometry: f.location,
        properties: {
          id: f._id,
          name: f.name,
          type: f.type,
          criticality: f.criticality,
          detectability: f.detectability,
          state: f.state,
          status: f.status
        }
      }))
    };

    res.json(geojson);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/facilities — add new facility
router.post('/', async (req, res) => {
  try {
    const facility = await Facility.create(req.body);
    res.status(201).json({ success: true, data: facility });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/facilities/seed — seed with known Indian industrial sites
router.post('/seed', async (req, res) => {
  try {
    const existing = await Facility.countDocuments();
    if (existing > 0) {
      return res.json({ success: true, message: `${existing} facilities already exist, skipping seed` });
    }

    const seedData = [
      {
        name: 'Reliance Industries Jamnagar Refinery',
        type: 'Refinery',
        location: { type: 'Point', coordinates: [70.0620, 22.3896] },
        state: 'Gujarat', criticality: 'High', detectability: 'High',
        operator: 'Reliance Industries', source: 'GEM'
      },
      {
        name: 'Bharat Petroleum Refinery Mumbai',
        type: 'Refinery',
        location: { type: 'Point', coordinates: [72.8777, 19.0760] },
        state: 'Maharashtra', criticality: 'High', detectability: 'Moderate_High',
        operator: 'BPCL', source: 'Manual'
      },
      {
        name: 'Jharia Coalfield Zone',
        type: 'Coal_Mine',
        location: { type: 'Point', coordinates: [86.4383, 23.7500] },
        state: 'Jharkhand', criticality: 'High', detectability: 'High',
        operator: 'Bharat Coking Coal Ltd', source: 'Manual'
      },
      {
        name: 'Bhilai Steel Plant',
        type: 'Steel_Plant',
        location: { type: 'Point', coordinates: [81.3808, 21.2158] },
        state: 'Chhattisgarh', criticality: 'High', detectability: 'Moderate_High',
        operator: 'SAIL', source: 'OSM'
      },
      {
        name: 'Rourkela Steel Plant',
        type: 'Steel_Plant',
        location: { type: 'Point', coordinates: [84.8609, 22.2270] },
        state: 'Odisha', criticality: 'High', detectability: 'Moderate_High',
        operator: 'SAIL', source: 'OSM'
      },
      {
        name: 'Bhalswa Landfill Delhi',
        type: 'Landfill',
        location: { type: 'Point', coordinates: [77.1807, 28.7305] },
        state: 'Delhi', criticality: 'Medium', detectability: 'Moderate',
        operator: 'EDMC', source: 'OSM'
      },
      {
        name: 'Vizag Refinery HPCL',
        type: 'Refinery',
        location: { type: 'Point', coordinates: [83.2985, 17.6999] },
        state: 'Andhra Pradesh', criticality: 'High', detectability: 'High',
        operator: 'HPCL', source: 'OSM'
      },
      {
        name: 'NTPC Korba Thermal Power Plant',
        type: 'Thermal_Power_Plant',
        location: { type: 'Point', coordinates: [82.7501, 22.3595] },
        state: 'Chhattisgarh', criticality: 'High', detectability: 'Low',
        operator: 'NTPC', source: 'GEM'
      },
      {
        name: 'Mumbai High Offshore Platforms',
        type: 'Gas_Flare',
        location: { type: 'Point', coordinates: [72.5000, 19.0700] },
        state: 'Maharashtra', criticality: 'High', detectability: 'High',
        operator: 'ONGC', source: 'Manual'
      },
      {
        name: 'Durgapur Steel Plant',
        type: 'Steel_Plant',
        location: { type: 'Point', coordinates: [87.3119, 23.4800] },
        state: 'West Bengal', criticality: 'High', detectability: 'Moderate_High',
        operator: 'SAIL', source: 'OSM'
      }
    ];

    await Facility.insertMany(seedData);
    res.json({ success: true, message: `Seeded ${seedData.length} facilities`, count: seedData.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
