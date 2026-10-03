import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  Wallet, RefreshCw, UploadCloud, ShieldCheck, ShieldX,
  Inbox, CheckCircle2, X, AlertCircle, Filter, Clock,
  ExternalLink, Activity
} from "lucide-react";
import MedicalRecordArtifact from "./MedicalRecord.json";

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
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

const EVENT_CONFIG = {
  RecordUploaded: {
    label: "Record Uploaded",
    icon: UploadCloud,
    color: "var(--teal)",
    bg: "var(--teal-dim)",
    border: "rgba(99,102,241,0.25)",
  },
  AccessGranted: {
    label: "Access Granted",
    icon: ShieldCheck,
    color: "#10b981",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.25)",
  },
  AccessRevoked: {
    label: "Access Revoked",
    icon: ShieldX,
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
  },
};

function AuditLog({ user, onWalletConnect }) {
  const { toasts, add: toast, remove: removeToast } = useToasts();
  const [account, setAccount]   = useState(null);
  const [provider, setProvider] = useState(null);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("All");

  const connectWallet = async () => {
    if (!window.ethereum) { toast("MetaMask is not installed.", "error", "Wallet Error"); return; }
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setProvider(prov);
      if (onWalletConnect) onWalletConnect(accounts[0]);
      toast("Wallet connected.", "success", "Connected");
    } catch (e) { toast(e.message, "error", "Connection Failed"); }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then(accounts => {
        if (accounts.length > 0 && !account) connectWallet();
      });
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) { setAccount(null); setProvider(null); setEvents([]); }
        else connectWallet();
      };
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, []);

  const fetchEvents = async () => {
    if (!provider) { toast("Connect your wallet first.", "error"); return; }
    setLoading(true);
    setEvents([]);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, MedicalRecordArtifact.abi, provider);
      const [uploadedRaw, grantedRaw, revokedRaw] = await Promise.all([
        contract.queryFilter(contract.filters.RecordUploaded(), 0, "latest"),
        contract.queryFilter(contract.filters.AccessGranted(), 0, "latest"),
        contract.queryFilter(contract.filters.AccessRevoked(), 0, "latest"),
      ]);

      const uploaded = uploadedRaw.map(e => ({
        type: "RecordUploaded",
        blockNumber: e.blockNumber,
        txHash: e.transactionHash,
        patient: e.args.patient,
        fileHash: e.args.fileHash,
        recordType: e.args.recordType,
        timestamp: Number(e.args.timestamp),
      }));

      const granted = grantedRaw.map(e => ({
        type: "AccessGranted",
        blockNumber: e.blockNumber,
        txHash: e.transactionHash,
        patient: e.args.patient,
        doctor: e.args.doctor,
        timestamp: null,
        _block: e.blockNumber,
      }));

      const revoked = revokedRaw.map(e => ({
        type: "AccessRevoked",
        blockNumber: e.blockNumber,
        txHash: e.transactionHash,
        patient: e.args.patient,
        doctor: e.args.doctor,
        timestamp: null,
        _block: e.blockNumber,
      }));

      const blockNums = [...new Set([...granted, ...revoked].map(e => e._block))];
      const blockTimestamps = {};
      await Promise.all(blockNums.map(async (bn) => {
        const block = await provider.getBlock(bn);
        blockTimestamps[bn] = Number(block.timestamp);
      }));
      granted.forEach(e => { e.timestamp = blockTimestamps[e._block]; });
      revoked.forEach(e => { e.timestamp = blockTimestamps[e._block]; });

      const all = [...uploaded, ...granted, ...revoked].sort((a, b) => b.timestamp - a.timestamp);
      setEvents(all);
      toast(`${all.length} event(s) loaded from blockchain.`, "success", "Audit Log Loaded");
    } catch (e) {
      toast(e.message, "error", "Failed to fetch events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (provider) fetchEvents(); }, [provider]);

  const filtered = filter === "All" ? events : events.filter(e => e.type === filter);
  const counts = {
    All: events.length,
    RecordUploaded: events.filter(e => e.type === "RecordUploaded").length,
    AccessGranted:  events.filter(e => e.type === "AccessGranted").length,
    AccessRevoked:  events.filter(e => e.type === "AccessRevoked").length,
  };

  return (
    <>
      <ToastContainer toasts={toasts} remove={removeToast} />

      <div className="page-header">
        <h1 className="page-title">Blockchain Audit Log</h1>
        <p className="page-subtitle">
          A transparent, tamper-proof history of every record upload and access change — read directly from the Ethereum blockchain.
        </p>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon"><Activity size={18} /></div>
          <div className="stat-value">{counts.All}</div>
          <div className="stat-label">Total events</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><UploadCloud size={18} /></div>
          <div className="stat-value">{counts.RecordUploaded}</div>
          <div className="stat-label">Records uploaded</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
            <ShieldCheck size={18} />
          </div>
          <div className="stat-value">{counts.AccessGranted}</div>
          <div className="stat-label">Access granted</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon danger"><ShieldX size={18} /></div>
          <div className="stat-value">{counts.AccessRevoked}</div>
          <div className="stat-label">Access revoked</div>
        </div>
      </div>

      {!account && (
        <div className="card card-glow">
          <div className="card-header">
            <div className="icon-chip"><Wallet size={18} /></div>
            <div className="card-header-text">
              <h2 className="card-title">Connect your wallet to view audit log</h2>
              <p className="card-subtitle">Events are read directly from the Ethereum smart contract — no middleman.</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={connectWallet}>
            <Wallet size={16} /> Connect MetaMask
          </button>
        </div>
      )}

      {account && (
        <div className="card">
          <div className="card-header">
            <div className="icon-chip"><Activity size={18} /></div>
            <div className="card-header-text">
              <h2 className="card-title">Event Timeline</h2>
              <p className="card-subtitle">All on-chain events — newest first.</p>
            </div>
            <div className="card-header-action" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Filter size={13} style={{ color: "var(--ink-4)" }} />
                {["All", "RecordUploaded", "AccessGranted", "AccessRevoked"].map(f => (
                  <button
                    key={f}
                    className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline"}`}
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => setFilter(f)}
                  >
                    {f === "All" ? "All" : f === "RecordUploaded" ? "Uploads" : f === "AccessGranted" ? "Granted" : "Revoked"}
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>({counts[f]})</span>
                  </button>
                ))}
              </div>
              <button className="btn btn-outline btn-sm" onClick={fetchEvents} disabled={loading}>
                <RefreshCw size={13} /> {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <RefreshCw size={28} style={{ animation: "spin 1s linear infinite" }} />
              <div className="empty-state-title">Reading blockchain events…</div>
              <div className="empty-state-text">This may take a few seconds.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Inbox size={32} />
              <div className="empty-state-title">No events found</div>
              <div className="empty-state-text">
                {events.length === 0 ? "No blockchain events recorded yet." : `No "${filter}" events to show.`}
              </div>
            </div>
          ) : (
            <ul className="record-list" style={{ gap: 10 }}>
              {filtered.map((ev, i) => {
                const cfg = EVENT_CONFIG[ev.type];
                const Icon = cfg.icon;
                const date = ev.timestamp ? new Date(ev.timestamp * 1000).toLocaleString() : "Unknown";
                return (
                  <li key={i} className="record-item" style={{ background: cfg.bg, borderColor: cfg.border, alignItems: "flex-start", gap: 14 }}>
                    <div className="record-icon" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, flexShrink: 0, marginTop: 2 }}>
                      <Icon size={15} />
                    </div>
                    <div className="record-body" style={{ flex: 1, minWidth: 0 }}>
                      <div className="record-hash-row" style={{ marginBottom: 5 }}>
                        <span className="record-badge" style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                          {cfg.label}
                        </span>
                        <span className="record-meta">Block #{ev.blockNumber}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>Patient: </span>
                          <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{ev.patient}</code>
                        </div>
                        {ev.type === "RecordUploaded" && (
                          <>
                            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                              <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>Type: </span>{ev.recordType}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                              <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>IPFS Hash: </span>
                              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{shortenAddress(ev.fileHash)}</code>
                            </div>
                          </>
                        )}
                        {(ev.type === "AccessGranted" || ev.type === "AccessRevoked") && (
                          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                            <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>
                              {ev.type === "AccessGranted" ? "Doctor granted: " : "Doctor revoked: "}
                            </span>
                            <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{ev.doctor}</code>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                          <Clock size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} />{date}
                        </div>
                      </div>
                    </div>
                    <div className="record-actions" style={{ flexShrink: 0 }}>
                      {ev.type === "RecordUploaded" && ev.fileHash && (
                        <a className="btn btn-outline btn-sm" href={`https://gateway.pinata.cloud/ipfs/${ev.fileHash}`} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} /> View
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export default AuditLog;
