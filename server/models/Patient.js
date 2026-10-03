const mongoose = require('mongoose');

const fingerprintCredentialSchema = new mongoose.Schema({
  credentialId: { type: String },
  publicKey: { type: String },
  counter: { type: Number, default: 0 },
  deviceName: { type: String, default: 'Primary Device' }
}, { _id: false });

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: 'patient' },
  walletAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
  dob: { type: Date, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  mobileNumber: { type: String, required: true },
  alternateMobileNumber: { type: String },
  profilePictureHash: { type: String },
  bloodGroup: { type: String },
  emergencyContact: { type: String },
  // Fingerprint authentication
  fingerprintCredential: { type: fingerprintCredentialSchema, default: null },
  guardianFingerprintCredential: { type: fingerprintCredentialSchema, default: null },
  guardianName: { type: String, default: '' },
  fingerprintChallenge: { type: String, default: null },
  fingerprintChallengeExpiry: { type: Date, default: null },
  // Status
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  otp: { type: String },
  otpExpiry: { type: Date },
}, { timestamps: true, collection: 'patients' });

module.exports = mongoose.model('Patient', patientSchema);
