const mongoose = require('mongoose');

const facilitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'Refinery',
      'Gas_Flare',
      'Steel_Plant',
      'Coke_Oven',
      'Blast_Furnace',
      'Coal_Mine',
      'Open_Cast_Mine',
      'Thermal_Power_Plant',
      'Cement_Kiln',
      'Landfill',
      'Brick_Kiln',
      'LNG_Terminal',
      'Petrochemical',
      'Fertilizer',
      'Paper_Mill',
      'Other_Industrial'
    ],
    required: true
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  polygon: {
    type: { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: [[[Number]]]
  },
  state: { type: String },
  district: { type: String },
  operator: { type: String },
  criticality: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  detectability: {
    type: String,
    enum: ['High', 'Moderate_High', 'Moderate', 'Low', 'Very_Low', 'Marginal'],
    default: 'Moderate'
  },
  status: { type: String, enum: ['Active', 'Inactive', 'Unknown'], default: 'Active' },
  source: { type: String, default: 'OSM' }, // OSM, GEM, Manual, Govt
  is_sensitive: { type: Boolean, default: false }, // Site masking for OPSEC
  population_5km: { type: Number },
  baseline_frp_mean: { type: Number },
  baseline_frp_std: { type: Number },
  notes: { type: String },
}, {
  timestamps: true,
  collection: 'facilities'
});

facilitySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Facility', facilitySchema);
