import { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import axios from "axios";
import {
  Wallet, UploadCloud, Users, FileText, RefreshCw, ExternalLink,
  Inbox, Search, BadgeCheck, Building2, Stethoscope, Copy,
  CheckCircle2, Shield, Activity, Clock, X, AlertCircle,
  FlaskConical, Pill, ScanLine, FileQuestion, Bell, CheckCircle, XCircle
} from "lucide-react";
import MedicalRecordArtifact from "./MedicalRecord.json";
import { encryptMedicalFile } from "./utils/cryptoUtils";
import RecordViewerModal from "./RecordViewerModal";
import { ShieldCheck } from "lucide-react";

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const PINATA_JWT = process.env.REACT_APP_PINATA_JWT;
const AUTH_API  = process.env.REACT_APP_API_URL || "http://localhost:5001/api/auth";
const ACCESS_REQ_API = process.env.REACT_APP_API_URL?.replace("/api/auth", "/api/access-requests") || "http://localhost:5001/api/access-requests";

const RECORD_TYPES = [
  { id: "Lab Report",   icon: FlaskConical,  color: "teal"   },
  { id: "Prescription", icon: Pill,           color: "gold"   },
  { id: "Scan",         icon: ScanLine,       color: "purple" },
  { id: "Other",        icon: FileQuestion,   color: "teal"   },
];

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

// ── Toast hook ──────────────────────────────────────────────────────────────
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

function PatientDashboard({ user, activeTab, onWalletConnect }) {
  const { toasts, add: toast, remove: removeToast } = useToasts();

  const [account, setAccount]     = useState(null);
  const [contract, setContract]   = useState(null);
  const [myRecords, setMyRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Upload
  const [selectedFile, setSelectedFile]   = useState(null);
  const [recordType, setRecordType]       = useState("Lab Report");
  const [description, setDescription]     = useState("");
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging]           = useState(false);
  const [selectedRecordForViewer, setSelectedRecordForViewer] = useState(null);
  const fileInputRef = useRef();

  // Doctor access
  const [doctorQuery, setDoctorQuery]     = useState("");
  const [doctorResults, setDoctorResults] = useState([]);
  const [searchingDocs, setSearchingDocs] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [doctorPermissions, setDoctorPermissions] = useState({ view: false, upload: false, loading: false });

  // Incoming Access Requests State
  const [accessRequests, setAccessRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [processingReq, setProcessingReq] = useState({});

  const checkDoctorPermissions = useCallback(async (doc) => {
    if (!contract || !account || !doc?.walletAddress) return;
    try {
      setDoctorPermissions(p => ({ ...p, loading: true }));
      const [view, upload] = await Promise.all([
        contract.hasAccess(account, doc.walletAddress).catch(() => false),
        contract.hasUploadPermission(account, doc.walletAddress).catch(() => false),
      ]);
      setDoctorPermissions({ view: Boolean(view), upload: Boolean(upload), loading: false });
    } catch (e) {
      console.error("Failed to check doctor permissions:", e);
      setDoctorPermissions(p => ({ ...p, loading: false }));
    }
  }, [contract, account]);

  useEffect(() => {
    if (selectedDoctor) {
      checkDoctorPermissions(selectedDoctor);
    }
  }, [selectedDoctor, checkDoctorPermissions]);

  // Stats
  const [stats, setStats] = useState({ records: 0, doctors: 0, lastUpload: null });

  // ── Connect wallet ─────────────────────────────────────────────────────────
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
      // Auto-load records
      loadRecords(c, accounts[0]);
    } catch (e) { toast(e.message, "error", "Connection Failed"); }
  };

  // Auto-connect if previously connected + listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then(accounts => {
        if (accounts.length > 0 && !account) connectWallet();
      });
      // Listen for wallet account switch in MetaMask
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          setAccount(null);
          setContract(null);
          setMyRecords([]);
          onWalletConnect(null);
        } else {
          connectWallet();
        }
      };
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, []);

  // ── Load records ───────────────────────────────────────────────────────────
  const loadRecords = async (c, acc) => {
    const ct = c || contract;
    const ac = acc || account;
    if (!ct || !ac) { toast("Connect your wallet first.", "error"); return; }
    try {
      setLoadingRecords(true);
      const records = await ct.getRecords(ac);
      const recordsArray = Array.from(records);
      setMyRecords(recordsArray);
      const lastUpload = recordsArray.length > 0 ? Number(recordsArray[recordsArray.length - 1].timestamp) * 1000 : null;
      setStats(s => ({ ...s, records: recordsArray.length, lastUpload }));
      toast(`${recordsArray.length} record(s) loaded.`, "success", "Records Refreshed");
    } catch (e) { toast(e.message, "error", "Fetch Failed"); }
    finally { setLoadingRecords(false); }
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);
  const onDragOver = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!contract || !selectedFile) { toast("Connect your wallet and choose a file first.", "error"); return; }
    try {
      setUploading(true);
      setUploadProgress(15);
      toast("Encrypting file with AES-256-GCM before IPFS upload…", "info", "Security Layer");

      // 1. Client-side AES-256 Encryption & SHA-256 Fingerprint: H = SHA256(Fenc)
      const encResult = await encryptMedicalFile(selectedFile, account);
      const encryptedFile = encResult.encryptedFile;
      const fileHash = encResult.fileHash;

      setUploadProgress(35);
      toast("Uploading encrypted payload (Fenc) to IPFS…", "info", "Off-Chain Storage");

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
      toast("Writing CID & SHA-256 hash to blockchain… Confirm MetaMask signature", "warning", "Blockchain Registration");

      // 3. Register on Ethereum Smart Contract (CID + SHA-256 + recordType + description)
      const tx = await contract.uploadRecord(ipfsCID, fileHash, recordType, description);
      setUploadProgress(90);
      await tx.wait();
      setUploadProgress(100);

      toast("Record encrypted with AES-256 & registered on-chain!", "success", "Upload Complete");
      setSelectedFile(null);
      setDescription("");
      setTimeout(() => setUploadProgress(0), 1000);
      loadRecords();
    } catch (e) {
      console.error("Upload error:", e);
      toast(e.reason || e.message, "error", "Upload Failed");
      setUploadProgress(0);
    } finally { setUploading(false); }
  };

  // ── Doctor search ──────────────────────────────────────────────────────────
  const searchDoctors = async () => {
    setSearchingDocs(true);
    try {
      const res = await axios.get(`${AUTH_API}/doctors`, { params: { search: doctorQuery } });
      setDoctorResults(res.data);
      if (res.data.length === 0) toast("No doctors found.", "warning");
    } catch (e) { toast(e.message, "error"); }
    finally { setSearchingDocs(false); }
  };

    const handleGrantAccess = async () => {
    if (!contract || !selectedDoctor) { toast("Connect wallet and select a doctor.", "error"); return; }
    try {
      toast("Confirm in MetaMask…", "warning", "Awaiting signature");
      const tx = await contract.grantAccess(selectedDoctor.walletAddress);
      await tx.wait();
      toast(`View access granted to Dr. ${selectedDoctor.name}`, "success", "View Access Granted");
      setStats(s => ({ ...s, doctors: s.doctors + 1 }));
      setDoctorPermissions(p => ({ ...p, view: true }));
    } catch (e) { toast(e.message, "error", "Failed"); }
  };

  const handleRevokeAccess = async () => {
    if (!contract || !selectedDoctor) { toast("Connect wallet and select a doctor.", "error"); return; }
    try {
      toast("Confirm in MetaMask…", "warning", "Awaiting signature");
      const tx = await contract.revokeAccess(selectedDoctor.walletAddress);
      await tx.wait();
      toast(`View access revoked for Dr. ${selectedDoctor.name}`, "success", "View Access Revoked");
      setStats(s => ({ ...s, doctors: Math.max(0, s.doctors - 1) }));
      setDoctorPermissions(p => ({ ...p, view: false }));
    } catch (e) { toast(e.message, "error", "Failed"); }
  };

  const handleGrantUploadPermission = async () => {
    if (!contract || !selectedDoctor) { toast("Connect wallet and select a doctor.", "error"); return; }
    try {
      toast("Confirm in MetaMask…", "warning", "Awaiting signature");
      const tx = await contract.grantUploadPermission(selectedDoctor.walletAddress);
      await tx.wait();
      toast(`Upload permission granted to Dr. ${selectedDoctor.name}`, "success", "Upload Permission Granted");
      setDoctorPermissions(p => ({ ...p, upload: true }));
    } catch (e) { toast(e.message, "error", "Failed"); }
  };

  const handleRevokeUploadPermission = async () => {
    if (!contract || !selectedDoctor) { toast("Connect wallet and select a doctor.", "error"); return; }
    try {
      toast("Confirm in MetaMask…", "warning", "Awaiting signature");
      const tx = await contract.revokeUploadPermission(selectedDoctor.walletAddress);
      await tx.wait();
      toast(`Upload permission revoked for Dr. ${selectedDoctor.name}`, "success", "Upload Permission Revoked");
      setDoctorPermissions(p => ({ ...p, upload: false }));
    } catch (e) { toast(e.message, "error", "Failed"); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard!", "success");
  };

  // ── Determine what to show based on activeTab ──────────────────────────────
  // Fetch incoming access requests
  const fetchAccessRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${ACCESS_REQ_API}/my-requests`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAccessRequests(res.data);
    } catch (e) {
      console.error("Failed to fetch access requests", e);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccessRequests();
  }, [fetchAccessRequests]);

  const handleApproveRequest = async (req) => {
    if (!contract) { toast("Connect wallet first to grant on-chain access.", "error"); return; }
    setProcessingReq(p => ({ ...p, [req._id]: "approving" }));
    try {
      const token = localStorage.getItem("token");
      // 1. Grant on-chain access based on requestType
      if (req.requestType === "view" || req.requestType === "both") {
        const tx = await contract.grantAccess(req.doctorWallet);
        await tx.wait();
      }
      if (req.requestType === "upload" || req.requestType === "both") {
        const tx2 = await contract.grantUploadPermission(req.doctorWallet);
        await tx2.wait();
      }
      // 2. Update status in DB
      await axios.patch(
        `${ACCESS_REQ_API}/${req._id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast(`Access granted to Dr. ${req.doctorName}`, "success", "Access Granted");
      fetchAccessRequests();
    } catch (e) {
      toast(e?.response?.data?.message || e?.message || "Failed to grant access.", "error");
    } finally {
      setProcessingReq(p => ({ ...p, [req._id]: null }));
    }
  };

  const handleRejectRequest = async (req) => {
    setProcessingReq(p => ({ ...p, [req._id]: "rejecting" }));
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${ACCESS_REQ_API}/${req._id}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast(`Request from Dr. ${req.doctorName} rejected.`, "success", "Request Rejected");
      fetchAccessRequests();
    } catch (e) {
      toast(e?.response?.data?.message || "Failed to reject request.", "error");
    } finally {
      setProcessingReq(p => ({ ...p, [req._id]: null }));
    }
  };

  const pendingCount = accessRequests.filter(r => r.status === "pending").length;

  const showDashboard = activeTab === "dashboard";
  const showRecords   = activeTab === "records";
  const showAccess    = activeTab === "access";

  const recordTypeIcon = (type) => {
    const found = RECORD_TYPES.find(r => r.id === type);
    if (!found) return { Icon: FileText, color: "teal" };
    return { Icon: found.icon, color: found.color };
  };

  return (
    <>
      <ToastContainer toasts={toasts} remove={removeToast} />

      {/* ── DASHBOARD TAB ── */}
      {showDashboard && (
        <>
          <div className="page-header">
            <h1 className="page-title">Welcome back, {user.name.split(" ")[0]} 👋</h1>
            <p className="page-subtitle">Manage your medical records securely on the blockchain.</p>
          </div>

          {/* Stats row */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon"><FileText size={18} /></div>
              <div className="stat-value">{stats.records}</div>
              <div className="stat-label">Records on chain</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon gold"><Users size={18} /></div>
              <div className="stat-value">{stats.doctors}</div>
              <div className="stat-label">Doctors with access</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: "rgba(130,80,255,0.15)", color: "#a57dff" }}><Shield size={18} /></div>
              <div className="stat-value" style={{ fontSize: 18, paddingTop: 4 }}>On-Chain</div>
              <div className="stat-label">Blockchain verified</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon danger"><Clock size={18} /></div>
              <div className="stat-value" style={{ fontSize: stats.lastUpload ? 15 : 20, paddingTop: stats.lastUpload ? 6 : 0 }}>
                {stats.lastUpload ? new Date(stats.lastUpload).toLocaleDateString() : "—"}
              </div>
              <div className="stat-label">Last upload</div>
            </div>
          </div>

          {/* Wallet connect or quick actions */}
          {!account ? (
            <div className="card card-glow">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Connect your wallet</h2>
                  <p className="card-subtitle">Link MetaMask to upload records and manage doctor access on-chain.</p>
                </div>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}>
                <Wallet size={16} /> Connect MetaMask
              </button>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Wallet connected</h2>
                  <p className="card-subtitle">Ready to interact with the smart contract.</p>
                </div>
                <div className="wallet-status-pill connected">
                  <div className="wallet-dot active" />
                  {shortenAddress(account)}
                </div>
              </div>
            </div>
          )}

          {/* Recent records preview */}
          <div className="card">
            <div className="card-header">
              <div className="icon-chip"><Activity size={18} /></div>
              <div className="card-header-text">
                <h2 className="card-title">Recent records</h2>
                <p className="card-subtitle">Latest entries from your on-chain record store.</p>
              </div>
              <div className="card-header-action">
                <button className="btn btn-outline btn-sm" onClick={() => loadRecords()} disabled={!account || loadingRecords}>
                  <RefreshCw size={13} /> {loadingRecords ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>
            {myRecords.length === 0 ? (
              <div className="empty-state">
                <Inbox size={32} />
                <div className="empty-state-title">No records yet</div>
                <div className="empty-state-text">Upload your first medical record to get started.</div>
              </div>
            ) : (
              <ul className="record-list">
                {[...myRecords].slice(-3).reverse().map((r, i) => {
                  const { Icon, color } = recordTypeIcon(r.recordType);
                  return (
                    <li className="record-item" key={i}>
                      <div className={`record-icon ${color}`}><Icon size={16} /></div>
                      <div className="record-body">
                        <div className="record-hash-row">
                          <span className="record-badge">{r.recordType || "Record"}</span>
                          <span className="record-hash">{shortenAddress(r.fileHash)}</span>
                        </div>
                        <div className="record-hash-row" style={{ marginTop: 2 }}>
                          {r.description && <span className="record-meta">{r.description}</span>}
                          <span className="record-meta">• {new Date(Number(r.timestamp) * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="record-actions">
                        <button className="btn btn-outline btn-sm" onClick={() => setSelectedRecordForViewer(r)} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <ShieldCheck size={13} color="#10b981" /> Verify & Decrypt
                        </button>
                        <a className="btn btn-ghost btn-icon" href={"https://gateway.pinata.cloud/ipfs/" + (r.ipfsCID || r[0] || r.fileHash)} target="_blank" rel="noreferrer" title="View Encrypted IPFS Payload">
                          <ExternalLink size={14} />
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
        </>
      )}

      {/* ── RECORDS TAB ── */}
      {showRecords && (
        <>
          <div className="page-header">
            <h1 className="page-title">My Medical Records</h1>
            <p className="page-subtitle">Upload and manage your blockchain-verified medical documents.</p>
          </div>

          {!account && (
            <div className="card card-glow">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Connect your wallet first</h2>
                  <p className="card-subtitle">You need MetaMask to upload or view on-chain records.</p>
                </div>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}><Wallet size={16} /> Connect MetaMask</button>
            </div>
          )}

          {account && (
            <>
              {/* Upload card */}
              <div className="card">
                <div className="card-header">
                  <div className="icon-chip"><UploadCloud size={18} /></div>
                  <div className="card-header-text">
                    <h2 className="card-title">Upload a medical record</h2>
                    <p className="card-subtitle">Files are pinned to IPFS. Only the IPFS hash is written on-chain.</p>
                  </div>
                </div>

                {/* Record type selector */}
                <div className="type-selector">
                  {RECORD_TYPES.map(({ id, icon: Icon, color }) => (
                    <button key={id} className={`type-pill ${recordType === id ? "selected" : ""}`} onClick={() => setRecordType(id)}>
                      <Icon size={12} /> {id}
                    </button>
                  ))}
                </div>

                {/* Drag & drop zone */}
                <div
                  className={`drop-zone ${dragging ? "dragging" : ""}`}
                  onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="drop-zone-icon"><UploadCloud size={32} /></div>
                  <div className="drop-zone-text">
                    <strong>Click to browse</strong> or drag & drop a file here
                  </div>
                  <div className="drop-zone-hint">PDF, JPG, PNG, DICOM — any file type accepted</div>
                  <input ref={fileInputRef} type="file" onChange={e => setSelectedFile(e.target.files[0])} />
                </div>

                {selectedFile && (
                  <div className="file-info-chip">
                    <FileText size={16} style={{ color: "var(--teal)", flexShrink: 0 }} />
                    <span className="file-info-chip-name">{selectedFile.name}</span>
                    <span className="file-info-chip-size">{formatFileSize(selectedFile.size)}</span>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedFile(null)}><X size={14} /></button>
                  </div>
                )}

                <div className="field" style={{ marginTop: 14 }}>
                  <label className="field-label">Description (optional)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. Blood test results from Apollo, Aug 2026"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: uploadProgress + "%" }} />
                  </div>
                )}

                <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !selectedFile} style={{ marginTop: 16 }}>
                  <UploadCloud size={16} />
                  {uploading ? `Uploading… ${uploadProgress}%` : "Upload Record"}
                </button>
              </div>

              {/* All records */}
              <div className="card">
                <div className="card-header">
                  <div className="icon-chip"><FileText size={18} /></div>
                  <div className="card-header-text">
                    <h2 className="card-title">All uploaded records</h2>
                    <p className="card-subtitle">Every record is verified against its on-chain hash.</p>
                  </div>
                  <div className="card-header-action">
                    <button className="btn btn-outline btn-sm" onClick={() => loadRecords()} disabled={loadingRecords}>
                      <RefreshCw size={13} /> {loadingRecords ? "…" : "Refresh"}
                    </button>
                  </div>
                </div>

                {myRecords.length === 0 ? (
                  <div className="empty-state">
                    <Inbox size={32} />
                    <div className="empty-state-title">No records found</div>
                    <div className="empty-state-text">Upload your first record above to get started.</div>
                  </div>
                ) : (
                  <ul className="record-list">
                    {[...myRecords].reverse().map((r, i) => {
                      const { Icon, color } = recordTypeIcon(r.recordType);
                      const date = new Date(Number(r.timestamp) * 1000).toLocaleString();
                      const link = "https://gateway.pinata.cloud/ipfs/" + r.fileHash;
                      return (
                        <li className="record-item" key={i}>
                          <div className={`record-icon ${color}`}><Icon size={16} /></div>
                          <div className="record-body">
                            <div className="record-hash-row">
                              <span className="record-badge">{r.recordType || "Record"}</span>
                              <span className="record-badge" style={{ background: "var(--teal-dim)", color: "var(--teal)" }}>Verified on-chain</span>
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
            </>
          )}
        </>
      )}

      {/* ── ACCESS TAB ── */}
      {showAccess && (
        <>
          <div className="page-header">
            <h1 className="page-title">Doctor Access Control</h1>
            <p className="page-subtitle">Search for doctors and grant or revoke access to your medical records.</p>
          </div>

          {/* ── Incoming Access Requests ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <div className="icon-chip" style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}>
                <Bell size={18} />
              </div>
              <div className="card-header-text">
                <h2 className="card-title">
                  Doctor Access Requests
                  {pendingCount > 0 && (
                    <span style={{
                      marginLeft: 10, fontSize: 11, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 99,
                      background: "rgba(239,68,68,0.15)", color: "#ef4444"
                    }}>{pendingCount} Pending</span>
                  )}
                </h2>
                <p className="card-subtitle">Doctors who requested access to your records. Grant or reject below.</p>
              </div>
              <button className="btn btn-outline btn-sm" onClick={fetchAccessRequests} disabled={requestsLoading} style={{ marginLeft: "auto" }}>
                <RefreshCw size={13} style={{ marginRight: 4 }} />Refresh
              </button>
            </div>

            {requestsLoading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                <span className="spinner" style={{ width: 20, height: 20, margin: "0 auto 8px", display: "block" }} />Loading requests...
              </div>
            ) : accessRequests.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <div className="empty-state-icon"><Bell size={26} /></div>
                <div className="empty-state-text">No access requests yet.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 0 4px" }}>
                {accessRequests.map(req => (
                  <div key={req._id} style={{
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    background: req.status === "pending" ? "rgba(139,92,246,0.07)" : "var(--bg-tertiary)",
                    border: `1px solid ${req.status === "pending" ? "rgba(139,92,246,0.25)" : "var(--border-subtle)"}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}>
                    {/* Doctor Avatar */}
                    <div style={{
                      width: 42, height: 42, borderRadius: "50%",
                      background: "rgba(99,102,241,0.15)", color: "#6366f1",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: 16, flexShrink: 0
                    }}>
                      {req.doctorName.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                        Dr. {req.doctorName}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {req.doctorEmail} {req.doctorSpecialization && `· ${req.doctorSpecialization}`} {req.doctorHospital && `· ${req.doctorHospital}`}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                        Requesting: <strong>{req.requestType === "both" ? "View & Upload" : req.requestType === "view" ? "View Records" : "Upload Records"}</strong>
                        {" · "}{new Date(req.createdAt).toLocaleDateString()}
                      </div>
                      {req.message && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                          "{req.message}"
                        </div>
                      )}
                    </div>

                    {/* Status / Actions */}
                    {req.status === "pending" ? (
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}
                          onClick={() => handleApproveRequest(req)}
                          disabled={!!processingReq[req._id]}
                        >
                          {processingReq[req._id] === "approving" ? (
                            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                          ) : (
                            <><CheckCircle size={13} style={{ marginRight: 4 }} />Grant</>
                          )}
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                          onClick={() => handleRejectRequest(req)}
                          disabled={!!processingReq[req._id]}
                        >
                          {processingReq[req._id] === "rejecting" ? (
                            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                          ) : (
                            <><XCircle size={13} style={{ marginRight: 4 }} />Reject</>
                          )}
                        </button>
                      </div>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
                        background: req.status === "approved" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
                        color: req.status === "approved" ? "#22c55e" : "#ef4444",
                        flexShrink: 0
                      }}>
                        {req.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!account && (
            <div className="card card-glow">
              <div className="card-header">
                <div className="icon-chip"><Wallet size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Connect your wallet first</h2>
                </div>
              </div>
              <button className="btn btn-primary" onClick={connectWallet}><Wallet size={16} /> Connect MetaMask</button>
            </div>
          )}

          {account && (
            <div className="card">
              <div className="card-header">
                <div className="icon-chip gold"><Users size={18} /></div>
                <div className="card-header-text">
                  <h2 className="card-title">Grant or revoke doctor access</h2>
                  <p className="card-subtitle">Search by name and select a registered doctor to manage access.</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Search doctor by name…"
                  value={doctorQuery}
                  onChange={e => setDoctorQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchDoctors()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-outline" onClick={searchDoctors} disabled={searchingDocs} style={{ flexShrink: 0 }}>
                  <Search size={14} /> {searchingDocs ? "Searching…" : "Search"}
                </button>
              </div>

              {/* Doctor results grid */}
              {doctorResults.length > 0 && (
                <div className="doctor-grid" style={{ marginBottom: 16 }}>
                  {doctorResults.map(doc => (
                    <div
                      key={doc._id}
                      className={`doctor-card ${selectedDoctor?._id === doc._id ? "selected" : ""}`}
                      onClick={() => setSelectedDoctor(selectedDoctor?._id === doc._id ? null : doc)}
                    >
                      <div className="doctor-card-header">
                        {doc.profilePictureHash ? (
                          <img className="doctor-avatar" src={"https://gateway.pinata.cloud/ipfs/" + doc.profilePictureHash} alt={doc.name} />
                        ) : (
                          <div className="doctor-avatar-fallback">{doc.name.charAt(0)}</div>
                        )}
                        <div>
                          <div className="doctor-name">Dr. {doc.name}</div>
                          <div className="doctor-id">{doc.doctorId}</div>
                        </div>
                      </div>
                      <div className="doctor-spec">{doc.specialization || "General Physician"}</div>
                      <div className="doctor-hospital" style={{ marginTop: 4 }}>
                        <Building2 size={11} /> {doc.hospitalName}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected doctor */}
              {selectedDoctor && (
                <div className="record-item" style={{ marginBottom: 16, borderColor: "rgba(0,224,195,0.3)", background: "var(--teal-dim)" }}>
                  <div className="record-icon"><BadgeCheck size={16} /></div>
                  <div className="record-body">
                    <div className="record-hash-row">
                      <strong style={{ color: "var(--ink-1)" }}>Dr. {selectedDoctor.name}</strong>
                      <span className="record-badge">{selectedDoctor.doctorId}</span>
                    </div>
                    <div className="record-hash-row" style={{ marginTop: 2 }}>
                      <span className="record-meta"><Building2 size={10} style={{ verticalAlign: "-1px" }} /> {selectedDoctor.hospitalName}</span>
                      <span className="record-hash">{shortenAddress(selectedDoctor.walletAddress)}</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedDoctor(null)}><X size={14} /></button>
                </div>
              )}

              {selectedDoctor && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* View Permission Card */}
                  <div style={{
                    padding: "16px 18px",
                    background: "var(--bg-base)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--glass-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-1)" }}>1. Medical Records Viewing Access</span>
                        {doctorPermissions.loading ? (
                          <span className="chip" style={{ fontSize: 11 }}>Checking…</span>
                        ) : doctorPermissions.view ? (
                          <span className="chip chip-teal" style={{ fontSize: 11 }}><CheckCircle2 size={11} /> View Granted</span>
                        ) : (
                          <span className="chip" style={{ fontSize: 11, background: "#f3f4f6", color: "var(--ink-3)" }}>No View Access</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        Allows Dr. {selectedDoctor.name} to view your on-chain medical records (subject to biometric verification).
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleGrantAccess}
                        disabled={doctorPermissions.view || doctorPermissions.loading}
                      >
                        <CheckCircle2 size={13} /> Grant View Access
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--danger)", borderColor: "rgba(239,68,68,0.3)" }}
                        onClick={handleRevokeAccess}
                        disabled={!doctorPermissions.view || doctorPermissions.loading}
                      >
                        <X size={13} /> Revoke
                      </button>
                    </div>
                  </div>

                  {/* Upload Permission Card */}
                  <div style={{
                    padding: "16px 18px",
                    background: "var(--bg-base)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--glass-border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12
                  }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-1)" }}>2. Doctor Record Upload Permission</span>
                        {doctorPermissions.loading ? (
                          <span className="chip" style={{ fontSize: 11 }}>Checking…</span>
                        ) : doctorPermissions.upload ? (
                          <span className="chip chip-teal" style={{ fontSize: 11 }}><CheckCircle2 size={11} /> Upload Allowed</span>
                        ) : (
                          <span className="chip" style={{ fontSize: 11, background: "#f3f4f6", color: "var(--ink-3)" }}>Upload Not Allowed</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        Permits Dr. {selectedDoctor.name} to upload new medical records, lab reports, or prescriptions directly for you.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleGrantUploadPermission}
                        disabled={doctorPermissions.upload || doctorPermissions.loading}
                      >
                        <UploadCloud size={13} /> Grant Upload Permission
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--danger)", borderColor: "rgba(239,68,68,0.3)" }}
                        onClick={handleRevokeUploadPermission}
                        disabled={!doctorPermissions.upload || doctorPermissions.loading}
                      >
                        <X size={13} /> Revoke
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {/* ── Record Viewer & Verification Modal ── */}
      {selectedRecordForViewer && (
        <RecordViewerModal
          record={selectedRecordForViewer}
          patientAddress={account}
          contract={contract}
          currentUserRole="patient"
          onClose={() => setSelectedRecordForViewer(null)}
        />
      )}
    </>
  );
}

export default PatientDashboard;