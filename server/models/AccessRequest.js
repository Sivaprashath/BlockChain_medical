const mongoose = require('mongoose');

const accessRequestSchema = new mongoose.Schema({
  // Doctor who sent the request
  doctorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  doctorName:   { type: String, required: true },
  doctorEmail:  { type: String, required: true, lowercase: true, trim: true },
  doctorWallet: { type: String, required: true, lowercase: true, trim: true },
  doctorSpecialization: { type: String, default: '' },
  doctorHospital:       { type: String, default: '' },

  // Patient who receives the request
  patientId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientName:  { type: String, required: true },
  patientEmail: { type: String, required: true, lowercase: true, trim: true },

  // What the doctor is requesting
  requestType: {
    type: String,
    enum: ['view', 'upload', 'both'],
    default: 'view'
  },

  // Request message / reason
  message: { type: String, default: '' },

  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  respondedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'accessrequests' });

module.exports = mongoose.model('AccessRequest', accessRequestSchema);
