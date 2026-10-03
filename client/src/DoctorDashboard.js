import React, { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  Wallet, Search, FileText, ExternalLink, Inbox,
  Copy, CheckCircle2, X, AlertCircle,
  FlaskConical, Pill, ScanLine, FileQuestion,
  User, Mail, MapPin, Check, Fingerprint,
  HeartHandshake, UploadCloud, ShieldCheck
} from "lucide-react";
import MedicalRecordArtifact from "./MedicalRecord.json";

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const AUTH_API = process.env.REACT_APP_API_URL || "http://localhost:5001/api/auth";
const FINGERPRINT_API = process.env.REACT_APP_API_URL?.replace("/api/auth", "/api/fingerprint") || "http://localhost:5001/api/fingerprint";
const PINATA_JWT = process.env.REACT_APP_PINATA_JWT;

const RECORD_TYPES = [
  { id: "Lab Report",   icon: FlaskConical,  color: "teal"   },
  { id: "Prescription", icon: Pill,          color: "gold"   },
  { id: "Scan",         icon: ScanLine,      color: "purple" },
  { id: "Diagnosis",    icon: FileText,      color: "blue"   },
  { id: "Other",        icon: FileQuestion,  color: "cyan"   },
];

const typeIcons = {
  "Lab Report":   { icon: FlaskConical, color: "teal" },
  "Prescription": { icon: Pill,         color: "gold" },
  "Scan":         { icon: ScanLine,     color: "purple" },
  "Diagnosis":    { icon: FileText,     color: "blue" },
  "Other":        { icon: FileQuestion, color: "cyan" },
};

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success", title) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type, title }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  const remove = id => setToasts(t => t.filter(x => x.id !== id));
  return { toasts, add, remove };
}

