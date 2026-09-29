/**
 * FIRMS Data Ingestion Service
 * Fetches VIIRS NRT CSV data from NASA FIRMS API and stores into MongoDB
 * 
 * FIRMS API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{source}/{area}/{dayRange}
 * India bounding box: 6.5,68.0,37.5,97.5 (lat_min,lng_min,lat_max,lng_max)
 */

const axios = require('axios');
const { parse } = require('csv-parse/sync');
const Detection = require('../models/Detection');
const Alert = require('../models/Alert');
const Facility = require('../models/Facility');
const { classifyDetection, computeSeverity } = require('./classifier');

// FIRMS area API bbox format: west,south,east,north (lng_west,lat_south,lng_east,lat_north)
// India with margin: south 6.5, west 68.0, north 37.5, east 97.5
const FIRMS_BBOX = '68.0,6.5,97.5,37.5';

const SOURCES = [
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
];

/**
 * Convert UTC datetime to IST (UTC+5:30)
 */
function toIST(date) {
  const ist = new Date(date);
  ist.setMinutes(ist.getMinutes() + 330);
  return ist;
}

/**
 * Parse FIRMS confidence string/number to normalized value 0-1
 */
function normalizeConfidence(conf) {
  if (conf === 'h' || conf === 'high') return 0.85;
  if (conf === 'n' || conf === 'nominal') return 0.60;
  if (conf === 'l' || conf === 'low') return 0.30;
  const n = parseFloat(conf);
  if (!isNaN(n)) return n / 100;
  return 0.5;
}

/**
 * Find nearest facility to a detection point
 */
