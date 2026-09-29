/**
 * AGNI-DRISHTI Rule-Based + Heuristic ML Classifier
 * Classifies FIRMS thermal detections into source categories.
 * 
 * In production, this would call a FastAPI/Python LightGBM endpoint.
 * For SIH hackathon: implements a deterministic rule engine + scoring heuristics
 * that mimics LightGBM feature-based classification.
 */

// Seasonal crop burning calendar for Indian states (months 1-12)
const CROP_BURNING_CALENDAR = {
  Punjab: [10, 11],         // Post-kharif stubble
  Haryana: [10, 11],
  'Uttar Pradesh': [10, 11, 4, 5],
  'Madhya Pradesh': [4, 5],
  Maharashtra: [3, 4, 5],
  'Andhra Pradesh': [2, 3, 4],
  'West Bengal': [12, 1],
  Odisha: [3, 4],
};

// Known persistent industrial states / regions
const HIGH_INDUSTRIAL_STATES = [
  'Jharkhand', 'West Bengal', 'Chhattisgarh', 'Odisha',
  'Gujarat', 'Maharashtra', 'Rajasthan', 'Tamil Nadu', 'Telangana'
];

// Jharia coal field approximate bounding box
const JHARIA_BOX = { minLat: 23.5, maxLat: 24.0, minLng: 86.2, maxLng: 86.8 };

/**
 * Main classification function
 * @param {Object} detection - raw FIRMS detection record
 * @param {Object} context   - enriched context (facility, land cover, etc.)
 * @returns {Object}          classification result
 */
