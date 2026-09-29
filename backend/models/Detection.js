const mongoose = require('mongoose');

const detectionSchema = new mongoose.Schema({
  // Core FIRMS fields
  latitude: { type: Number, required: true, index: true },
  longitude: { type: Number, required: true, index: true },
  bright_ti4: { type: Number },       // Brightness temperature I-4 band (Kelvin)
  bright_ti5: { type: Number },       // Brightness temperature I-5 band (Kelvin)
  frp: { type: Number },              // Fire Radiative Power (MW)
  confidence: { type: String },       // 'l', 'n', 'h' for VIIRS; 0-100 for MODIS
  daynight: { type: String, enum: ['D', 'N'] },
  scan: { type: Number },             // Scan pixel size (km)
  track: { type: Number },            // Track pixel size (km)
  acq_date: { type: Date, index: true },
  acq_time: { type: String },         // HHMM UTC
  satellite: { type: String },        // 'N', 'A', 'N20', etc.
  instrument: { type: String },       // 'VIIRS', 'MODIS'
  type: { type: Number },             // 0=presumed veg, 1=active volcano, 2=other static, 3=offshore
  version: { type: String },          // FIRMS product version

  // Computed fields
  acq_datetime_ist: { type: Date },   // IST = UTC + 5:30
  country: { type: String, default: 'India' },
  state: { type: String },

  // Classification output
  source_category: {
    type: String,
    enum: [
      'Industrial_Flare',
      'Industrial_Other',
      'Mining_Coal',
      'Agricultural',
      'Vegetation_Forest',
      'Waste_Landfill',
      'Small_Informal',
      'Natural_Static',
      'Artifact',
      'Unresolved'
    ],
    default: 'Unresolved'
  },
  status: {
    type: String,
    enum: ['Normal_Persistent', 'Anomalous', 'Planned_Transition', 'Baseline_Unknown'],
    default: 'Baseline_Unknown'
  },
  confidence_score: { type: Number, min: 0, max: 1, default: 0 }, // ML confidence
  severity_score: { type: Number, min: 0, max: 100, default: 0 },
  shap_reasons: [{ type: String }],    // Human-readable ML explanations

  // Flags
  flags: {
    compound_event: { type: Boolean, default: false },
    facility_footprint_hit: { type: Boolean, default: false },
    observation_gap: { type: Boolean, default: false },
    reference_data_uncertain: { type: Boolean, default: false },
    near_border: { type: Boolean, default: false }
  },

  // Verification
  verification_status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Not_Confirmed', 'Unavailable'],
    default: 'Pending'
  },

  // Nearest facility — explicit subdoc Schema (a POJO containing a key named
  // `type: String` makes Mongoose parse the whole path as a String field!)
  nearest_facility: {
    type: new mongoose.Schema({
      facility_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility' },
      name: String,
      type: String,
      distance_km: Number
    }, { _id: false }),
    default: undefined
  },

  // Event cluster
  event_id: { type: String, index: true },

  // ML metadata
  ml_model_version: { type: String },
  rule_applied: { type: String },
  classified_at: { type: Date },

  // Raw
  raw_source: { type: String }, // 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'
}, {
  timestamps: true,
  collection: 'detections'
});

detectionSchema.index({ latitude: 1, longitude: 1 });
detectionSchema.index({ acq_date: -1 });
detectionSchema.index({ source_category: 1 });
detectionSchema.index({ frp: -1 });

module.exports = mongoose.model('Detection', detectionSchema);
