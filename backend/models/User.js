const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['admin', 'supervisor', 'analyst', 'viewer'],
    default: 'analyst'
  },
  avatar: { type: String },
  is_active: { type: Boolean, default: true },
  last_login: { type: Date },
  login_count: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'users'
});

// Hash password before save (Mongoose 9: async middleware receives no next callback)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
