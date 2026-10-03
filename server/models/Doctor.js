const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'doctor' },
  doctorId: { type: String, unique: true, sparse: true },
  walletAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
  dob: { type: Date, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  mobileNumber: { type: String, required: true },
  hospitalName: { type: String, required: true },
  specialization: { type: String, required: true },
  profilePictureHash: { type: String },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  otp: { type: String },
  otpExpiry: { type: Date },
}, { timestamps: true, collection: 'doctors' });

module.exports = mongoose.model('Doctor', doctorSchema);