async function findNearestFacility(lat, lng) {
  try {
    const facilities = await Facility.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 25000  // 25 km search radius in meters
        }
      }
    }).limit(1).lean();

    if (facilities.length === 0) return null;

    const f = facilities[0];
    // Haversine approximate distance
    const R = 6371;
    const dLat = ((f.location.coordinates[1] - lat) * Math.PI) / 180;
    const dLng = ((f.location.coordinates[0] - lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) * Math.cos((f.location.coordinates[1] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    const distance_km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return {
      facility_id: f._id,
      name: f.name,
      type: f.type,
      criticality: f.criticality,
      distance_km: parseFloat(distance_km.toFixed(2))
    };
  } catch {
    return null;
  }
}

/**
 * Determine Indian state from coordinates (simplified lookup table)
 */
function getStateFromCoords(lat, lng) {
  // Simplified bounding boxes for major states
  const states = [
    { name: 'Jharkhand', minLat: 21.9, maxLat: 25.3, minLng: 83.3, maxLng: 87.9 },
    { name: 'West Bengal', minLat: 21.4, maxLat: 27.2, minLng: 85.8, maxLng: 89.9 },
    { name: 'Odisha', minLat: 17.7, maxLat: 22.5, minLng: 81.3, maxLng: 87.4 },
    { name: 'Chhattisgarh', minLat: 17.7, maxLat: 24.1, minLng: 80.2, maxLng: 84.3 },
    { name: 'Punjab', minLat: 29.5, maxLat: 32.5, minLng: 73.9, maxLng: 76.9 },
    { name: 'Haryana', minLat: 27.6, maxLat: 30.9, minLng: 74.4, maxLng: 77.6 },
    { name: 'Uttar Pradesh', minLat: 23.8, maxLat: 30.4, minLng: 77.1, maxLng: 84.6 },
    { name: 'Madhya Pradesh', minLat: 21.1, maxLat: 26.8, minLng: 74.0, maxLng: 82.8 },
    { name: 'Rajasthan', minLat: 23.0, maxLat: 30.2, minLng: 69.5, maxLng: 78.2 },
    { name: 'Gujarat', minLat: 20.1, maxLat: 24.7, minLng: 68.1, maxLng: 74.5 },
    { name: 'Maharashtra', minLat: 15.6, maxLat: 22.0, minLng: 72.6, maxLng: 80.9 },
    { name: 'Tamil Nadu', minLat: 8.0, maxLat: 13.6, minLng: 76.2, maxLng: 80.3 },
    { name: 'Telangana', minLat: 15.9, maxLat: 19.9, minLng: 77.2, maxLng: 81.3 },
    { name: 'Andhra Pradesh', minLat: 12.4, maxLat: 19.9, minLng: 76.8, maxLng: 84.8 },
    { name: 'Karnataka', minLat: 11.5, maxLat: 18.5, minLng: 74.0, maxLng: 78.6 },
  ];
  for (const s of states) {
    if (lat >= s.minLat && lat <= s.maxLat && lng >= s.minLng && lng <= s.maxLng) {
      return s.name;
    }
  }
  return 'India';
}

/**
 * Generate a cluster/event ID based on space-time DBSCAN approximation
 */
function generateEventId(lat, lng, date) {
  const latCell = Math.round(lat * 100) / 100;   // ~1 km resolution
  const lngCell = Math.round(lng * 100) / 100;
  const dayStr = date.toISOString().split('T')[0];
  return `EVT_${latCell}_${lngCell}_${dayStr}`;
}

/**
 * Get land cover fractions (simplified rule-based, replace with ESA WorldCover in production)
 */
function getLandCoverEstimate(lat, lng, state) {
  const industrialStates = ['Jharkhand', 'Chhattisgarh', 'Odisha', 'West Bengal'];
  const agriStates = ['Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh'];
  const forestStates = ['Uttarakhand', 'Himachal Pradesh', 'Arunachal Pradesh', 'Nagaland'];

  if (industrialStates.includes(state)) {
    return { urban: 0.15, industrial: 0.3, forest: 0.35, cropland: 0.15, barren: 0.05 };
  }
  if (agriStates.includes(state)) {
    return { urban: 0.1, industrial: 0.05, forest: 0.15, cropland: 0.65, barren: 0.05 };
  }
  if (forestStates.includes(state)) {
    return { urban: 0.05, industrial: 0.02, forest: 0.75, cropland: 0.15, barren: 0.03 };
  }
  return { urban: 0.15, industrial: 0.1, forest: 0.3, cropland: 0.35, barren: 0.1 };
}

/**
 * Main ingestion function — fetches real FIRMS data and classifies it
 */
async function ingestFIRMSData(daysRange = 1) {
  const mapKey = process.env.FIRMS_MAP_KEY;
  const baseUrl = process.env.FIRMS_BASE_URL;

  if (!mapKey || mapKey === 'your_firms_map_key_here') {
    console.log('⚠️  FIRMS MAP_KEY not set — generating synthetic demo data');
    return await generateSyntheticData();
  }

  let totalIngested = 0;
  const now = new Date();

  for (const source of SOURCES) {
    try {
      // FIRMS area API: /csv/{MAP_KEY}/{source}/{bbox}/{dayRange}
      // bbox format: lat_south,lng_west,lat_north,lng_east
      const url = `${baseUrl}/${mapKey}/${source}/${FIRMS_BBOX}/${daysRange}`;
      console.log(`📡 Fetching FIRMS data from: ${source}`);

      const response = await axios.get(url, {
        timeout: 30000,
        headers: { 'User-Agent': 'AGNI-DRISHTI/1.0 (SIH 2026, NTRO)' }
      });

      if (!response.data || response.data.trim().length === 0) {
        console.log(`⚠️  Empty response from ${source}`);
        continue;
      }

      const records = parse(response.data, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      console.log(`📊 Parsed ${records.length} records from ${source}`);

      for (const row of records) {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        if (isNaN(lat) || isNaN(lng)) continue;

        // FIRMS writes acq_time as HMM/HHMM WITHOUT leading zeros (e.g. "724" = 07:24)
        const timeStr = String(row.acq_time || '0').padStart(4, '0');
        const acqDate = new Date(`${row.acq_date}T${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}:00Z`);
        if (isNaN(acqDate.getTime())) {
          console.warn(`⚠️  Skipping row with invalid acq_date/acq_time: ${row.acq_date} ${row.acq_time}`);
          continue;
        }

        // Skip duplicates (same lat/lng/date)
        const existing = await Detection.findOne({
          latitude: lat,
          longitude: lng,
          acq_date: acqDate,
          satellite: row.satellite
        });
        if (existing) continue;

        const state = getStateFromCoords(lat, lng);
        const nearestFacility = await findNearestFacility(lat, lng);
        const landCover = getLandCoverEstimate(lat, lng, state);
        const month = acqDate.getMonth() + 1;

        // Count persistence (how many times this pixel fired in last 90 days)
        const persistenceCount = await Detection.countDocuments({
          latitude: { $gte: lat - 0.004, $lte: lat + 0.004 },
          longitude: { $gte: lng - 0.004, $lte: lng + 0.004 },
          acq_date: { $gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) }
        });

        const context = {
          nearest_facility: nearestFacility,
          land_cover_fraction: landCover,
          state,
          month,
          persistence_count: persistenceCount,
          is_offshore: lat < 8.0 || lat > 37.5
        };

        const frp = parseFloat(row.frp) || 0;
        const classification = classifyDetection({
          latitude: lat, longitude: lng,
          bright_ti4: parseFloat(row.bright_ti4),
          bright_ti5: parseFloat(row.bright_ti5),
          frp,
          confidence: row.confidence,
          daynight: row.daynight,
          acq_date: acqDate,
          satellite: row.satellite,
          type: parseInt(row.type) || 0
        }, context);

        const severity = computeSeverity(
          { frp },
          { ...context, confidence_score: classification.confidence_score }
        );

        const detection = new Detection({
          latitude: lat,
          longitude: lng,
          bright_ti4: parseFloat(row.bright_ti4) || null,
          bright_ti5: parseFloat(row.bright_ti5) || null,
          frp,
          confidence: row.confidence,
          daynight: row.daynight,
          scan: parseFloat(row.scan),
          track: parseFloat(row.track),
          acq_date: acqDate,
          acq_time: row.acq_time,
          satellite: row.satellite,
          instrument: row.instrument || 'VIIRS',
          type: parseInt(row.type) || 0,
          version: row.version,
          acq_datetime_ist: toIST(acqDate),
          state,
          ...classification,
          severity_score: severity,
          nearest_facility: nearestFacility ? {
            facility_id: nearestFacility.facility_id,
            name: nearestFacility.name,
            type: nearestFacility.type,
            distance_km: nearestFacility.distance_km
          } : undefined,
          event_id: generateEventId(lat, lng, acqDate),
          raw_source: source
        });

        await detection.save();
        totalIngested++;

        // Create alert for high-severity anomalous events
        if (severity >= 60 && classification.status === 'Anomalous') {
          await createAlert(detection, nearestFacility, severity);
        }
      }

      console.log(`✅ Ingested ${totalIngested} new detections from ${source}`);
    } catch (err) {
      console.error(`❌ Ingestion error for ${source}: ${err.message}`);
    }
  }

  return { ingested: totalIngested, timestamp: now };
}

/**
 * Create an alert for anomalous high-severity detection
 */
const CATEGORY_TITLES = {
  Industrial_Flare: 'Gas flare anomaly',
  Industrial_Other: 'Industrial heat anomaly',
  Mining_Coal: 'Coal / mining fire anomaly',
  Agricultural: 'Agricultural burning spike',
  Vegetation_Forest: 'Forest fire anomaly',
  Waste_Landfill: 'Landfill fire anomaly',
  Small_Informal: 'Small informal source anomaly',
  Natural_Static: 'Natural static source activity',
  Artifact: 'Probable sensor artifact',
  Unresolved: 'Unclassified thermal anomaly',
};

/**
 * Alert tiering.
 * Agricultural burning is routine and stays map-only (Info) unless it threatens a
 * high-criticality asset — this keeps the Oct–Nov stubble spike out of the queue.
 */
function tierFor(detection, facility, severity) {
  const nearCriticalAsset = facility?.criticality === 'High';
  if (detection.source_category === 'Agricultural' && !nearCriticalAsset) return 'Info';
  if (severity >= 80) return 'Priority';
  if (severity >= 60) return 'Standard';
  return 'Info';
}

async function createAlert(detection, facility, severity) {
  try {
    const tier = tierFor(detection, facility, severity);
    const alert = new Alert({
      detection_id: detection._id,
      event_id: detection.event_id,
      facility_id: facility?.facility_id,
      title: `${CATEGORY_TITLES[detection.source_category] || detection.source_category} — ${detection.location?.state || detection.state || ''} · FRP ${detection.frp?.toFixed?.(1) ?? '?'} MW`,
      description: detection.shap_reasons?.join('. '),
      category: detection.source_category,
      severity_score: Math.round(severity),
      tier,
      status: 'Open',
      location: {
        lat: detection.latitude,
        lng: detection.longitude,
        state: detection.state
      },
      frp: detection.frp
    });
    await alert.save();
  } catch (err) {
    console.error('Alert creation error:', err.message);
  }
}

/**
 * Generate realistic synthetic FIRMS-like data for demo when API key not available
 *
 * Deterministic: every (site, day-slot) produces IDENTICAL values on every run,
 * so repeated cron ticks / restarts dedupe exactly and never duplicate data.
 */

// FNV-1a hash → uint32 seed
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 seeded PRNG — same seed ⇒ same sequence
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function generateSyntheticData() {
  const syntheticPoints = [
    // Jharia coal fires (persistent)
    { lat: 23.73, lng: 86.44, frp: 45.2, bright_ti4: 320, bright_ti5: 295, state: 'Jharkhand', category: 'Mining_Coal' },
    { lat: 23.75, lng: 86.46, frp: 67.1, bright_ti4: 335, bright_ti5: 298, state: 'Jharkhand', category: 'Mining_Coal' },
    // Jamnagar refinery flares (Gujarat)
    { lat: 22.39, lng: 70.06, frp: 245.3, bright_ti4: 380, bright_ti5: 310, state: 'Gujarat', category: 'Industrial_Flare' },
    { lat: 22.41, lng: 70.08, frp: 189.7, bright_ti4: 365, bright_ti5: 305, state: 'Gujarat', category: 'Industrial_Flare' },
    // Mumbai High offshore flares
    { lat: 19.08, lng: 72.85, frp: 156.2, bright_ti4: 350, bright_ti5: 300, state: 'Maharashtra', category: 'Industrial_Flare' },
    // Punjab stubble burning
    { lat: 30.35, lng: 74.55, frp: 22.1, bright_ti4: 308, bright_ti5: 296, state: 'Punjab', category: 'Agricultural' },
    { lat: 30.42, lng: 74.61, frp: 18.5, bright_ti4: 305, bright_ti5: 294, state: 'Punjab', category: 'Agricultural' },
    { lat: 30.28, lng: 74.48, frp: 31.2, bright_ti4: 312, bright_ti5: 297, state: 'Punjab', category: 'Agricultural' },
    // Similipal forest fire (Odisha)
    { lat: 21.85, lng: 86.35, frp: 78.4, bright_ti4: 325, bright_ti5: 299, state: 'Odisha', category: 'Vegetation_Forest' },
    { lat: 21.87, lng: 86.38, frp: 92.1, bright_ti4: 330, bright_ti5: 300, state: 'Odisha', category: 'Vegetation_Forest' },
    // Delhi Bhalswa landfill
    { lat: 28.73, lng: 77.18, frp: 35.6, bright_ti4: 315, bright_ti5: 297, state: 'Delhi', category: 'Waste_Landfill' },
    // Bhilai steel plant (Chhattisgarh)
    { lat: 21.21, lng: 81.38, frp: 112.3, bright_ti4: 345, bright_ti5: 303, state: 'Chhattisgarh', category: 'Industrial_Other' },
    // Rourkela steel plant (Odisha)
    { lat: 22.23, lng: 84.86, frp: 98.7, bright_ti4: 340, bright_ti5: 301, state: 'Odisha', category: 'Industrial_Other' },
    // Vizag refinery (Andhra Pradesh)
    { lat: 17.70, lng: 83.30, frp: 175.2, bright_ti4: 360, bright_ti5: 308, state: 'Andhra Pradesh', category: 'Industrial_Flare' },
    // Unresolved detection
    { lat: 24.50, lng: 78.20, frp: 12.3, bright_ti4: 300, bright_ti5: 293, state: 'Madhya Pradesh', category: 'Unresolved' },
  ];

  let count = 0;
  const now = new Date();

  for (const point of syntheticPoints) {
    // Generate multiple time points (last 3 days), pinned to 12:00 UTC so
    // the acquisition timestamp is stable across runs of the same day.
    for (let d = 0; d < 3; d++) {
      const daySlot = new Date(now);
      daySlot.setUTCHours(12, 0, 0, 0);
      const acqDate = new Date(daySlot - d * 24 * 3600 * 1000);

      // Deterministic per-(site, day) randomness — stable across restarts
      const rng = mulberry32(hashSeed(`${point.lat},${point.lng},${d},${acqDate.toISOString().slice(0, 10)}`));
      const lat = point.lat + (rng() - 0.5) * 0.01;
      const lng = point.lng + (rng() - 0.5) * 0.01;
      const latR = parseFloat(lat.toFixed(4));
      const lngR = parseFloat(lng.toFixed(4));

      // Exact dedup on deterministic coords + slot time
      const existing = await Detection.findOne({ latitude: latR, longitude: lngR, acq_date: acqDate });
      if (existing) continue;

      const frp = point.frp * (0.8 + rng() * 0.4);
      // Industrial/mining sources are mostly routine (Normal_Persistent) with
      // occasional anomalous spikes; natural/transient sources are anomalous.
      const isIndustrialLike = point.category.includes('Industrial') || point.category === 'Mining_Coal';
      const status = isIndustrialLike
        ? (rng() < 0.6 ? 'Normal_Persistent' : 'Anomalous')
        : 'Anomalous';
      const severity = isIndustrialLike ? 45 + rng() * 45 : 20 + rng() * 35;

      const detection = new Detection({
        latitude: latR,
        longitude: lngR,
        bright_ti4: point.bright_ti4 + rng() * 10,
        bright_ti5: point.bright_ti5 + rng() * 5,
        frp: parseFloat(frp.toFixed(1)),
        confidence: frp > 100 ? 'h' : frp > 40 ? 'n' : 'l',
        daynight: rng() > 0.5 ? 'D' : 'N',
        scan: 0.375,
        track: 0.375,
        acq_date: acqDate,
        acq_time: '1200',
        satellite: d % 2 === 0 ? 'N' : 'A',
        instrument: 'VIIRS',
        type: 0,
        version: '2.0NRT',
        acq_datetime_ist: toIST(acqDate),
        state: point.state,
        source_category: point.category,
        status,
        confidence_score: 0.7 + rng() * 0.25,
        severity_score: parseFloat(severity.toFixed(0)),
        shap_reasons: [
          `Synthetic demo data for ${point.category}`,
          `FRP: ${frp.toFixed(1)} MW`,
          `Location: ${point.state}`
        ],
        ml_model_version: 'synthetic_v1.0',
        classified_at: new Date(),
        event_id: generateEventId(latR, lngR, acqDate),
        raw_source: 'SYNTHETIC_DEMO',
        flags: {
          compound_event: false,
          facility_footprint_hit: point.category.includes('Industrial'),
          observation_gap: false,
          reference_data_uncertain: false,
          near_border: false
        }
      });

      await detection.save();
      count++;

      // Create alerts for high-severity anomalous events
      if (severity >= 55 && detection.status === 'Anomalous') {
        await createAlert(detection, null, severity);
      }
    }
  }

  console.log(`✅ Generated ${count} synthetic demo detections`);
  return { ingested: count, timestamp: now, mode: 'synthetic' };
}

module.exports = { ingestFIRMSData, generateSyntheticData };
