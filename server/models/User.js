const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["patient", "doctor", "hospital"],
    required: true,
  },
  doctorId: {
    type: String,
    unique: true,
    sparse: true,
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true,
  },
  dob: {
    type: Date,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  mobileNumber: {
    type: String,
    required: true,
  },
  alternateMobileNumber: {
    type: String,
  },
  profilePictureHash: {
    type: String,
  },
  hospitalName: {
    type: String, // for doctors: which hospital they belong to
  },
  specialization: {
    type: String, // for doctors: e.g. Cardiologist, General Physician
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  otp: {
    type: String,
  },
  otpExpiry: {
    type: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);