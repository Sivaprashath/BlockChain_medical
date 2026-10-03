const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const Hospital = require("../models/Hospital");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// ── Transporter configuration ────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

const sendOTPEmail = async (email, otp) => {
  console.log(`📧 [OTP GENERATED] To: ${email} | OTP: ${otp}`);
  const mailOptions = {
    from: `"MediChain Security" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "MediChain — Account Verification OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2563eb; text-align: center;">MediChain Verification</h2>
        <p>Dear User,</p>
        <p>Thank you for registering with MediChain. Use the following One-Time Password (OTP) to verify your account:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e293b; background: #f1f5f9; padding: 10px 24px; border-radius: 6px; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This OTP is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
      </div>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("❌ Email send error (logged OTP in console):", err.message);
  }
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateDoctorId = () => "DOC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
const isValidMobile = (n) => /^\d{10}$/.test(n);

// ── REGISTER ──────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const {
      name, email, password, role, walletAddress,
      dob, city, state, mobileNumber, alternateMobileNumber,
      profilePictureHash, hospitalName, specialization, hospitalRegId
    } = req.body;

    if (!name || !email || !password || !role || !walletAddress || !city || !state || !mobileNumber) {
      return res.status(400).json({ message: "Please fill all required fields." });
    }

    if (!["patient", "doctor", "hospital"].includes(role)) {
      return res.status(400).json({ message: "Invalid role selected." });
    }

    if (role === "doctor" && (!hospitalName || !specialization)) {
      return res.status(400).json({ message: "Hospital name and specialization are required for doctors." });
    }

    if (role === "patient" && !dob) {
      return res.status(400).json({ message: "Date of birth is required for patients." });
    }

    if (!isValidMobile(mobileNumber)) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanWallet = walletAddress.toLowerCase().trim();

    // Check unique email & wallet across users
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    const existingWallet = await User.findOne({ walletAddress: cleanWallet });
    if (existingWallet) {
      return res.status(400).json({ message: "This wallet address is already linked to another account." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    let doctorId = undefined;
    if (role === "doctor") {
      doctorId = generateDoctorId();
    }

    const userData = {
      name, email: cleanEmail, password: hashedPassword, role, walletAddress: cleanWallet,
      dob: dob || new Date("2000-01-01"), city, state, mobileNumber, alternateMobileNumber,
      profilePictureHash, hospitalName, specialization,
      doctorId, hospitalRegId, isVerified: false, otp, otpExpiry,
    };

    const newUser = new User(userData);
    await newUser.save();

    // Also save to dedicated role collection
    if (role === "patient") {
      const p = new Patient(userData);
      await p.save();
    } else if (role === "doctor") {
      const d = new Doctor(userData);
      await d.save();
    } else if (role === "hospital") {
      const h = new Hospital(userData);
      await h.save();
    }

    await sendOTPEmail(cleanEmail, otp);

    res.status(201).json({ message: "Registered. Please check your email (or terminal log) for the OTP." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// ── VERIFY OTP ────────────────────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const cleanEmail = email ? email.toLowerCase().trim() : "";
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: "User not found." });
    if (user.isVerified) return res.status(400).json({ message: "This account is already verified." });
    if (user.otp !== otp) return res.status(400).json({ message: "Incorrect OTP." });
    if (user.otpExpiry < new Date()) return res.status(400).json({ message: "OTP has expired. Please register again." });

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Update in role collection too
    if (user.role === "patient") await Patient.updateOne({ email: cleanEmail }, { $set: { isVerified: true, otp: undefined, otpExpiry: undefined } });
    if (user.role === "doctor") await Doctor.updateOne({ email: cleanEmail }, { $set: { isVerified: true, otp: undefined, otpExpiry: undefined } });
    if (user.role === "hospital") await Hospital.updateOne({ email: cleanEmail }, { $set: { isVerified: true, otp: undefined, otpExpiry: undefined } });

    res.status(200).json({ message: "Account verified successfully! You can now log in." });
  } catch (error) {
    res.status(500).json({ message: "Verification failed", error: error.message });
  }
});

// ── RESEND OTP ────────────────────────────────────────────────────────────────
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = email ? email.toLowerCase().trim() : "";
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: "User not found." });
    if (user.isVerified) return res.status(400).json({ message: "This account is already verified." });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    if (user.role === "patient") await Patient.updateOne({ email: cleanEmail }, { $set: { otp, otpExpiry: user.otpExpiry } });
    if (user.role === "doctor") await Doctor.updateOne({ email: cleanEmail }, { $set: { otp, otpExpiry: user.otpExpiry } });
    if (user.role === "hospital") await Hospital.updateOne({ email: cleanEmail }, { $set: { otp, otpExpiry: user.otpExpiry } });

    await sendOTPEmail(cleanEmail, otp);

    res.status(200).json({ message: "A new OTP has been sent to your email." });
  } catch (error) {
    res.status(500).json({ message: "Failed to resend OTP", error: error.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email ? email.toLowerCase().trim() : "";
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: "Invalid email or password." });
    if (!user.isVerified) return res.status(403).json({ message: "Please verify your email before logging in." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password." });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        dob: user.dob,
        city: user.city,
        state: user.state,
        mobileNumber: user.mobileNumber,
        alternateMobileNumber: user.alternateMobileNumber,
        profilePictureHash: user.profilePictureHash,
        hospitalName: user.hospitalName,
        specialization: user.specialization,
        doctorId: user.doctorId,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

// ── GET CURRENT USER (protected) ──────────────────────────────────────────────
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -otpExpiry");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user", error: error.message });
  }
});

// ── PATIENT LOOKUP (by Email or Name or Wallet) ────────────────────────────────
router.get("/patient-lookup", async (req, res) => {
  try {
    const query = (req.query.search || req.query.email || "").trim().toLowerCase();
    if (!query) {
      return res.status(400).json({ message: "Search parameter is required." });
    }

    let patient = await Patient.findOne({
      $or: [
        { email: query },
        { walletAddress: query },
        { name: { $regex: query, $options: "i" } }
      ]
    }).select("name email walletAddress city state dob mobileNumber");

    if (!patient) {
      patient = await User.findOne({
        role: "patient",
        $or: [
          { email: query },
          { walletAddress: query },
          { name: { $regex: query, $options: "i" } }
        ]
      }).select("name email walletAddress city state dob mobileNumber");
    }

    if (!patient) {
      return res.status(404).json({ message: "Patient not found. Check the email address." });
    }

    res.status(200).json({
      name: patient.name,
      email: patient.email,
      walletAddress: patient.walletAddress,
      city: patient.city,
      state: patient.state,
      dob: patient.dob,
    });
  } catch (error) {
    res.status(500).json({ message: "Error looking up patient", error: error.message });
  }
});

// ── UPDATE PROFILE (protected) ────────────────────────────────────────────────
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, city, state, mobileNumber, alternateMobileNumber, hospitalName, specialization, profilePictureHash } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    if (name) user.name = name;
    if (city) user.city = city;
    if (state) user.state = state;
    if (mobileNumber && isValidMobile(mobileNumber)) user.mobileNumber = mobileNumber;
    if (alternateMobileNumber !== undefined) user.alternateMobileNumber = alternateMobileNumber;
    if (hospitalName !== undefined) user.hospitalName = hospitalName;
    if (specialization !== undefined) user.specialization = specialization;
    if (profilePictureHash !== undefined) user.profilePictureHash = profilePictureHash;

    await user.save();

    if (user.role === "patient") await Patient.updateOne({ email: user.email }, { $set: { name, city, state, mobileNumber, alternateMobileNumber, profilePictureHash } });
    if (user.role === "doctor") await Doctor.updateOne({ email: user.email }, { $set: { name, city, state, mobileNumber, alternateMobileNumber, hospitalName, specialization, profilePictureHash } });
    if (user.role === "hospital") await Hospital.updateOne({ email: user.email }, { $set: { name, city, state, mobileNumber, profilePictureHash } });

    const updated = user.toObject();
    delete updated.password;
    delete updated.otp;
    delete updated.otpExpiry;
    res.status(200).json({ message: "Profile updated successfully.", user: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
});

// ── SEARCH DOCTORS ────────────────────────────────────────────────────────────
router.get("/doctors", async (req, res) => {
  try {
    const searchQuery = req.query.search || "";
    const doctors = await Doctor.find({
      isVerified: true,
      $or: [
        { name: { $regex: searchQuery, $options: "i" } },
        { doctorId: { $regex: searchQuery, $options: "i" } },
        { specialization: { $regex: searchQuery, $options: "i" } },
        { hospitalName: { $regex: searchQuery, $options: "i" } },
      ]
    }).select("name doctorId hospitalName specialization walletAddress profilePictureHash email");
    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch doctors", error: error.message });
  }
});

// ── GET HOSPITAL DOCTORS (protected, hospital role) ───────────────────────────
router.get("/hospital/doctors", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Access denied. Hospital role required." });
    }
    const me = await User.findById(req.user.id).select("hospitalName");
    const doctors = await Doctor.find({
      isVerified: true,
      hospitalName: { $regex: me.hospitalName, $options: "i" },
    }).select("name doctorId hospitalName specialization walletAddress profilePictureHash createdAt lastLogin email");
    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch hospital doctors", error: error.message });
  }
});

module.exports = router;
