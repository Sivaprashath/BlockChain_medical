import React, { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  Wallet, Search, FileText, ExternalLink, Inbox,
  Copy, CheckCircle2, X, AlertCircle,
  FlaskConical, Pill, ScanLine, FileQuestion,
  User, Mail, MapPin, Check, Fingerprint,
  HeartHandshake, UploadCloud, ShieldCheck, Send, RefreshCw
} from "lucide-react";
import MedicalRecordArtifact from "./MedicalRecord.json";
import { encryptMedicalFile } from "./utils/cryptoUtils";
import RecordViewerModal from "./RecordViewerModal";

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const AUTH_API = process.env.REACT_APP_API_URL || "http://localhost:5001/api/auth";
const ACCESS_REQ_API = process.env.REACT_APP_API_URL?.replace("/api/auth", "/api/access-requests") || "http://localhost:5001/api/access-requests";
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
  const [selectedRecordForViewer, setSelectedRecordForViewer] = useState(null);
  const uploadFileInputRef = useRef();

  // Access Request State
  const [reqPatientEmail, setReqPatientEmail] = useState("");
  const [reqType, setReqType] = useState("view");
  const [reqMessage, setReqMessage] = useState("");
  const [reqSending, setReqSending] = useState(false);
  const [sentRequests, setSentRequests] = useState([]);
  const [sentRequestsLoading, setSentRequestsLoading] = useState(false);

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
      const doctorWallet = user?.walletAddress || account;
      const hasPerm = await contract.hasUploadPermission(targetAddress, doctorWallet);
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
    if (user?.walletAddress && account && account.toLowerCase() !== user.walletAddress.toLowerCase()) {
      toast("Please switch MetaMask to your Doctor Account (" + shortenAddress(user.walletAddress) + ") to sign the transaction.", "error", "MetaMask Account Mismatch");
      return;
    }
    try {
      setIsUploading(true);
      setUploadProgress(20);

      // 1. Client-side AES-256 Encryption & SHA-256 Fingerprint: H = SHA256(Fenc)
      toast("Encrypting medical file with AES-256-GCM before upload…", "info", "Security Layer");
      const encResult = await encryptMedicalFile(uploadFile, uploadPatientInfo.walletAddress);
      const encryptedFile = encResult.encryptedFile;
      const fileHash = encResult.fileHash;

      setUploadProgress(35);
      toast("Uploading encrypted payload (Fenc) to IPFS…", "warning", "Off-Chain IPFS");

      // 2. Upload Encrypted File to Pinata IPFS
      const formData = new FormData();
      formData.append("file", encryptedFile);
      const pinRes = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${PINATA_JWT}` },
          onUploadProgress: p => setUploadProgress(Math.round(35 + (p.loaded / p.total) * 40)),
        }
      );

      const ipfsCID = pinRes.data.IpfsHash;
      setUploadProgress(75);
      toast("Writing CID & SHA-256 hash to blockchain… Confirm MetaMask signature", "warning", "Contract Call");

      // 3. Call doctorUploadRecord on smart contract with CID & SHA-256
      const tx = await contract.doctorUploadRecord(
        uploadPatientInfo.walletAddress,
        ipfsCID,
        fileHash,
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

  // Fetch sent requests
  const fetchSentRequests = useCallback(async () => {
    setSentRequestsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${ACCESS_REQ_API}/sent`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSentRequests(res.data);
    } catch (e) {
      console.error("Failed to fetch sent requests", e);
    } finally {
      setSentRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "request") fetchSentRequests();
  }, [activeTab, fetchSentRequests]);

  // Send access request to patient
  const sendAccessRequest = async () => {
    if (!reqPatientEmail.trim()) { toast("Enter the patient's email address.", "error"); return; }
    setReqSending(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${ACCESS_REQ_API}/send`,
        { patientEmail: reqPatientEmail.trim(), requestType: reqType, message: reqMessage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast("Access request sent to patient!", "success", "Request Sent");
      setReqPatientEmail("");
      setReqMessage("");
      fetchSentRequests();
    } catch (e) {
      toast(e?.response?.data?.message || "Failed to send request.", "error");
    } finally {
      setReqSending(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast("Copied!", "success");
  };

  const showDashboard = activeTab === "dashboard";
  const showRecords   = activeTab === "records";
  const showUpload    = activeTab === "upload";
  const showRequest   = activeTab === "request";

  return (
    <>
      <ToastContainer toasts={toasts} remove={removeToast} />

      {/* MetaMask Account Mismatch Warning */}
      {account && user?.walletAddress && account.toLowerCase() !== user.walletAddress.toLowerCase() && (
        <div style={{
          margin: "0 0 20px 0",
          padding: "12px 18px",
          borderRadius: "var(--radius-md)",
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          color: "#b45309",
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 13
        }}>
          <AlertCircle size={20} color="#b45309" style={{ flexShrink: 0 }} />
          <div>
            <strong>MetaMask Account Mismatch:</strong> You are logged in as Doctor <strong>Dr. {user.name}</strong> (<code>{shortenAddress(user.walletAddress)}</code>), but MetaMask is currently active on Account <code>{shortenAddress(account)}</code> (Patient).
            <div style={{ marginTop: 2 }}>Please open MetaMask and switch to your Doctor account <code>{shortenAddress(user.walletAddress)}</code>.</div>
          </div>
        </div>
      )}

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

            <div style={{ padding: "20px 24px" }}>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
                  Biometric Consent Required
                </h4>
                <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                  To access <strong>{bioData.patient.name}</strong>'s medical records, the patient or their registered
                  guardian must place their enrolled finger on the sensor below.
                </p>
              </div>

              
              <div className={`biometric-scanner-ring ${bioScanning ? "scanning" : ""}`}>
                <Fingerprint size={42} />
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
                          <button className="btn btn-primary btn-sm" onClick={() => setSelectedRecordForViewer(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <ShieldCheck size={14} /> Verify & Decrypt
                          </button>
                          <a className="btn btn-ghost btn-icon" href={"https://gateway.pinata.cloud/ipfs/" + (r.ipfsCID || r[0] || r.fileHash)} target="_blank" rel="noreferrer" title="View Encrypted IPFS Payload">
                            <ExternalLink size={13} />
                          </a>
                          <button className="btn btn-ghost btn-icon" onClick={() => copyToClipboard(r.fileHash || r[1] || r.ipfsCID)} title="Copy hash">
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

              {/* Notice to switch MetaMask if still on Patient Account */}
              {hasUploadPerm && account && user?.walletAddress && account.toLowerCase() !== user.walletAddress.toLowerCase() && (
                <div style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#b45309",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 10
                }}>
                  <AlertCircle size={18} color="#b45309" style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Action Required:</strong> In MetaMask, switch to your Doctor account (<code>{shortenAddress(user.walletAddress)}</code>) to sign and submit the upload transaction.
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
      {/* ── Request Access Tab ── */}
      {showRequest && (
        <div className="page-section">
          {/* ── Hero Header ── */}
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "var(--radius-xl, 16px)",
            padding: "28px 32px",
            marginBottom: 28,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
              flexShrink: 0,
            }}>
              <Send size={24} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
                Request Patient Access
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                Send an access request to a patient by their email. They will review and grant or reject it from their dashboard.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 24 }}>

            {/* ── Left: Send Request Form ── */}
            <div style={{
              background: "var(--bg-card, var(--bg-secondary))",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xl, 16px)",
              overflow: "hidden",
            }}>
              {/* Card Header */}
              <div style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "rgba(99,102,241,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(99,102,241,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Mail size={15} color="#6366f1" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>New Access Request</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>Fill in the details below</div>
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div style={{ padding: "22px 24px 24px" }}>

                {/* Email Field */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{
                    display: "block", fontSize: 12, fontWeight: 600,
                    color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}>
                    Patient Email Address <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                      color: "var(--text-muted)", display: "flex", alignItems: "center",
                    }}>
                      <Mail size={15} />
                    </div>
                    <input
                      type="email"
                      placeholder="patient@example.com"
                      value={reqPatientEmail}
                      onChange={e => setReqPatientEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendAccessRequest()}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "11px 14px 11px 38px",
                        background: "var(--bg-tertiary, rgba(255,255,255,0.05))",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md, 10px)",
                        color: "var(--text-primary)",
                        fontSize: 14,
                        outline: "none",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={e => e.target.style.borderColor = "#6366f1"}
                      onBlur={e => e.target.style.borderColor = "var(--border-subtle)"}
                    />
                  </div>
                </div>

                {/* Access Type - Card Selector */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{
                    display: "block", fontSize: 12, fontWeight: 600,
                    color: "var(--text-secondary)", marginBottom: 8, letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}>
                    Access Type
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { value: "view",   label: "View Only",      icon: "👁️",  desc: "Read records" },
                      { value: "upload", label: "Upload Only",    icon: "📤",  desc: "Add records" },
                      { value: "both",   label: "Full Access",    icon: "✅",  desc: "View & upload" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setReqType(opt.value)}
                        style={{
                          padding: "12px 8px",
                          borderRadius: "var(--radius-md, 10px)",
                          border: reqType === opt.value ? "2px solid #6366f1" : "1px solid var(--border-subtle)",
                          background: reqType === opt.value ? "rgba(99,102,241,0.12)" : "var(--bg-tertiary)",
                          cursor: "pointer",
                          textAlign: "center",
                          transition: "all 0.15s",
                          transform: reqType === opt.value ? "scale(1.02)" : "scale(1)",
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: reqType === opt.value ? "#6366f1" : "var(--text-primary)" }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div style={{ marginBottom: 22 }}>
                  <label style={{
                    display: "block", fontSize: 12, fontWeight: 600,
                    color: "var(--text-secondary)", marginBottom: 7, letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}>
                    Message <span style={{ fontWeight: 400, color: "var(--text-muted)", textTransform: "none" }}>(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. I need to review your recent lab results for your upcoming appointment..."
                    value={reqMessage}
                    onChange={e => setReqMessage(e.target.value)}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "11px 14px",
                      background: "var(--bg-tertiary, rgba(255,255,255,0.05))",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md, 10px)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none",
                      resize: "vertical",
                      lineHeight: 1.5,
                      fontFamily: "inherit",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={e => e.target.style.borderColor = "#6366f1"}
                    onBlur={e => e.target.style.borderColor = "var(--border-subtle)"}
                  />
                </div>

                {/* Send Button */}
                <button
                  onClick={sendAccessRequest}
                  disabled={reqSending || !reqPatientEmail.trim()}
                  style={{
                    width: "100%",
                    padding: "13px",
                    borderRadius: "var(--radius-md, 10px)",
                    border: "none",
                    background: reqSending || !reqPatientEmail.trim()
                      ? "rgba(99,102,241,0.3)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: reqSending || !reqPatientEmail.trim() ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: reqSending || !reqPatientEmail.trim() ? "none" : "0 4px 16px rgba(99,102,241,0.4)",
                    transition: "all 0.2s",
                    letterSpacing: "0.02em",
                  }}
                >
                  {reqSending ? (
                    <><span className="spinner" style={{ width: 15, height: 15, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />Sending Request...</>
                  ) : (
                    <><Send size={15} />Send Access Request</>
                  )}
                </button>
              </div>
            </div>

            {/* ── Right: Sent Requests List ── */}
            <div style={{
              background: "var(--bg-card, var(--bg-secondary))",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xl, 16px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}>
              {/* Header */}
              <div style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid var(--border-subtle)",
                background: "rgba(99,102,241,0.05)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(99,102,241,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <RefreshCw size={15} color="#6366f1" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>My Sent Requests</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                      {sentRequests.length} total · {sentRequests.filter(r => r.status === "pending").length} pending
                    </div>
                  </div>
                </div>
                <button
                  onClick={fetchSentRequests}
                  disabled={sentRequestsLoading}
                  style={{
                    padding: "6px 12px", borderRadius: 8,
                    border: "1px solid var(--border-subtle)",
                    background: "transparent", color: "var(--text-secondary)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                    opacity: sentRequestsLoading ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={12} style={{ animation: sentRequestsLoading ? "spin 1s linear infinite" : "none" }} />
                  Refresh
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, padding: "16px 20px 20px", overflowY: "auto", maxHeight: 460 }}>
                {sentRequestsLoading ? (
                  <div style={{ textAlign: "center", padding: "50px 0", color: "var(--text-muted)" }}>
                    <span className="spinner" style={{ width: 24, height: 24, margin: "0 auto 12px", display: "block" }} />
                    <div style={{ fontSize: 13 }}>Loading requests...</div>
                  </div>
                ) : sentRequests.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "50px 20px" }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: "rgba(99,102,241,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 14px",
                    }}>
                      <Send size={22} color="rgba(99,102,241,0.5)" />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>No requests sent yet</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      Send your first request using the form on the left.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {sentRequests.map(req => {
                      const statusColor = req.status === "approved" ? "#22c55e" : req.status === "rejected" ? "#ef4444" : "#f59e0b";
                      const statusBg   = req.status === "approved" ? "rgba(34,197,94,0.1)" : req.status === "rejected" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)";
                      const typeLabel  = req.requestType === "both" ? "View & Upload" : req.requestType === "view" ? "View Only" : "Upload Only";
                      return (
                        <div key={req._id} style={{
                          padding: "14px 16px",
                          borderRadius: 12,
                          background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
                          border: "1px solid var(--border-subtle)",
                          transition: "border-color 0.15s",
                        }}>
                          {/* Top row */}
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: "rgba(99,102,241,0.15)", color: "#6366f1",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontWeight: 800, fontSize: 14, flexShrink: 0,
                              }}>
                                {(req.patientName || "?").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{req.patientName}</div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{req.patientEmail}</div>
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 800, padding: "3px 9px",
                              borderRadius: 99, background: statusBg, color: statusColor,
                              letterSpacing: "0.05em", whiteSpace: "nowrap", flexShrink: 0,
                            }}>
                              {req.status.toUpperCase()}
                            </span>
                          </div>

                          {/* Meta pills */}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99,
                              background: "rgba(99,102,241,0.1)", color: "#6366f1", fontWeight: 600,
                            }}>
                              {typeLabel}
                            </span>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 99,
                              background: "var(--bg-tertiary)", color: "var(--text-muted)", fontWeight: 500,
                            }}>
                              {new Date(req.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>

                          {/* Message */}
                          {req.message && (
                            <div style={{
                              marginTop: 8, padding: "8px 10px",
                              borderRadius: 8,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid var(--border-subtle)",
                              fontSize: 12, color: "var(--text-muted)",
                              fontStyle: "italic", lineHeight: 1.5,
                            }}>
                              "{req.message}"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
      {/* ── Record Viewer & Verification Modal ── */}
      {selectedRecordForViewer && (
        <RecordViewerModal
          record={selectedRecordForViewer}
          patientAddress={resolvedPatient?.walletAddress || bioData?.patient?.walletAddress}
          contract={contract}
          currentUserRole="doctor"
          onClose={() => setSelectedRecordForViewer(null)}
        />
      )}
    </>
  );
}

export default DoctorDashboard;