function ToastContainer({ toasts, remove }) {
  const icons = { success: <CheckCircle2 size={16} />, error: <AlertCircle size={16} />, warning: <AlertCircle size={16} /> };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-icon">{icons[t.type] || icons.success}</span>
          <div className="toast-body">
            {t.title && <div className="toast-title">{t.title}</div>}
            <div className="toast-msg">{t.msg}</div>
          </div>
          <button className="toast-close" onClick={() => remove(t.id)}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function DoctorDashboard({ user, onWalletConnect, activeTab = "dashboard" }) {
  const { toasts, add: toast, remove: removeToast } = useToasts();

  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);

  // Records Lookup State
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvedPatient, setResolvedPatient] = useState(null);
  const [patientRecords, setPatientRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ patientsViewed: 0, recordsViewed: 0, uploadsDone: 0 });

  // Biometric Verification Modal State
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [bioData, setBioData] = useState(null); // { options, patient }
  const [bioScanning, setBioScanning] = useState(false);
  const [bioVerifiedStamp, setBioVerifiedStamp] = useState(null); // { authorizedBy, timestamp, role }

  // Upload For Patient State
  const [uploadPatientQuery, setUploadPatientQuery] = useState("");
  const [uploadPatientInfo, setUploadPatientInfo] = useState(null);
  const [checkingPermission, setCheckingPermission] = useState(false);
  const [hasUploadPerm, setHasUploadPerm] = useState(null); // true / false / null
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadRecordType, setUploadRecordType] = useState("Lab Report");
  const [uploadDescription, setUploadDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const uploadFileInputRef = useRef();

  // Auto-connect if already authorized
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then(accs => {
        if (accs.length) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          provider.getSigner().then(signer => {
            const c = new ethers.Contract(CONTRACT_ADDRESS, MedicalRecordArtifact.abi, signer);
            setAccount(accs[0]);
            setContract(c);
            onWalletConnect(accs[0]);
          });
        }
      });
      const handleAccountsChanged = (accs) => {
        if (accs.length) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          provider.getSigner().then(signer => {
            const c = new ethers.Contract(CONTRACT_ADDRESS, MedicalRecordArtifact.abi, signer);
            setAccount(accs[0]);
            setContract(c);
            onWalletConnect(accs[0]);
          });
        } else {
          setAccount("");
          setContract(null);
        }
      };
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, [onWalletConnect]);

  const connectWallet = async () => {
    if (!window.ethereum) { toast("MetaMask is not installed.", "error", "Wallet Error"); return; }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer   = await provider.getSigner();
      const c = new ethers.Contract(CONTRACT_ADDRESS, MedicalRecordArtifact.abi, signer);
      setAccount(accounts[0]);
      setContract(c);
      onWalletConnect(accounts[0]);
      toast("Wallet connected successfully.", "success", "Connected");
    } catch (e) { toast(e.message, "error", "Connection Failed"); }
  };

  // ── FETCH RECORDS FLOW WITH FINGERPRINT VERIFICATION ────────────────────────
  const initiateFetchPatientRecords = async () => {
    const rawQuery = searchQuery.trim();
    if (!contract || !rawQuery) {
      toast("Enter a patient's email or wallet address.", "error"); return;
    }

    try {
      setLoading(true);
      let targetAddress = rawQuery;
      let patientInfo = null;

      // 1. Resolve Patient Info
      if (!ethers.isAddress(rawQuery)) {
        try {
          const res = await axios.get(`${AUTH_API}/patient-lookup`, { params: { search: rawQuery } });
          patientInfo = res.data;
          targetAddress = patientInfo.walletAddress;
          setResolvedPatient(patientInfo);
        } catch (err) {
          setResolvedPatient(null);
          setPatientRecords([]);
          toast(err.response?.data?.message || "Patient not found. Check the email.", "error", "Lookup Failed");
          setLoading(false);
          return;
        }
      } else {
        try {
          const res = await axios.get(`${AUTH_API}/patient-lookup`, { params: { search: rawQuery } });
          patientInfo = res.data;
          setResolvedPatient(patientInfo);
        } catch (err) {
          patientInfo = { walletAddress: rawQuery, name: "Direct Wallet Lookup" };
          setResolvedPatient(patientInfo);
        }
      }

      // 2. Check Biometric Registration Status
      try {
        const bioRes = await axios.post(`${FINGERPRINT_API}/auth/options`, {
          patientQuery: targetAddress,
        });

        if (bioRes.data.hasBiometrics) {
          // Patient has registered biometric fingerprints -> Require fingerprint verification!
          setBioData(bioRes.data);
          setBioModalOpen(true);
          setLoading(false);
          return;
        }
      } catch (bioErr) {
        console.warn("Could not check biometric status:", bioErr.message);
      }

      // If no biometrics registered by patient, fetch directly
      await executeFetchRecords(targetAddress);
    } catch (e) {
      setLoading(false);
      toast(e.message, "error");
    }
  };

  const executeFetchRecords = async (targetAddress, authStamp = null) => {
    try {
      setLoading(true);
      toast("Fetching verified records from blockchain…", "warning");
      const records = await contract.getRecords(targetAddress);
      const recordsArray = Array.from(records);
      setPatientRecords(recordsArray);
      setBioVerifiedStamp(authStamp);
      setStats(s => ({ ...s, patientsViewed: s.patientsViewed + 1, recordsViewed: s.recordsViewed + recordsArray.length }));
      toast(`${recordsArray.length} record(s) loaded successfully!`, "success", "Records Retrieved");
    } catch (e) {
      setPatientRecords([]);
      const errMsg = e.reason || e.message;
      if (errMsg.includes("Access denied")) {
        toast("The patient has not granted you access to their medical records on-chain.", "error", "Access Denied");
      } else {
        toast(errMsg, "error", "Fetch Failed");
      }
    } finally {
      setLoading(false);
      setBioModalOpen(false);
    }
  };

  // Perform Touch ID / WebAuthn scan
  const handleScanBiometrics = async () => {
    if (!bioData?.options) return;
    try {
      setBioScanning(true);
      toast("Sensor active! Patient or Guardian should place finger on the sensor…", "warning", "Scanning Touch ID");

      const authResp = await startAuthentication({ optionsJSON: bioData.options });

      const verifyRes = await axios.post(`${FINGERPRINT_API}/auth/verify`, {
        patientQuery: bioData.patient.walletAddress,
        response: authResp,
      });

      toast(`✅ Biometrics Verified: ${verifyRes.data.authorizedBy}`, "success", "Authorization Granted");
      
      const stamp = {
        authorizedBy: verifyRes.data.authorizedBy,
        timestamp: verifyRes.data.timestamp || Date.now(),
        role: verifyRes.data.signerType,
      };

      await executeFetchRecords(bioData.patient.walletAddress, stamp);
    } catch (err) {
      console.error("Biometric scan error:", err);
      toast(err.response?.data?.message || err.message || "Biometric authentication failed", "error", "Verification Failed");
    } finally {
      setBioScanning(false);
    }
  };

  // Fallback Simulation for testing without hardware fingerprint sensor
  const handleSimulateBiometrics = async (approvedBy) => {
    if (!bioData?.patient?.walletAddress) return;
    try {
      setBioScanning(true);
      const res = await axios.post(`${FINGERPRINT_API}/auth/simulate`, {
        patientQuery: bioData.patient.walletAddress,
        approvedBy,
      });

      toast(`✅ Authorized: ${res.data.authorizedBy}`, "success", "Biometric Simulated");
      
      const stamp = {
        authorizedBy: res.data.authorizedBy,
        timestamp: res.data.timestamp || Date.now(),
        role: approvedBy,
      };

      await executeFetchRecords(bioData.patient.walletAddress, stamp);
    } catch (err) {
      toast(err.message, "error", "Simulation Failed");
    } finally {
      setBioScanning(false);
    }
  };

  // ── DOCTOR UPLOAD FOR PATIENT FLOW ──────────────────────────────────────────
  const checkUploadPermission = async () => {
    const rawQuery = uploadPatientQuery.trim();
    if (!contract || !rawQuery) {
      toast("Enter patient email or wallet address.", "error"); return;
    }
    try {
      setCheckingPermission(true);
      setHasUploadPerm(null);
      let targetAddress = rawQuery;
      let pInfo = null;

      if (!ethers.isAddress(rawQuery)) {
        try {
          const res = await axios.get(`${AUTH_API}/patient-lookup`, { params: { search: rawQuery } });
          pInfo = res.data;
          targetAddress = pInfo.walletAddress;
          setUploadPatientInfo(pInfo);
        } catch (err) {
          setUploadPatientInfo(null);
          toast("Patient not found. Check the email address.", "error");
          setCheckingPermission(false);
          return;
        }
      } else {
        try {
          const res = await axios.get(`${AUTH_API}/patient-lookup`, { params: { search: rawQuery } });
          pInfo = res.data;
          setUploadPatientInfo(pInfo);
        } catch {
          pInfo = { walletAddress: rawQuery, name: "Patient (Direct Address)" };
          setUploadPatientInfo(pInfo);
        }
      }

      // Check on-chain upload permission
      const hasPerm = await contract.hasUploadPermission(targetAddress, account);
      setHasUploadPerm(Boolean(hasPerm));

      if (hasPerm) {
        toast(`Upload permission confirmed for ${pInfo?.name || "patient"}!`, "success", "Authorized");
      } else {
        toast(`Upload permission NOT granted by patient. Ask patient to enable it in Doctor Access Control.`, "warning", "Permission Denied");
      }
    } catch (e) {
      toast(e.message, "error", "Check Failed");
    } finally {
      setCheckingPermission(false);
    }
  };

  const handleDoctorUpload = async () => {
    if (!contract || !uploadFile || !uploadPatientInfo?.walletAddress) {
      toast("Please choose a file and confirm patient upload permission.", "error"); return;
    }
    try {
      setIsUploading(true);
      setUploadProgress(20);

      // 1. Pin file to Pinata IPFS
      const formData = new FormData();
      formData.append("file", uploadFile);

      toast("Uploading file to IPFS…", "warning", "IPFS Storage");
      const pinRes = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${PINATA_JWT}` },
          onUploadProgress: p => setUploadProgress(Math.round(20 + (p.loaded / p.total) * 50)),
        }
      );

      const ipfsHash = pinRes.data.IpfsHash;
      setUploadProgress(75);
      toast("Writing record to blockchain for patient… Confirm MetaMask signature", "warning", "Contract Call");

      // 2. Call doctorUploadRecord on the smart contract
      const tx = await contract.doctorUploadRecord(
        uploadPatientInfo.walletAddress,
        ipfsHash,
        uploadRecordType,
        uploadDescription || `Uploaded by Dr. ${user.name}`
      );
      setUploadProgress(90);
      await tx.wait();
      setUploadProgress(100);

      toast(`Medical record uploaded successfully for ${uploadPatientInfo.name}!`, "success", "Upload Complete");
      setStats(s => ({ ...s, uploadsDone: s.uploadsDone + 1 }));
      setUploadFile(null);
      setUploadDescription("");
      setTimeout(() => setUploadProgress(0), 1200);
    } catch (e) {
      console.error("Upload error:", e);
      toast(e.reason || e.message, "error", "Upload Failed");
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadFile(file);
  }, []);
  const onDragOver = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast("Copied!", "success");
  };

  const showDashboard = activeTab === "dashboard";
  const showRecords   = activeTab === "records";
  const showUpload    = activeTab === "upload";

  return (
    <>
      <ToastContainer toasts={toasts} remove={removeToast} />

      {/* ── BIOMETRIC SCANNER MODAL ── */}
      {bioModalOpen && bioData && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="icon-chip"><Fingerprint size={18} /></div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>Patient Biometric Authorization</h3>
              </div>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setBioModalOpen(false)}
                disabled={bioScanning}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: "24px" }}>
              <div className={`biometric-scanner-ring ${bioScanning ? "scanning" : ""}`}>
                <Fingerprint size={42} />
              </div>

              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
                  Biometric Consent Required
                </h4>
                <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                  To access <strong>{bioData.patient.name}</strong>'s medical records, the patient or their registered
                  guardian must authorize via fingerprint scanner.
                </p>
              </div>

              <div style={{ background: "var(--bg-base)", padding: "14px 16px", borderRadius: "var(--radius-sm)", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", marginBottom: 8 }}>
                  Registered Biometric Keys Available
                </div>
                {bioData.patient.hasPatientFingerprint && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-1)" }}>
                      <User size={14} color="var(--teal)" /> Patient Fingerprint
                    </span>
                    <span className="chip chip-teal" style={{ fontSize: 11 }}><Check size={10} /> Ready</span>
                  </div>
                )}
                {bioData.patient.hasGuardianFingerprint && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-1)" }}>
                      <HeartHandshake size={14} color="var(--gold)" /> Guardian ({bioData.patient.guardianName})
                    </span>
                    <span className="chip" style={{ fontSize: 11, background: "rgba(245,158,11,0.15)", color: "#b45309" }}>
                      Emergency Backup
                    </span>
                  </div>
                )}
              </div>

              {/* Main Action: Hardware Touch ID Scan */}
              <button
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", padding: "12px 18px", fontSize: 15, marginBottom: 12 }}
                onClick={handleScanBiometrics}
                disabled={bioScanning}
              >
                <Fingerprint size={18} />
                {bioScanning ? "Awaiting Sensor Scan…" : "Scan Fingerprint (Touch ID)"}
              </button>

              {/* Testing / Simulation Options */}
              <div style={{ borderTop: "1px dashed var(--glass-border)", paddingTop: 14, marginTop: 14 }}>
                <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginBottom: 10 }}>
                  Test Simulation (For testing or devices without physical sensor):
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {bioData.patient.hasPatientFingerprint && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1, fontSize: 12, justifyContent: "center" }}
                      onClick={() => handleSimulateBiometrics("patient")}
                      disabled={bioScanning}
                    >
                      <User size={13} /> Simulate Patient
                    </button>
                  )}
                  {bioData.patient.hasGuardianFingerprint && (
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1, fontSize: 12, justifyContent: "center", borderColor: "var(--gold)", color: "#b45309" }}
                      onClick={() => handleSimulateBiometrics("guardian")}
                      disabled={bioScanning}
                    >
                      <HeartHandshake size={13} /> Simulate Guardian
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DASHBOARD OVERVIEW TAB ── */}
      {showDashboard && (
        <>
          <div className="page-header">
            <h1 className="page-title">Doctor Dashboard</h1>
            <p className="page-subtitle">Welcome Dr. {user.name} • Search records with Biometric Verification & Upload for patients.</p>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon"><User size={18} /></div>
              <div className="stat-value">{stats.patientsViewed}</div>
              <div className="stat-label">Patients Checked</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon gold"><FileText size={18} /></div>
              <div className="stat-value">{stats.recordsViewed}</div>
              <div className="stat-label">Records Retrieved</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}><UploadCloud size={18} /></div>
              <div className="stat-value">{stats.uploadsDone}</div>
              <div className="stat-label">Records Uploaded</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: "rgba(130,80,255,0.15)", color: "#a57dff" }}><Fingerprint size={18} /></div>
              <div className="stat-value" style={{ fontSize: 18, paddingTop: 4 }}>Dual-Biometric</div>
              <div className="stat-label">Patient & Guardian</div>
            </div>
          </div>

          {!account ? (
            <div className="card card-glow">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Connect your MetaMask Wallet</h2>
                  <p className="card-subtitle">Connect your registered doctor account to authenticate on-chain calls.</p>
                </div>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}><Wallet size={16} /> Connect MetaMask</button>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div className="icon-chip"><ShieldCheck size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Doctor Wallet Connected</h2>
                  <p className="card-subtitle">Active on Ganache Local Blockchain</p>
                </div>
                <div className="wallet-status-pill connected">
                  <div className="wallet-dot active" />
                  {shortenAddress(account)}
                </div>
              </div>
            </div>
          )}

          {/* Quick Doctor Info */}
          <div className="card">
            <div className="card-header">
              <div className="icon-chip"><User size={18} /></div>
              <div className="card-header-text">
                <h3 className="card-title">Doctor Credentials</h3>
                <p className="card-subtitle">Verified blockchain physician profile</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", fontWeight: 600 }}>Doctor ID</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginTop: 2 }}>{user.doctorId || "DOC-VERIFIED"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", fontWeight: 600 }}>Specialization</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginTop: 2 }}>{user.specialization || "General Physician"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", fontWeight: 600 }}>Hospital</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-1)", marginTop: 2 }}>{user.hospitalName || "MediChain Affiliated"}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── PATIENT RECORDS LOOKUP TAB ── */}
      {showRecords && (
        <>
          <div className="page-header">
            <h1 className="page-title">Patient Records & Biometric Access</h1>
            <p className="page-subtitle">Search by Patient Email or Wallet Address. Access requires Patient or Guardian biometric scan.</p>
          </div>

          {!account && (
            <div className="card card-glow">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text"><h2 className="card-title">Connect your wallet first</h2></div>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}><Wallet size={16} /> Connect MetaMask</button>
            </div>
          )}

          {account && (
            <div className="card">
              <div className="card-header">
                <div className="icon-chip"><Search size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Look up patient records</h2>
                  <p className="card-subtitle">Enter the patient's registered email or wallet address.</p>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Patient Email or Wallet Address</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Enter email (e.g. patient@medichain.com) or 0x address…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && initiateFetchPatientRecords()}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={initiateFetchPatientRecords} disabled={loading || !searchQuery.trim()} style={{ flexShrink: 0 }}>
                    <Search size={14} /> {loading ? "Authorizing…" : "Authorize & Fetch"}
                  </button>
                </div>
              </div>

              {/* Patient Card Preview if resolved */}
              {resolvedPatient && (
                <div style={{
                  marginTop: 16,
                  padding: "14px 18px",
                  background: "rgba(37, 99, 235, 0.06)",
                  border: "1px solid rgba(37, 99, 235, 0.2)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "var(--blue)", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: "bold", fontSize: 16
                    }}>
                      {resolvedPatient.name ? resolvedPatient.name.charAt(0).toUpperCase() : "P"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-1)" }}>
                        {resolvedPatient.name || "Patient Profile"}
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        {resolvedPatient.email && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Mail size={12} /> {resolvedPatient.email}</span>}
                        {resolvedPatient.city && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {resolvedPatient.city}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", padding: "6px 12px", borderRadius: 20, border: "1px solid var(--glass-border)" }}>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>Wallet:</span>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink-1)" }}>{shortenAddress(resolvedPatient.walletAddress)}</span>
                    <button className="btn btn-ghost btn-icon" style={{ padding: 2 }} onClick={() => copyToClipboard(resolvedPatient.walletAddress)}>
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Biometric Authorization Stamp */}
              {bioVerifiedStamp && (
                <div style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  color: "#065f46"
                }}>
                  <Fingerprint size={18} color="#10b981" />
                  <div>
                    <strong>Biometric Scan Verified:</strong> Authorized by {bioVerifiedStamp.authorizedBy} at{" "}
                    {new Date(bioVerifiedStamp.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}

              <div className="chain-divider">Records ({patientRecords.length})</div>

              {patientRecords.length === 0 ? (
                <div className="empty-state">
                  <Inbox size={32} />
                  <div className="empty-state-title">No records loaded</div>
                  <div className="empty-state-text">Enter a patient's email or wallet address and click Authorize & Fetch. The patient or guardian will scan their fingerprint to approve access.</div>
                </div>
              ) : (
                <ul className="record-list">
                  {[...patientRecords].reverse().map((r, i) => {
                    const typeInfo = typeIcons[r.recordType] || { icon: FileText, color: "teal" };
                    const Icon = typeInfo.icon;
                    const date = new Date(Number(r.timestamp) * 1000).toLocaleString();
                    const link = "https://gateway.pinata.cloud/ipfs/" + r.fileHash;
                    const isDoctorUpload = r.uploadedBy && r.uploadedBy.toLowerCase() === account.toLowerCase();
                    return (
                      <li className="record-item" key={i}>
                        <div className={`record-icon ${typeInfo.color}`}><Icon size={16} /></div>
                        <div className="record-body">
                          <div className="record-hash-row">
                            <span className="record-badge">{r.recordType || "Record"}</span>
                            <span className="record-badge" style={{ background: "var(--teal-dim)", color: "var(--teal)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <Check size={11} /> Verified on-chain
                            </span>
                            {isDoctorUpload && (
                              <span className="record-badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                                Uploaded by You
                              </span>
                            )}
                          </div>
                          {r.description && <div style={{ fontSize: 13, color: "var(--ink-2)", margin: "4px 0 2px", fontWeight: 500 }}>{r.description}</div>}
                          <div className="record-hash-row" style={{ marginTop: 2 }}>
                            <span className="record-hash">{shortenAddress(r.fileHash)}</span>
                            <span className="record-meta">• {date}</span>
                          </div>
                        </div>
                        <div className="record-actions">
                          <a className="btn btn-outline btn-sm" href={link} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} /> View File
                          </a>
                          <button className="btn btn-ghost btn-icon" onClick={() => copyToClipboard(r.fileHash)}>
                            <Copy size={14} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* ── UPLOAD FOR PATIENT TAB ── */}
      {showUpload && (
        <>
          <div className="page-header">
            <h1 className="page-title">Upload Record for Patient</h1>
            <p className="page-subtitle">Upload lab reports, prescriptions, or clinical scans directly to a patient's blockchain record.</p>
          </div>

          {!account && (
            <div className="card card-glow">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text"><h2 className="card-title">Connect your wallet first</h2></div>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}><Wallet size={16} /> Connect MetaMask</button>
            </div>
          )}

          {account && (
            <div className="card">
              <div className="card-header">
                <div className="icon-chip"><UploadCloud size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">1. Verify Patient & Upload Permission</h2>
                  <p className="card-subtitle">Verify that the patient has granted your doctor wallet upload authorization.</p>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Patient Email or Wallet Address</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    type="text"
                    placeholder="Enter patient email or 0x wallet address…"
                    value={uploadPatientQuery}
                    onChange={e => {
                      setUploadPatientQuery(e.target.value);
                      setHasUploadPerm(null);
                    }}
                    onKeyDown={e => e.key === "Enter" && checkUploadPermission()}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={checkUploadPermission} disabled={checkingPermission || !uploadPatientQuery.trim()} style={{ flexShrink: 0 }}>
                    <Search size={14} /> {checkingPermission ? "Checking…" : "Verify Permission"}
                  </button>
                </div>
              </div>

              {/* Permission Status Feedback */}
              {hasUploadPerm !== null && (
                <div style={{
                  marginTop: 14,
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: hasUploadPerm ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${hasUploadPerm ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  color: hasUploadPerm ? "#065f46" : "#991b1b"
                }}>
                  {hasUploadPerm ? <CheckCircle2 size={20} color="#10b981" /> : <AlertCircle size={20} color="#ef4444" />}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {hasUploadPerm
                        ? `Upload Permission Confirmed for ${uploadPatientInfo?.name || "Patient"}`
                        : "Upload Permission Not Granted"}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 2, opacity: 0.9 }}>
                      {hasUploadPerm
                        ? "You are authorized on-chain to add new medical records for this patient."
                        : "The patient has not granted you upload permission. Ask the patient to enable it in their Doctor Access tab."}
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Form - Enabled only when permission is confirmed */}
              {hasUploadPerm && (
                <div style={{ marginTop: 24, borderTop: "1px solid var(--glass-border)", paddingTop: 20 }}>
                  <div className="card-header" style={{ marginBottom: 14 }}>
                    <div className="icon-chip gold"><FileText size={18} /></div>
                    <div className="card-header-text">
                      <h3 className="card-title">2. Select Record File & Details</h3>
                    </div>
                  </div>

                  {/* Record type selector */}
                  <div className="type-selector" style={{ marginBottom: 16 }}>
                    {RECORD_TYPES.map(({ id, icon: Icon, color }) => (
                      <button
                        key={id}
                        className={`type-pill ${uploadRecordType === id ? "selected" : ""}`}
                        onClick={() => setUploadRecordType(id)}
                      >
                        <Icon size={12} /> {id}
                      </button>
                    ))}
                  </div>

                  {/* Drag & drop zone */}
                  <div
                    className={`drop-zone ${dragging ? "dragging" : ""}`}
                    onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                    onClick={() => uploadFileInputRef.current?.click()}
                  >
                    <div className="drop-zone-icon"><UploadCloud size={32} /></div>
                    <div className="drop-zone-text">
                      <strong>Click to browse</strong> or drag & drop patient medical report
                    </div>
                    <div className="drop-zone-hint">PDF, JPG, PNG, DICOM — securely stored on IPFS & Ethereum</div>
                    <input ref={uploadFileInputRef} type="file" onChange={e => setUploadFile(e.target.files[0])} />
                  </div>

                  {uploadFile && (
                    <div className="file-info-chip" style={{ marginTop: 12 }}>
                      <FileText size={16} style={{ color: "var(--teal)", flexShrink: 0 }} />
                      <span className="file-info-chip-name">{uploadFile.name}</span>
                      <span className="file-info-chip-size">{formatFileSize(uploadFile.size)}</span>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setUploadFile(null)}><X size={14} /></button>
                    </div>
                  )}

                  <div className="field" style={{ marginTop: 16 }}>
                    <label className="field-label">Clinical Notes / Record Description</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="e.g. CBC Blood Count & Metabolic Panel prescribed by Dr. "
                      value={uploadDescription}
                      onChange={e => setUploadDescription(e.target.value)}
                    />
                  </div>

                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="progress-bar-wrap" style={{ marginTop: 14 }}>
                      <div className="progress-bar-fill" style={{ width: uploadProgress + "%" }} />
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={handleDoctorUpload}
                    disabled={isUploading || !uploadFile}
                    style={{ marginTop: 18 }}
                  >
                    <UploadCloud size={16} />
                    {isUploading ? `Uploading for Patient… ${uploadProgress}%` : `Upload to Patient's Record`}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default DoctorDashboard;
