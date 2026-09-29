const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  detection_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Detection' },
  event_id: { type: String },
  facility_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility' },
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String }, // source_category
  severity_score: { type: Number, min: 0, max: 100 },
  tier: {
    type: String,
    enum: ['Priority', 'Standard', 'Info'],
    default: 'Standard'
  },
  status: {
    type: String,
    enum: ['Open', 'Acknowledged', 'Resolved', 'Dismissed'],
    default: 'Open'
  },
  location: {
    lat: Number,
    lng: Number,
    state: String
  },
  frp: Number,
  acknowledged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolved_at: Date,
  notes: String,
}, {
  timestamps: true,
  collection: 'alerts'
});

alertSchema.index({ createdAt: -1 });
alertSchema.index({ status: 1 });
alertSchema.index({ severity_score: -1 });

module.exports = mongoose.model('Alert', alertSchema);
