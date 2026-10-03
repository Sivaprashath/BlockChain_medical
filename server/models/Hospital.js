const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'hospital' },
  hospitalRegId: { type: String, unique: true, sparse: true },
  walletAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
  dob: { type: Date },
  city: { type: String, required: true },
  state: { type: String, required: true },
  mobileNumber: { type: String, required: true },
  hospitalName: { type: String },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  otp: { type: String },
  otpExpiry: { type: Date },
}, { timestamps: true, collection: 'hospitals' });

module.exports = mongoose.model('Hospital', hospitalSchema);
