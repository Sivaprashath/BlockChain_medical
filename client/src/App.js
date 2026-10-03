import { useState, useEffect } from "react";
import {
  ShieldCheck, LogOut, LayoutDashboard, FileText, Users,
  User, ChevronRight, ClipboardList, Fingerprint, UploadCloud
} from "lucide-react";
import Login from "./Login";
import PatientDashboard from "./PatientDashboard";
import DoctorDashboard from "./DoctorDashboard";
import HospitalDashboard from "./HospitalDashboard";
import ProfilePage from "./ProfilePage";
import AuditLog from "./AuditLog";
import FingerprintSettings from "./FingerprintSettings";
import "./App.css";

/* ── Stethoscope fallback (not in lucide default export) ── */
function Stethoscope({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

const NAV_ITEMS = {
  patient: [
    { id: "dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { id: "records",    label: "My Records",         icon: FileText },
    { id: "access",     label: "Doctor Access",      icon: Users },
    { id: "biometrics", label: "Fingerprint Access", icon: Fingerprint },
    { id: "audit",      label: "Audit Log",          icon: ClipboardList },
    { id: "profile",    label: "My Profile",         icon: User },
  ],
  doctor: [
    { id: "dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { id: "records",    label: "Patient Records",    icon: FileText },
    { id: "upload",     label: "Upload for Patient", icon: UploadCloud },
    { id: "audit",      label: "Audit Log",          icon: ClipboardList },
    { id: "profile",    label: "My Profile",         icon: User },
  ],
  hospital: [
    { id: "dashboard",  label: "Dashboard",          icon: LayoutDashboard },
    { id: "doctors",    label: "Our Doctors",        icon: Stethoscope },
    { id: "audit",      label: "Audit Log",          icon: ClipboardList },
    { id: "profile",    label: "My Profile",         icon: User },
  ],
};

const PAGE_TITLES = {
  dashboard:  "Dashboard",
  records:    "Records",
  access:     "Doctor Access",
  biometrics: "Fingerprint & Guardian Access",
  upload:     "Upload for Patient",
  doctors:    "Our Doctors",
  audit:      "Audit Log",
  profile:    "My Profile",
};

function App() {
  const [user, setUser]           = useState(null);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [walletAddress, setWalletAddress] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      try { setUser(JSON.parse(saved)); }
      catch { localStorage.removeItem("user"); }
    }
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setActiveNav("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setWalletAddress(null);
    setActiveNav("dashboard");
  };

  const handleProfileUpdate = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  };

  if (!user) return <Login onLoginSuccess={handleLoginSuccess} />;

  const navItems  = NAV_ITEMS[user.role] || NAV_ITEMS.patient;
  const pageTitle = PAGE_TITLES[activeNav] || "Dashboard";

  return (
    <div className="App">
      <div className="app-layout">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-mark">
              <ShieldCheck size={18} color="#ffffff" />
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">MediChain</span>
              <span className="sidebar-brand-sub">Blockchain Records</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section-label">Navigation</div>
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`nav-${id}`}
                className={`nav-item ${activeNav === id ? "active" : ""}`}
                onClick={() => setActiveNav(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            {/* User chip */}
            <div className="sidebar-user">
              {user.profilePictureHash ? (
                <img
                  className="sidebar-avatar"
                  src={"https://gateway.pinata.cloud/ipfs/" + user.profilePictureHash}
                  alt={user.name}
                />
              ) : (
                <div className="sidebar-avatar-fallback">
                  {user.name ? user.name.charAt(0).toUpperCase() : "?"}
                </div>
              )}
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-role">{user.role}</div>
              </div>
            </div>

            <button
              id="nav-logout"
              className="nav-item"
              onClick={handleLogout}
              style={{ color: "var(--danger)", marginTop: 4 }}
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="main-area">

          {/* ── Top header ── */}
          <header className="topbar">
            <div className="topbar-breadcrumb">
              <span>MediChain</span>
              <ChevronRight size={14} />
              <span className="topbar-breadcrumb-active">{pageTitle}</span>
            </div>
            <div className="topbar-right">
              {/* Wallet indicator */}
              <div className={`wallet-status-pill ${walletAddress ? "connected" : ""}`}>
                <div className={`wallet-dot ${walletAddress ? "active" : ""}`} />
                {walletAddress
                  ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                  : "No wallet"}
              </div>

              {/* Profile quick-access */}
              <button
                className="btn btn-outline btn-icon btn-sm"
                title="My Profile"
                onClick={() => setActiveNav("profile")}
                id="topbar-profile-btn"
              >
                <User size={15} />
              </button>

              <button
                id="topbar-logout-btn"
                className="btn btn-outline btn-sm"
                onClick={handleLogout}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          </header>

          {/* ── Dashboard content ── */}
          <main className="page-content">

            {/* Profile page — all roles */}
            {activeNav === "profile" && (
              <ProfilePage
                user={user}
                onUpdate={handleProfileUpdate}
              />
            )}

            {/* Audit Log — all roles */}
            {activeNav === "audit" && (
              <AuditLog
                user={user}
                onWalletConnect={setWalletAddress}
              />
            )}

            {/* Biometrics Settings — Patient role */}
            {activeNav === "biometrics" && user.role === "patient" && (
              <FingerprintSettings
                user={user}
              />
            )}

            {/* Role dashboards */}
            {activeNav !== "profile" && activeNav !== "audit" && activeNav !== "biometrics" && user.role === "patient" && (
              <PatientDashboard
                user={user}
                activeTab={activeNav}
                onWalletConnect={setWalletAddress}
              />
            )}
            {activeNav !== "profile" && activeNav !== "audit" && user.role === "doctor" && (
              <DoctorDashboard
                user={user}
                activeTab={activeNav}
                onWalletConnect={setWalletAddress}
              />
            )}
            {activeNav !== "profile" && activeNav !== "audit" && user.role === "hospital" && (
              <HospitalDashboard
                user={user}
                activeTab={activeNav}
              />
            )}

          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
