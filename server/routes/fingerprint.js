const express = require("express");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const Patient = require("../models/Patient");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const RP_NAME = "MediChain Medical Blockchain";
const RP_ID = "localhost";
const ORIGIN = ["http://localhost:3000", "http://127.0.0.1:3000"];

// Helper to find patient by email or wallet address or id
async function findPatient(query) {
  if (!query) return null;
  const clean = query.trim().toLowerCase();
  let patient = await Patient.findOne({
    $or: [{ email: clean }, { walletAddress: clean }],
  });
  if (!patient) {
    const user = await User.findOne({
      role: "patient",
      $or: [{ email: clean }, { walletAddress: clean }],
    });
    if (user) {
      patient = await Patient.findOne({ email: user.email });
      if (!patient) {
        // create matching patient doc if missing
        patient = new Patient(user.toObject());
        await patient.save();
      }
    }
  }
  return patient;
}

// ── GET FINGERPRINT STATUS (Protected - for Patient) ────────────────────────
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const patient = await findPatient(user.email);
    if (!patient) {
      return res.status(200).json({
        hasPatientFingerprint: false,
        hasGuardianFingerprint: false,
        guardianName: "",
      });
    }

    res.status(200).json({
      hasPatientFingerprint: Boolean(patient.fingerprintCredential?.credentialId),
      patientDeviceName: patient.fingerprintCredential?.deviceName || "Primary Sensor",
      hasGuardianFingerprint: Boolean(patient.guardianFingerprintCredential?.credentialId),
      guardianName: patient.guardianName || "",
      guardianDeviceName: patient.guardianFingerprintCredential?.deviceName || "Guardian Sensor",
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch fingerprint status", error: error.message });
  }
});

// ── REGISTRATION OPTIONS (Protected - for Patient) ──────────────────────────
router.post("/register/options", authMiddleware, async (req, res) => {
  try {
    const { type, guardianName, deviceName } = req.body; // type: 'patient' | 'guardian'
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let patient = await findPatient(user.email);
    if (!patient) {
      patient = new Patient(user.toObject());
      await patient.save();
    }

    const isGuardian = type === "guardian";
    const displayName = isGuardian
      ? `${guardianName || "Guardian"} (Guardian of ${user.name})`
      : user.name;

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new Uint8Array(Buffer.from(user._id.toString() + (isGuardian ? "-guardian" : "-patient"))),
      userName: isGuardian ? `${user.email}-guardian` : user.email,
      userDisplayName: displayName,
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform", // touch ID / built-in sensor
        userVerification: "preferred",
        residentKey: "discouraged",
      },
    });

    patient.fingerprintChallenge = options.challenge;
    patient.fingerprintChallengeExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
    if (isGuardian && guardianName) {
      patient.guardianName = guardianName;
    }
    await patient.save();

    res.status(200).json(options);
  } catch (error) {
    res.status(500).json({ message: "Failed to generate registration options", error: error.message });
  }
});

// ── VERIFY REGISTRATION (Protected - for Patient) ────────────────────────────
router.post("/register/verify", authMiddleware, async (req, res) => {
  try {
    const { type, response, guardianName, deviceName } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let patient = await findPatient(user.email);
    if (!patient || !patient.fingerprintChallenge) {
      return res.status(400).json({ message: "Registration session expired. Please try again." });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: patient.fingerprintChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ message: "Biometric registration verification failed." });
    }

    const { credential } = verification.registrationInfo;
    const credentialData = {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      deviceName: deviceName || (type === "guardian" ? "Guardian Touch ID" : "Patient Touch ID"),
    };

    if (type === "guardian") {
      patient.guardianFingerprintCredential = credentialData;
      if (guardianName) patient.guardianName = guardianName;
    } else {
      patient.fingerprintCredential = credentialData;
    }

    patient.fingerprintChallenge = null;
    patient.fingerprintChallengeExpiry = null;
    await patient.save();

    res.status(200).json({
      verified: true,
      type,
      message: `${type === "guardian" ? "Guardian" : "Patient"} fingerprint registered successfully!`,
    });
  } catch (error) {
    res.status(500).json({ message: "Fingerprint verification failed", error: error.message });
  }
});

// ── REMOVE FINGERPRINT ───────────────────────────────────────────────────────
router.post("/remove", authMiddleware, async (req, res) => {
  try {
    const { type } = req.body; // 'patient' | 'guardian'
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const patient = await findPatient(user.email);
    if (!patient) return res.status(404).json({ message: "Patient record not found" });

    if (type === "guardian") {
      patient.guardianFingerprintCredential = null;
      patient.guardianName = "";
    } else {
      patient.fingerprintCredential = null;
    }
    await patient.save();

    res.status(200).json({ message: `${type === "guardian" ? "Guardian" : "Patient"} fingerprint removed.` });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove fingerprint", error: error.message });
  }
});

