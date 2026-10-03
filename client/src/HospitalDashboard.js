import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Building2, Users, UserCheck, Activity, RefreshCw,
  Inbox, CheckCircle2, X, AlertCircle, Clock, Search, Shield
} from "lucide-react";

const AUTH_API = "http://localhost:5001/api/auth";

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
          <span className="toast-icon">{icons[t.type]}</span>
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

function shortenAddress(addr) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function HospitalDashboard({ user, activeTab }) {
  const { toasts, add: toast, remove: removeToast } = useToasts();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      // Try protected hospital route first, fallback to general doctor search
      let res;
      try {
        res = await axios.get(`${AUTH_API}/hospital/doctors`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Fallback: search by hospital name
        res = await axios.get(`${AUTH_API}/doctors`, {
          params: { search: user.hospitalName || "" },
        });
      }
      setDoctors(res.data);
      toast(`${res.data.length} doctor(s) found.`, "success", "Loaded");
    } catch (e) {
      toast(e.response?.data?.message || e.message, "error", "Fetch Failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchDoctors(); }, []);

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.specialization || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.doctorId || "").toLowerCase().includes(search.toLowerCase())
  );

  const showDashboard = activeTab === "dashboard";
  const showDoctors   = activeTab === "doctors";

  return (
    <>
      <ToastContainer toasts={toasts} remove={removeToast} />

      {/* ── DASHBOARD TAB ── */}
      {showDashboard && (
        <>
          <div className="page-header">
            <h1 className="page-title">Hospital Dashboard</h1>
            <p className="page-subtitle">
              Manage your registered doctors and monitor activity at {user.hospitalName || "your hospital"}.
            </p>
          </div>

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon"><Users size={18} /></div>
              <div className="stat-value">{doctors.length}</div>
              <div className="stat-label">Registered doctors</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon gold"><UserCheck size={18} /></div>
              <div className="stat-value">{doctors.filter(d => d.isVerified !== false).length}</div>
              <div className="stat-label">Verified doctors</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: "rgba(130,80,255,0.15)", color: "#a57dff" }}><Shield size={18} /></div>
              <div className="stat-value" style={{ fontSize: 16, paddingTop: 6 }}>Secure</div>
              <div className="stat-label">Blockchain-backed</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon danger"><Activity size={18} /></div>
              <div className="stat-value" style={{ fontSize: 16, paddingTop: 6 }}>Active</div>
              <div className="stat-label">System status</div>
            </div>
          </div>

          {/* Hospital info */}
          <div className="card">
            <div className="card-header">
              <div className="icon-chip"><Building2 size={18} /></div>
              <div className="card-header-text">
                <h2 className="card-title">{user.hospitalName || "Hospital"}</h2>
                <p className="card-subtitle">Hospital admin account • {user.email}</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                ["Administrator", user.name],
                ["Email", user.email],
                ["City", user.city],
                ["State", user.state],
                ["Mobile", user.mobileNumber],
                ["Wallet", shortenAddress(user.walletAddress)],
              ].map(([label, val]) => (
                <div key={label} style={{ padding: "12px 14px", background: "var(--bg-card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent doctors preview */}
          <div className="card">
            <div className="card-header">
              <div className="icon-chip gold"><Users size={18} /></div>
              <div className="card-header-text">
                <h2 className="card-title">Recent doctors</h2>
                <p className="card-subtitle">Doctors registered under this hospital.</p>
              </div>
              <div className="card-header-action">
                <button className="btn btn-outline btn-sm" onClick={fetchDoctors} disabled={loading}>
                  <RefreshCw size={13} /> {loading ? "…" : "Refresh"}
                </button>
              </div>
            </div>
            {doctors.slice(0, 3).length === 0 ? (
              <div className="empty-state">
                <Inbox size={32} />
                <div className="empty-state-title">No doctors found</div>
                <div className="empty-state-text">No doctors registered under your hospital yet.</div>
              </div>
            ) : (
              <div className="doctor-grid">
                {doctors.slice(0, 3).map(doc => (
                  <div className="doctor-card" key={doc._id}>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DOCTORS TAB ── */}
      {showDoctors && (
        <>
          <div className="page-header">
            <h1 className="page-title">Our Doctors</h1>
            <p className="page-subtitle">All verified doctors registered under {user.hospitalName}.</p>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="icon-chip"><Users size={18} /></div>
              <div className="card-header-text">
                <h2 className="card-title">Doctor directory</h2>
                <p className="card-subtitle">{filteredDoctors.length} of {doctors.length} doctor(s)</p>
              </div>
              <div className="card-header-action" style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                  <input
                    className="input" type="text"
                    placeholder="Filter doctors…"
                    style={{ paddingLeft: 32, width: 180 }}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <button className="btn btn-outline btn-sm" onClick={fetchDoctors} disabled={loading}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            {filteredDoctors.length === 0 ? (
              <div className="empty-state">
                <Inbox size={32} />
                <div className="empty-state-title">No doctors found</div>
                <div className="empty-state-text">
                  {search ? `No doctors match "${search}"` : "No doctors registered under your hospital yet."}
                </div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Doctor ID</th>
                    <th>Specialization</th>
                    <th>Wallet</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDoctors.map(doc => (
                    <tr key={doc._id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {doc.profilePictureHash ? (
                            <img className="avatar-thumb" src={"https://gateway.pinata.cloud/ipfs/" + doc.profilePictureHash} alt={doc.name} />
                          ) : (
                            <div className="doctor-avatar-fallback" style={{ width: 32, height: 32, fontSize: 13 }}>{doc.name.charAt(0)}</div>
                          )}
                          <span style={{ fontWeight: 600, color: "var(--ink-1)" }}>Dr. {doc.name}</span>
                        </div>
                      </td>
                      <td><span className="chip chip-teal">{doc.doctorId}</span></td>
                      <td style={{ color: "var(--ink-2)" }}>{doc.specialization || "General Physician"}</td>
                      <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>{shortenAddress(doc.walletAddress)}</span></td>
                      <td><span className="chip chip-teal"><CheckCircle2 size={10} /> Verified</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default HospitalDashboard;
