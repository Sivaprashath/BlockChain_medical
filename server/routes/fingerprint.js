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
        patient = new Patient(user.toObject());
        await patient.save();
      }
    }
  }

  if (patient) {
    let changed = false;
    if (patient.fingerprintCredential?.credentialId && !patient.fingerprintCredential.biometricHash) {
      patient.fingerprintCredential.biometricHash = `FP-BIO-${patient.email.toLowerCase()}`;
      if (!patient.fingerprintCredential.fingerLabel) {
        patient.fingerprintCredential.fingerLabel = "Primary Enrolled Finger";
      }
      changed = true;
    }
    if (patient.guardianFingerprintCredential?.credentialId && !patient.guardianFingerprintCredential.biometricHash) {
      patient.guardianFingerprintCredential.biometricHash = `FP-GUARDIAN-${patient.email.toLowerCase()}`;
      if (!patient.guardianFingerprintCredential.fingerLabel) {
        patient.guardianFingerprintCredential.fingerLabel = "Guardian Enrolled Finger";
      }
      changed = true;
    }
    if (changed) {
      await patient.save();
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

    const hasPatient = Boolean(
      patient.fingerprintCredential?.credentialId || patient.fingerprintCredential?.biometricHash
    );
    const hasGuardian = Boolean(
      patient.guardianFingerprintCredential?.credentialId || patient.guardianFingerprintCredential?.biometricHash
    );

    res.status(200).json({
      hasPatientFingerprint: hasPatient,
      patientDeviceName: patient.fingerprintCredential?.deviceName || "In-App Biometric Scanner",
      patientFingerLabel: patient.fingerprintCredential?.fingerLabel || "Patient Fingerprint",
      patientBiometricHash: patient.fingerprintCredential?.biometricHash || null,
      hasGuardianFingerprint: hasGuardian,
      guardianName: patient.guardianName || "",
      guardianDeviceName: patient.guardianFingerprintCredential?.deviceName || "Guardian Biometric Scanner",
      guardianFingerLabel: patient.guardianFingerprintCredential?.fingerLabel || "Guardian Fingerprint",
      guardianBiometricHash: patient.guardianFingerprintCredential?.biometricHash || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch fingerprint status", error: error.message });
  }
});

// ── REGISTER IN-APP DIGITAL BIOMETRIC (Patient & Guardian) ──────────────────
router.post("/digital/register", authMiddleware, async (req, res) => {
  try {
    const { type, biometricHash, fingerLabel, guardianName } = req.body;
    if (!biometricHash) {
      return res.status(400).json({ message: "Biometric pattern hash is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    let patient = await findPatient(user.email);
    if (!patient) {
      patient = new Patient(user.toObject());
      await patient.save();
    }

    const credentialData = {
      credentialId: "BIO-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      biometricHash,
      fingerLabel: fingerLabel || (type === "guardian" ? "Guardian Finger" : "Patient Finger"),
      deviceName: "In-App Digital Biometric Sensor",
      counter: 1,
    };

    if (type === "guardian") {
      patient.guardianFingerprintCredential = credentialData;
      if (guardianName) patient.guardianName = guardianName;
    } else {
      patient.fingerprintCredential = credentialData;
    }

    await patient.save();

    res.status(200).json({
      verified: true,
      type,
      message: `${type === "guardian" ? (guardianName || "Guardian") : "Patient"} fingerprint registered successfully!`,
      credential: credentialData,
    });
  } catch (error) {
    res.status(500).json({ message: "Digital biometric registration failed", error: error.message });
  }
});

// ── VERIFY IN-APP DIGITAL BIOMETRIC ─────────────────────────────────────────
router.post("/digital/verify", async (req, res) => {
  try {
    const { patientQuery, biometricHash } = req.body;
    if (!patientQuery || !biometricHash) {
      return res.status(400).json({ message: "Patient query and biometric scan are required." });
    }

    const patient = await findPatient(patientQuery);
    if (!patient) return res.status(404).json({ message: "Patient not found." });

    const patientHash = patient.fingerprintCredential?.biometricHash;
    const guardianHash = patient.guardianFingerprintCredential?.biometricHash;

    if (!patientHash && !guardianHash) {
      return res.status(400).json({ message: "No biometric fingerprint registered for this patient yet." });
    }

    let signerType = null;
    let authorizedBy = null;
    let fingerLabel = null;

    if (patientHash && patientHash === biometricHash) {
      signerType = "patient";
      authorizedBy = `${patient.name} (Patient)`;
      fingerLabel = patient.fingerprintCredential?.fingerLabel || "Patient Finger";
    } else if (guardianHash && guardianHash === biometricHash) {
      signerType = "guardian";
      authorizedBy = `${patient.guardianName || "Guardian"} (Guardian / Family)`;
      fingerLabel = patient.guardianFingerprintCredential?.fingerLabel || "Guardian Finger";
    } else {
      return res.status(401).json({
        verified: false,
        message: "❌ Fingerprint Not Recognized! This finger does not match the registered Patient or Guardian fingerprint.",
      });
    }

    res.status(200).json({
      verified: true,
      signerType,
      authorizedBy,
      fingerLabel,
      message: `Biometric Access Authorized by ${authorizedBy}!`,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ message: "Digital biometric verification failed", error: error.message });
  }
});

// ── WEBAUTHN REGISTRATION OPTIONS (Protected - for Patient) ─────────────────
router.post("/register/options", authMiddleware, async (req, res) => {
  try {
    const { type, guardianName } = req.body;
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
        authenticatorAttachment: "platform",
        userVerification: "preferred",
        residentKey: "discouraged",
      },
    });

    patient.fingerprintChallenge = options.challenge;
    patient.fingerprintChallengeExpiry = new Date(Date.now() + 5 * 60 * 1000);
    if (isGuardian && guardianName) {
      patient.guardianName = guardianName;
    }
    await patient.save();

    res.status(200).json(options);
  } catch (error) {
    res.status(500).json({ message: "Failed to generate registration options", error: error.message });
  }
});

// ── WEBAUTHN VERIFY REGISTRATION (Protected - for Patient) ───────────────────
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
      fingerLabel: type === "guardian" ? "Guardian Hardware Touch ID" : "Patient Hardware Touch ID",
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
    const { type } = req.body;
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

    const hasPatient = Boolean(
      patient.fingerprintCredential?.credentialId || patient.fingerprintCredential?.biometricHash
    );
    const hasGuardian = Boolean(
      patient.guardianFingerprintCredential?.credentialId || patient.guardianFingerprintCredential?.biometricHash
    );

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
    if (patient.fingerprintCredential?.credentialId && !patient.fingerprintCredential.credentialId.startsWith("BIO-")) {
      allowCredentials.push({
        id: patient.fingerprintCredential.credentialId,
        transports: ["internal"],
      });
    }
    if (patient.guardianFingerprintCredential?.credentialId && !patient.guardianFingerprintCredential.credentialId.startsWith("BIO-")) {
      allowCredentials.push({
        id: patient.guardianFingerprintCredential.credentialId,
        transports: ["internal"],
      });
    }

    let options = null;
    if (allowCredentials.length > 0) {
      options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials,
        userVerification: "preferred",
      });
      patient.fingerprintChallenge = options.challenge;
      patient.fingerprintChallengeExpiry = new Date(Date.now() + 5 * 60 * 1000);
      await patient.save();
    }

    res.status(200).json({
      hasBiometrics: true,
      options,
      hasDigitalBiometrics: Boolean(
        patient.fingerprintCredential?.biometricHash || patient.guardianFingerprintCredential?.biometricHash
      ),
      patient: {
        name: patient.name,
        email: patient.email,
        walletAddress: patient.walletAddress,
        hasPatientFingerprint: hasPatient,
        patientFingerLabel: patient.fingerprintCredential?.fingerLabel || "Patient Fingerprint",
        patientBiometricHash: patient.fingerprintCredential?.biometricHash || null,
        hasGuardianFingerprint: hasGuardian,
        guardianName: patient.guardianName || "Guardian",
        guardianFingerLabel: patient.guardianFingerprintCredential?.fingerLabel || "Guardian Fingerprint",
        guardianBiometricHash: patient.guardianFingerprintCredential?.biometricHash || null,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate auth options", error: error.message });
  }
});

// ── WEBAUTHN AUTHENTICATION VERIFY ──────────────────────────────────────────
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
router.post("/auth/simulate", async (req, res) => {
  try {
    const { patientQuery, approvedBy } = req.body;
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