// ── DOCTOR ACCESS: AUTHENTICATION OPTIONS ────────────────────────────────────
router.post("/auth/options", async (req, res) => {
  try {
    const { patientQuery } = req.body;
    if (!patientQuery) return res.status(400).json({ message: "Patient email or wallet address is required." });

    const patient = await findPatient(patientQuery);
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const hasPatient = Boolean(patient.fingerprintCredential?.credentialId);
    const hasGuardian = Boolean(patient.guardianFingerprintCredential?.credentialId);

    if (!hasPatient && !hasGuardian) {
      return res.status(200).json({
        hasBiometrics: false,
        patient: {
          name: patient.name,
          email: patient.email,
          walletAddress: patient.walletAddress,
          hasPatientFingerprint: false,
          hasGuardianFingerprint: false,
        },
        message: "No fingerprints registered for this patient.",
      });
    }

    const allowCredentials = [];
    if (hasPatient) {
      allowCredentials.push({
        id: patient.fingerprintCredential.credentialId,
        transports: ["internal"],
      });
    }
    if (hasGuardian) {
      allowCredentials.push({
        id: patient.guardianFingerprintCredential.credentialId,
        transports: ["internal"],
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: "preferred",
    });

    patient.fingerprintChallenge = options.challenge;
    patient.fingerprintChallengeExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await patient.save();

    res.status(200).json({
      hasBiometrics: true,
      options,
      patient: {
        name: patient.name,
        email: patient.email,
        walletAddress: patient.walletAddress,
        hasPatientFingerprint: hasPatient,
        hasGuardianFingerprint: hasGuardian,
        guardianName: patient.guardianName || "Guardian",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate auth options", error: error.message });
  }
});

// ── DOCTOR ACCESS: AUTHENTICATION VERIFY ─────────────────────────────────────
router.post("/auth/verify", async (req, res) => {
  try {
    const { patientQuery, response } = req.body;
    if (!patientQuery || !response) {
      return res.status(400).json({ message: "Patient query and biometric response are required." });
    }

    const patient = await findPatient(patientQuery);
    if (!patient || !patient.fingerprintChallenge) {
      return res.status(400).json({ message: "Biometric session expired or invalid." });
    }

    // Determine if response is from patient or guardian
    const credId = response.id;
    let matchedCred = null;
    let signerType = "patient";
    let authorizedBy = patient.name;

    if (patient.fingerprintCredential && patient.fingerprintCredential.credentialId === credId) {
      matchedCred = patient.fingerprintCredential;
      signerType = "patient";
      authorizedBy = `${patient.name} (Patient)`;
    } else if (patient.guardianFingerprintCredential && patient.guardianFingerprintCredential.credentialId === credId) {
      matchedCred = patient.guardianFingerprintCredential;
      signerType = "guardian";
      authorizedBy = `${patient.guardianName || "Guardian"} (Guardian / Family)`;
    } else {
      return res.status(400).json({ message: "Unknown biometric credential. Neither patient nor guardian matched." });
    }

    const publicKeyBytes = new Uint8Array(Buffer.from(matchedCred.publicKey, "base64"));

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: patient.fingerprintChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: matchedCred.credentialId,
        publicKey: publicKeyBytes,
        counter: matchedCred.counter || 0,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return res.status(400).json({ message: "Biometric verification failed." });
    }

    // Update counter
    matchedCred.counter = verification.authenticationInfo.newCounter;
    patient.fingerprintChallenge = null;
    patient.fingerprintChallengeExpiry = null;
    await patient.save();

    res.status(200).json({
      verified: true,
      signerType,
      authorizedBy,
      message: `Access successfully authorized by ${authorizedBy}!`,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ message: "Biometric authentication failed", error: error.message });
  }
});

// ── SIMULATION / TEST FALLBACK VERIFICATION ─────────────────────────────────
// Useful when testing on devices without physical Touch ID / WebAuthn sensor
router.post("/auth/simulate", async (req, res) => {
  try {
    const { patientQuery, approvedBy } = req.body; // approvedBy: 'patient' | 'guardian'
    const patient = await findPatient(patientQuery);
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const signerType = approvedBy === "guardian" ? "guardian" : "patient";
    const authorizedBy = signerType === "guardian"
      ? `${patient.guardianName || "Guardian"} (Guardian / Family Authorized)`
      : `${patient.name} (Patient Biometric Authorized)`;

    res.status(200).json({
      verified: true,
      signerType,
      authorizedBy,
      message: `Access authorized via ${authorizedBy}!`,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ message: "Simulation failed", error: error.message });
  }
});

module.exports = router;
