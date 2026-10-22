const express  = require("express");
const router   = express.Router();
const AccessRequest = require("../models/AccessRequest");
const User     = require("../models/User");
const authMiddleware = require("../middleware/auth");

// ── DOCTOR: Send access request to a patient by email ─────────────────────────
router.post("/send", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ message: "Only doctors can send access requests." });
    }

    const { patientEmail, requestType, message } = req.body;
    if (!patientEmail) return res.status(400).json({ message: "Patient email is required." });

    const cleanEmail = patientEmail.toLowerCase().trim();

    // Find the patient
    const patient = await User.findOne({ email: cleanEmail, role: "patient" }).select("_id name email");
    if (!patient) return res.status(404).json({ message: "No patient found with that email address." });

    // Find the doctor (sender)
    const doctor = await User.findById(req.user.id).select("name email walletAddress specialization hospitalName");
    if (!doctor || !doctor.walletAddress) {
      return res.status(400).json({ message: "Your wallet address is not set. Please update your profile." });
    }

    // Check for existing pending request
    const existing = await AccessRequest.findOne({
      doctorId: doctor._id,
      patientId: patient._id,
      status: "pending"
    });
    if (existing) {
      return res.status(409).json({ message: "You already have a pending access request to this patient." });
    }

    const newRequest = new AccessRequest({
      doctorId:     doctor._id,
      doctorName:   doctor.name,
      doctorEmail:  doctor.email,
      doctorWallet: doctor.walletAddress,
      doctorSpecialization: doctor.specialization || "",
      doctorHospital:       doctor.hospitalName || "",
      patientId:    patient._id,
      patientName:  patient.name,
      patientEmail: patient.email,
      requestType:  requestType || "view",
      message:      message || "",
    });

    await newRequest.save();
    res.status(201).json({ message: "Access request sent successfully.", request: newRequest });
  } catch (err) {
    res.status(500).json({ message: "Failed to send request.", error: err.message });
  }
});

// ── PATIENT: Get all pending requests for me ───────────────────────────────────
router.get("/my-requests", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can view their access requests." });
    }

    const requests = await AccessRequest.find({ patientId: req.user.id })
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch requests.", error: err.message });
  }
});

// ── PATIENT: Approve a request (just updates DB status — blockchain is handled on frontend) ──
router.patch("/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can approve requests." });
    }

    const request = await AccessRequest.findOne({ _id: req.params.id, patientId: req.user.id });
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `Request is already ${request.status}.` });
    }

    request.status = "approved";
    request.respondedAt = new Date();
    await request.save();

    res.status(200).json({ message: "Access request approved.", request });
  } catch (err) {
    res.status(500).json({ message: "Failed to approve request.", error: err.message });
  }
});

// ── PATIENT: Reject a request ──────────────────────────────────────────────────
router.patch("/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can reject requests." });
    }

    const request = await AccessRequest.findOne({ _id: req.params.id, patientId: req.user.id });
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `Request is already ${request.status}.` });
    }

    request.status = "rejected";
    request.respondedAt = new Date();
    await request.save();

    res.status(200).json({ message: "Access request rejected.", request });
  } catch (err) {
    res.status(500).json({ message: "Failed to reject request.", error: err.message });
  }
});

// ── DOCTOR: Get my sent requests and their status ──────────────────────────────
router.get("/sent", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ message: "Only doctors can view sent requests." });
    }

    const requests = await AccessRequest.find({ doctorId: req.user.id })
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sent requests.", error: err.message });
  }
});

module.exports = router;
