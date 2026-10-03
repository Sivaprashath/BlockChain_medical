import { useState, useRef } from "react";
import {
  User, Mail, Phone, MapPin, Calendar, Building2,
  Stethoscope, ShieldCheck, Save, Camera, CheckCircle2,
  AlertCircle, Wallet, Copy, ExternalLink, Edit3
} from "lucide-react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001/api";
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

/* ── small toast ── */
function Toast({ msg, type = "success", onClose }) {
  return (
    <div className={`toast ${type}`} style={{ pointerEvents: "all" }}>
      <div className="toast-icon">
        {type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      </div>
      <div className="toast-body">
        <div className="toast-title">{type === "success" ? "Saved!" : "Error"}</div>
        <div className="toast-msg">{msg}</div>
      </div>
      <button className="toast-close" onClick={onClose}>✕</button>
    </div>
  );
}

/* ── Avatar uploader ── */
function AvatarUploader({ current, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const jwt = process.env.REACT_APP_PINATA_JWT;
      const form = new FormData();
      form.append("file", file);
      form.append("pinataMetadata", JSON.stringify({ name: file.name }));
      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onUploaded(data.IpfsHash);
    } catch (err) {
      alert("Avatar upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="avatar-upload" style={{ flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div
        className="avatar-preview"
        style={{ width: 96, height: 96, position: "relative", cursor: "pointer" }}
        onClick={() => fileRef.current.click()}
      >
        {current ? (
          <img src={IPFS_GATEWAY + current} alt="avatar" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <User size={36} color="var(--ink-4)" />
        )}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(99,102,241,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0, transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0}
        >
          <Camera size={20} color="var(--teal)" />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      <button
        className="btn btn-outline btn-sm"
        disabled={uploading}
        onClick={() => fileRef.current.click()}
        type="button"
      >
        <Camera size={14} />
        {uploading ? "Uploading…" : "Change Photo"}
      </button>
    </div>
  );
}

/* ── Role badge ── */
const ROLE_STYLES = {
  patient:  { bg: "rgba(99,102,241,0.10)", color: "#4f46e5",  label: "Patient" },
  doctor:   { bg: "rgba(16,185,129,0.10)", color: "#059669",  label: "Doctor" },
  hospital: { bg: "rgba(245,158,11,0.12)", color: "#b45309",  label: "Hospital" },
};

export default function ProfilePage({ user, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [copied,  setCopied]  = useState(false);

  const [form, setForm] = useState({
    name:                   user.name || "",
    city:                   user.city || "",
    state:                  user.state || "",
    mobileNumber:           user.mobileNumber || "",
    alternateMobileNumber:  user.alternateMobileNumber || "",
    hospitalName:           user.hospitalName || "",
    specialization:         user.specialization || "",
    profilePictureHash:     user.profilePictureHash || "",
  });

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) };
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      onUpdate(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToast({ msg: "Profile updated successfully!", type: "success" });
      setEditing(false);
    } catch (err) {
      setToast({ msg: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function copyWallet() {
    navigator.clipboard.writeText(user.walletAddress || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const roleBadge = ROLE_STYLES[user.role] || ROLE_STYLES.patient;
  const dob = user.dob ? new Date(user.dob).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        </div>
      )}

      {/* ── Page header ── */}
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your personal information and account details</p>
        </div>
        {!editing && (
          <button className="btn btn-primary" onClick={() => setEditing(true)} id="profile-edit-btn">
            <Edit3 size={15} />
            Edit Profile
          </button>
        )}
      </div>

      {/* ── Profile hero card ── */}
      <div className="card" style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Avatar */}
        {editing ? (
          <AvatarUploader
            current={form.profilePictureHash}
            onUploaded={hash => setForm(f => ({ ...f, profilePictureHash: hash }))}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 96, height: 96, borderRadius: "50%",
              border: "3px solid var(--glass-border)",
              background: "#f3f4f6",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {user.profilePictureHash ? (
                <img src={IPFS_GATEWAY + user.profilePictureHash} alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <User size={38} color="var(--ink-4)" />
              )}
            </div>
          </div>
        )}

        {/* Identity */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--ink-1)" }}>
              {user.name}
            </h2>
            <span style={{
              padding: "3px 12px", borderRadius: 100,
              background: roleBadge.bg, color: roleBadge.color,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              {roleBadge.label}
            </span>
            {user.isVerified && (
              <span title="Verified account" style={{ display: "flex", alignItems: "center", color: "var(--success)" }}>
                <CheckCircle2 size={16} />
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 14 }}>{user.email}</p>

          {/* Quick info pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {user.doctorId && (
              <span className="chip chip-teal">
                <ShieldCheck size={11} /> {user.doctorId}
              </span>
            )}
            {user.hospitalName && (
              <span className="chip chip-teal">
                <Building2 size={11} /> {user.hospitalName}
              </span>
            )}
            {user.specialization && (
              <span className="chip chip-teal">{user.specialization}</span>
            )}
            {user.city && (
              <span className="chip" style={{ background: "#f3f4f6", color: "var(--ink-3)", border: "1px solid #e5e7eb" }}>
                <MapPin size={11} /> {user.city}, {user.state}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Wallet address card ── */}
      <div className="card card-glow" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="icon-chip">
            <Wallet size={17} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
              Ethereum Wallet
            </div>
            <code style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink-1)", wordBreak: "break-all" }}>
              {user.walletAddress || "Not connected"}
            </code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={copyWallet} id="copy-wallet-btn">
            <Copy size={13} />
            {copied ? "Copied!" : "Copy"}
          </button>
          {user.walletAddress && (
            <a
              href={`https://etherscan.io/address/${user.walletAddress}`}
              target="_blank" rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              <ExternalLink size={13} />
              Etherscan
            </a>
          )}
        </div>
      </div>

      {/* ── Edit form or info grid ── */}
      {editing ? (
        <div className="card">
          <div className="card-header">
            <div className="icon-chip"><Edit3 size={17} /></div>
            <div className="card-header-text">
              <h3 className="card-title">Edit Profile</h3>
              <p className="card-subtitle">Update your personal information</p>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Full Name</label>
                <input className="input" placeholder="Your full name" required {...field("name")} />
              </div>
              <div className="field">
                <label className="field-label">Mobile Number</label>
                <input className="input" placeholder="10-digit number" maxLength={10} {...field("mobileNumber")} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label">Alternate Mobile</label>
                <input className="input" placeholder="Optional" maxLength={10} {...field("alternateMobileNumber")} />
              </div>
              <div className="field">
                <label className="field-label">City</label>
                <input className="input" placeholder="City" {...field("city")} />
              </div>
            </div>

            <div className="field">
              <label className="field-label">State</label>
              <input className="input" placeholder="State" {...field("state")} />
            </div>

            {(user.role === "doctor" || user.role === "hospital") && (
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Hospital Name</label>
                  <input className="input" placeholder="Hospital" {...field("hospitalName")} />
                </div>
                {user.role === "doctor" && (
                  <div className="field">
                    <label className="field-label">Specialization</label>
                    <input className="input" placeholder="e.g. Cardiologist" {...field("specialization")} />
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving} id="save-profile-btn">
                <Save size={15} />
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* ── Info grid ── */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div className="icon-chip"><User size={17} /></div>
              <div className="card-header-text">
                <h3 className="card-title">Personal Details</h3>
              </div>
            </div>
            <InfoRow icon={<Mail size={14} />}     label="Email"       value={user.email} />
            <InfoRow icon={<Phone size={14} />}    label="Mobile"      value={user.mobileNumber} />
            <InfoRow icon={<Phone size={14} />}    label="Alt Mobile"  value={user.alternateMobileNumber || "—"} />
            <InfoRow icon={<Calendar size={14} />} label="Date of Birth" value={dob} />
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div className="icon-chip gold"><MapPin size={17} /></div>
              <div className="card-header-text">
                <h3 className="card-title">Location & Role</h3>
              </div>
            </div>
            <InfoRow icon={<MapPin size={14} />}    label="City"         value={user.city} />
            <InfoRow icon={<MapPin size={14} />}    label="State"        value={user.state} />
            {user.hospitalName && (
              <InfoRow icon={<Building2 size={14} />} label="Hospital"  value={user.hospitalName} />
            )}
            {user.specialization && (
              <InfoRow icon={<User size={14} />}    label="Specialization" value={user.specialization} />
            )}
            {user.doctorId && (
              <InfoRow icon={<ShieldCheck size={14} />} label="Doctor ID" value={user.doctorId} mono />
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, mono }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 0",
      borderBottom: "1px solid #f3f4f6",
    }}>
      <span style={{ color: "var(--teal)", display: "flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", width: 110, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: "var(--ink-1)", fontFamily: mono ? "var(--font-mono)" : "inherit", flex: 1 }}>
        {value || "—"}
      </span>
    </div>
  );
}