function classifyDetection(detection, context = {}) {
  const {
    latitude, longitude, bright_ti4, bright_ti5, frp,
    confidence, daynight, acq_date, satellite, type: firmsType
  } = detection;

  const {
    nearest_facility,      // { name, type, distance_km }
    land_cover_fraction,   // { cropland, forest, urban, barren }
    state,
    month,                 // numeric month 1-12
    persistence_count,     // how many times this pixel fired in last 90 days
    is_offshore,
  } = context;

  const reasons = [];
  let category = 'Unresolved';
  let confidence_score = 0.5;
  let status = 'Baseline_Unknown';

  const deltaBT = (bright_ti4 || 0) - (bright_ti5 || 0);  // spectral signature
  const frpVal = frp || 0;
  const persistCount = persistence_count || 0;
  const lcCrop = (land_cover_fraction?.cropland) || 0;
  const lcForest = (land_cover_fraction?.forest) || 0;
  const lcUrban = (land_cover_fraction?.urban) || 0;
  const facilityDist = nearest_facility?.distance_km || 999;
  const facilityType = nearest_facility?.type || '';

  // ─── RULE 1: FIRMS type field (definitive artifact/volcano) ──────────────
  if (firmsType === 1) {
    category = 'Natural_Static';
    confidence_score = 0.95;
    reasons.push('FIRMS type=1 (active volcano)');
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }
  if (firmsType === 2) {
    category = 'Natural_Static';
    confidence_score = 0.9;
    reasons.push('FIRMS type=2 (other static land source)');
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }
  if (firmsType === 3 || is_offshore) {
    category = 'Industrial_Flare';
    confidence_score = 0.8;
    status = 'Normal_Persistent';
    reasons.push('Offshore platform / oil rig (FIRMS type=3)');
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 2: Jharia coalfield zone ────────────────────────────────────────
  if (
    latitude >= JHARIA_BOX.minLat && latitude <= JHARIA_BOX.maxLat &&
    longitude >= JHARIA_BOX.minLng && longitude <= JHARIA_BOX.maxLng
  ) {
    category = 'Mining_Coal';
    confidence_score = 0.9;
    status = persistCount > 20 ? 'Normal_Persistent' : 'Anomalous';
    reasons.push('Location within Jharia coalfield bounding box');
    reasons.push(`Persistence count: ${persistCount} detections in 90 days`);
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 3: High-FRP near industrial facility ────────────────────────────
  if (facilityDist < 2.0 && frpVal > 50) {
    if (['Refinery', 'Gas_Flare', 'LNG_Terminal', 'Petrochemical'].includes(facilityType)) {
      category = 'Industrial_Flare';
      confidence_score = 0.88;
      status = persistCount > 10 ? 'Normal_Persistent' : 'Anomalous';
      reasons.push(`Within 2km of ${facilityType}: ${nearest_facility.name}`);
      reasons.push(`High FRP: ${frpVal.toFixed(1)} MW`);
      reasons.push(`ΔBT (Ti4-Ti5): ${deltaBT.toFixed(1)} K — flare signature`);
    } else if (['Steel_Plant', 'Coke_Oven', 'Blast_Furnace'].includes(facilityType)) {
      category = 'Industrial_Other';
      confidence_score = 0.85;
      status = persistCount > 5 ? 'Normal_Persistent' : 'Anomalous';
      reasons.push(`Within 2km of ${facilityType}: ${nearest_facility.name}`);
      reasons.push(`FRP: ${frpVal.toFixed(1)} MW consistent with furnace operations`);
    } else if (['Coal_Mine', 'Open_Cast_Mine'].includes(facilityType)) {
      category = 'Mining_Coal';
      confidence_score = 0.87;
      status = persistCount > 15 ? 'Normal_Persistent' : 'Anomalous';
      reasons.push(`Near active coal mine: ${nearest_facility.name}`);
    } else if (['Landfill'].includes(facilityType)) {
      category = 'Waste_Landfill';
      confidence_score = 0.82;
      status = persistCount > 3 ? 'Normal_Persistent' : 'Anomalous';
      reasons.push(`Near landfill site: ${nearest_facility.name}`);
    } else {
      category = 'Industrial_Other';
      confidence_score = 0.70;
      reasons.push(`Near industrial facility: ${nearest_facility.name}`);
    }
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 4: Agricultural burning (seasonal + land cover) ─────────────────
  const stateCal = CROP_BURNING_CALENDAR[state] || [];
  const isAgriSeason = stateCal.includes(month);
  if (isAgriSeason && lcCrop > 0.35 && frpVal < 200 && persistCount < 5) {
    category = 'Agricultural';
    confidence_score = 0.78;
    status = 'Normal_Persistent';
    reasons.push(`Crop burning season for ${state} (month ${month})`);
    reasons.push(`Cropland fraction: ${(lcCrop * 100).toFixed(0)}%`);
    reasons.push(`Low FRP (${frpVal.toFixed(1)} MW) consistent with field burning`);
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 5: Forest/vegetation fire ──────────────────────────────────────
  if (lcForest > 0.5 && persistCount < 10 && frpVal < 500 && facilityDist > 5) {
    category = 'Vegetation_Forest';
    confidence_score = 0.75;
    status = 'Anomalous';
    reasons.push(`High forest fraction: ${(lcForest * 100).toFixed(0)}%`);
    reasons.push(`Transient pattern (${persistCount} detections in 90 days)`);
    reasons.push(`Far from facilities (${facilityDist.toFixed(1)} km)`);
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 6: Persistent high-FRP in industrial state = industrial ─────────
  if (persistCount > 25 && HIGH_INDUSTRIAL_STATES.includes(state) && frpVal > 20) {
    category = 'Industrial_Other';
    confidence_score = 0.72;
    status = 'Normal_Persistent';
    reasons.push(`Persistent source (${persistCount} detections in 90 days)`);
    reasons.push(`Industrial state: ${state}`);
    reasons.push(`Possible unmapped facility — routed to analyst review`);
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 7: Very high FRP anomaly (flare-like) ───────────────────────────
  if (frpVal > 500 && deltaBT > 30) {
    category = 'Industrial_Flare';
    confidence_score = 0.80;
    status = 'Anomalous';
    reasons.push(`Extreme FRP (${frpVal.toFixed(0)} MW) — flare signature`);
    reasons.push(`ΔBT Ti4-Ti5: ${deltaBT.toFixed(1)} K (very high, gas flare typical)`);
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── RULE 8: Moderate urban with low forest = informal/waste ─────────────
  if (lcUrban > 0.3 && frpVal < 50 && facilityDist > 3) {
    category = 'Small_Informal';
    confidence_score = 0.60;
    status = 'Baseline_Unknown';
    reasons.push(`Urban fraction: ${(lcUrban * 100).toFixed(0)}%`);
    reasons.push(`Low FRP consistent with informal source (brick kiln, crematorium)`);
    return buildResult(category, status, confidence_score, frpVal, reasons);
  }

  // ─── DEFAULT: Unresolved ──────────────────────────────────────────────────
  reasons.push('Insufficient contextual features to classify confidently');
  reasons.push(`FRP: ${frpVal.toFixed(1)} MW, Confidence: ${confidence}, Persistence: ${persistCount}`);
  return buildResult('Unresolved', 'Baseline_Unknown', 0.35, frpVal, reasons);
}

/**
 * Compute severity score (0-100)
 */
function computeSeverity(detection, context = {}) {
  const frp = detection.frp || 0;
  const facilityDist = context.nearest_facility?.distance_km || 999;
  const population5km = context.population_5km || 0;
  const criticality = context.nearest_facility?.criticality;
  const confidence = context.confidence_score || 0.5;

  let score = 0;
  // FRP component (0-40)
  score += Math.min(40, (frp / 1000) * 40);
  // Facility proximity (0-20)
  if (facilityDist < 1) score += 20;
  else if (facilityDist < 3) score += 15;
  else if (facilityDist < 5) score += 10;
  else if (facilityDist < 10) score += 5;
  // Facility criticality (0-20)
  if (criticality === 'High') score += 20;
  else if (criticality === 'Medium') score += 10;
  // Population (0-10)
  score += Math.min(10, (population5km / 100000) * 10);
  // Confidence boost (0-10)
  score += confidence * 10;

  return Math.round(Math.min(100, score));
}

function buildResult(category, status, confidence_score, frp, reasons) {
  return {
    source_category: category,
    status,
    confidence_score: parseFloat(confidence_score.toFixed(3)),
    shap_reasons: reasons,
    ml_model_version: 'rule_v1.0_heuristic',
    classified_at: new Date()
  };
}

module.exports = { classifyDetection, computeSeverity };
