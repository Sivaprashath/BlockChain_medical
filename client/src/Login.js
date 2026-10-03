import { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  ShieldCheck, Wallet, Camera, Lock, Mail, User, Phone, MapPin, Building2,
  Stethoscope, CheckCircle2, ArrowRight, Eye, EyeOff, KeyRound, RefreshCw,
  Database, FileCheck, Users
} from "lucide-react";

const API_URL = "http://localhost:5001/api/auth";
const PINATA_JWT = process.env.REACT_APP_PINATA_JWT;

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu",
  "Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Delhi","Puducherry","Jammu and Kashmir","Ladakh",
];

function Login({ onLoginSuccess }) {
  const [screen, setScreen] = useState("login"); // login | register | otp
  const [regStep, setRegStep] = useState(1);     // 1 | 2 | 3

  // Login fields
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);

  // Register fields
  const [name, setName]                       = useState("");
  const [role, setRole]                       = useState("patient");
  const [walletAddress, setWalletAddress]     = useState("");
  const [dob, setDob]                         = useState("");
  const [city, setCity]                       = useState("");
  const [state, setState]                     = useState("");
  const [mobileNumber, setMobileNumber]       = useState("");
  const [altMobile, setAltMobile]             = useState("");
  const [hospitalName, setHospitalName]       = useState("");
  const [specialization, setSpecialization]   = useState("");
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [profilePictureHash, setProfilePictureHash] = useState("");
  const [uploadingPic, setUploadingPic]       = useState(false);

  // OTP — 6 individual boxes
  const [otp, setOtp]               = useState(["", "", "", "", "", ""]);
  const [pendingEmail, setPendingEmail] = useState("");
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  const [errors, setErrors]       = useState({});
  const [message, setMessage]     = useState("");
  const [messageType, setMsgType] = useState("");
  const [loading, setLoading]     = useState(false);

  const setStatus = (msg, type) => { setMessage(msg); setMsgType(type); };
  const resetMessages = () => { setMessage(""); setMsgType(""); };

  // ── OTP box handlers ─────────────────────────────────────────────────────
  const handleOtpChange = (index, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) otpRefs[index + 1].current?.focus();
  };
  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };
  const otpString = otp.join("");

  // ── Wallet ────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (!window.ethereum) { setStatus("MetaMask is not installed.", "error"); return; }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
      setStatus("Wallet connected ✓", "success");
    } catch {
      setStatus("Wallet connection cancelled.", "error");
    }
  };

  // ── Profile pic ───────────────────────────────────────────────────────────
  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProfilePicPreview(URL.createObjectURL(file));
    try {
      setUploadingPic(true);
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", fd, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${PINATA_JWT}` },
      });
      setProfilePictureHash(res.data.IpfsHash);
    } catch { setStatus("Profile picture upload failed.", "error"); }
    finally { setUploadingPic(false); }
  };

  // ── Validate step ─────────────────────────────────────────────────────────
  const validateStep = () => {
    const e = {};
    if (regStep === 1) {
      if (!name.trim()) e.name = "Full name is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email.";
      if (password.length < 6) e.password = "Min 6 characters.";
      if (!dob) e.dob = "Date of birth is required.";
    }
    if (regStep === 2) {
      if (!city.trim()) e.city = "City is required.";
      if (!state) e.state = "Select a state.";
      if (!/^[0-9]{10}$/.test(mobileNumber)) e.mobileNumber = "Enter a valid 10-digit number.";
      if (altMobile && !/^[0-9]{10}$/.test(altMobile)) e.altMobile = "Must be 10 digits.";
      if (role === "doctor" && !hospitalName.trim()) e.hospitalName = "Hospital name required.";
    }
    if (regStep === 3) {
      if (!walletAddress) e.walletAddress = "Connect your MetaMask wallet.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const nextStep = () => { if (validateStep()) setRegStep(s => s + 1); };
  const prevStep = () => { setRegStep(s => s - 1); resetMessages(); };

  // ── Register ──────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!validateStep()) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/register`, {
        name, email, password, role, walletAddress,
        dob, city, state, mobileNumber,
        alternateMobileNumber: altMobile,
        profilePictureHash, hospitalName, specialization,
      });
      setPendingEmail(email);
      setOtp(["","","","","",""]);
      setScreen("otp");
    } catch (err) {
      const msg = err.response?.data?.error 
        ? `${err.response.data.message}: ${err.response.data.error}`
        : (err.response?.data?.message || "Registration failed.");
      setStatus(msg, "error");
    } finally { setLoading(false); }
  };

  // ── OTP verify ────────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otpString.length !== 6) { setStatus("Enter the full 6-digit code.", "error"); return; }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/verify-otp`, { email: pendingEmail, otp: otpString });
      setStatus("Account verified! You can now log in.", "success");
      setTimeout(() => { setScreen("login"); setEmail(pendingEmail); setPassword(""); resetMessages(); }, 1200);
    } catch (err) {
      setStatus(err.response?.data?.message || "Verification failed.", "error");
    } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    try {
      await axios.post(`${API_URL}/resend-otp`, { email: pendingEmail });
      setStatus("New OTP sent to your email.", "success");
    } catch (err) { setStatus(err.response?.data?.message || "Failed.", "error"); }
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    resetMessages();
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/login`, { email, password });
      const { token, user } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      onLoginSuccess(user, token);
    } catch (err) {
      setStatus(err.response?.data?.message || "Login failed.", "error");
    } finally { setLoading(false); }
  };

  // ── LEFT PANEL (shared across screens) ───────────────────────────────────
  const LeftPanel = () => (
    <div className="auth-left">
      <div className="auth-brand">
        <div className="auth-brand-mark">
          <ShieldCheck size={26} color="#020c18" />
        </div>
        <div className="auth-brand-name">MediChain</div>
        <div className="auth-brand-tagline">Blockchain-powered medical records</div>
      </div>
      <div className="auth-features">
        <div className="auth-feature">
          <div className="auth-feature-icon"><Database size={18} /></div>
          <div>
            <div className="auth-feature-title">Decentralised Storage</div>
            <div className="auth-feature-desc">Your records are stored on IPFS — immutable, censorship-resistant, always accessible.</div>
          </div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature-icon"><Lock size={18} /></div>
          <div>
            <div className="auth-feature-title">Access Control on Chain</div>
            <div className="auth-feature-desc">Only doctors you explicitly authorise can view your medical history.</div>
          </div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature-icon"><FileCheck size={18} /></div>
          <div>
            <div className="auth-feature-title">Tamper-Proof Verification</div>
            <div className="auth-feature-desc">Every record is hash-verified on-chain — no one can alter your medical data.</div>
          </div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature-icon"><Users size={18} /></div>
          <div>
            <div className="auth-feature-title">Patients, Doctors & Hospitals</div>
            <div className="auth-feature-desc">Role-based dashboards tailored for every stakeholder in the healthcare system.</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════════ OTP SCREEN ════════════════════
  if (screen === "otp") {
    return (
      <div className="auth-shell">
        <LeftPanel />
        <div className="auth-right">
          <div className="auth-card">
            <span className="auth-eyebrow">Step 3 of 3 — Email Verification</span>
            <h1 className="auth-title">Enter your OTP</h1>
            <p className="otp-hint">We sent a 6-digit code to <strong style={{ color: "var(--teal)" }}>{pendingEmail}</strong></p>

            <div className="otp-boxes">
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={otpRefs[i]}
                  className="otp-box"
                  type="text"
                  maxLength={1}
                  value={d}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  onFocus={e => e.target.select()}
                />
              ))}
            </div>

            <button className="btn btn-primary btn-block" onClick={handleVerifyOtp} disabled={loading}>
              {loading ? "Verifying…" : <><CheckCircle2 size={16} /> Verify & Continue</>}
            </button>

            <p className="otp-resend">
              Didn't receive the code?{" "}
              <span className="auth-toggle-link" onClick={handleResendOtp}>
                <RefreshCw size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />Resend OTP
              </span>
            </p>

            {message && <div className={`status-banner ${messageType}`}>{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════ LOGIN SCREEN ════════════════════
  if (screen === "login") {
    return (
      <div className="auth-shell">
        <LeftPanel />
        <div className="auth-right">
          <div className="auth-card">
            <span className="auth-eyebrow">Secured by Blockchain</span>
            <h1 className="auth-title">Welcome back</h1>

            <div className="field">
              <label className="field-label">Email address</label>
              <div style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                <input
                  className="input" type="email"
                  placeholder="you@example.com"
                  style={{ paddingLeft: 36 }}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Password</label>
              <div style={{ position: "relative" }}>
                <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                <input
                  className="input" type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex" }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button className="btn btn-primary btn-block" onClick={handleLogin} disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Logging in…" : <><ArrowRight size={16} /> Log in</>}
            </button>

            <p className="auth-toggle">
              Don't have an account?{" "}
              <span className="auth-toggle-link" onClick={() => { resetMessages(); setRegStep(1); setScreen("register"); }}>
                Create account
              </span>
            </p>

            {message && <div className={`status-banner ${messageType}`}>{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════ REGISTER SCREEN ════════════════════
  const stepLabels = ["Personal Info", "Location & Role", "Wallet & Review"];

  return (
    <div className="auth-shell">
      <LeftPanel />
      <div className="auth-right">
        <div className="auth-card auth-card-wide">
          <span className="auth-eyebrow">Step {regStep} of 3 — {stepLabels[regStep - 1]}</span>
          <h1 className="auth-title" style={{ marginBottom: 12 }}>Create account</h1>

          {/* Step indicator */}
          <div className="auth-steps">
            {[1, 2, 3].map((s, i) => (
              <>
                <div key={s} className={`auth-step-dot ${regStep > s ? "done" : regStep === s ? "active" : ""}`} />
                {i < 2 && <div className="auth-step-line" />}
              </>
            ))}
          </div>

          {/* ── STEP 1: Personal info ── */}
          {regStep === 1 && (
            <>
              <div className="avatar-upload">
                <div className="avatar-preview" style={{ cursor: "pointer" }} onClick={() => document.getElementById("avatar-input").click()}>
                  {profilePicPreview
                    ? <img src={profilePicPreview} alt="Preview" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                    : <Camera size={22} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>Profile photo</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{uploadingPic ? "Uploading to IPFS…" : "Click avatar to upload (optional)"}</div>
                  <input id="avatar-input" type="file" accept="image/*" style={{ display: "none" }} onChange={handleProfilePicChange} />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Full name</label>
                <div style={{ position: "relative" }}>
                  <User size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                  <input className="input" type="text" style={{ paddingLeft: 36 }} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                </div>
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="field-label">Email</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                  {errors.email && <p className="field-error">{errors.email}</p>}
                </div>
                <div className="field">
                  <label className="field-label">Date of birth</label>
                  <input className="input" type="date" value={dob} onChange={e => setDob(e.target.value)} />
                  {errors.dob && <p className="field-error">{errors.dob}</p>}
                </div>
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <div style={{ position: "relative" }}>
                  <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                  <input
                    className="input" type={showPw ? "text" : "password"}
                    style={{ paddingLeft: 36, paddingRight: 40 }}
                    placeholder="Min. 6 characters"
                    value={password} onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex" }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="field-error">{errors.password}</p>}
              </div>
            </>
          )}

          {/* ── STEP 2: Location & Role ── */}
          {regStep === 2 && (
            <>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Role</label>
                  <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                    <option value="hospital">Hospital</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">City</label>
                  <div style={{ position: "relative" }}>
                    <MapPin size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                    <input className="input" type="text" style={{ paddingLeft: 36 }} value={city} onChange={e => setCity(e.target.value)} placeholder="Your city" />
                  </div>
                  {errors.city && <p className="field-error">{errors.city}</p>}
                </div>
              </div>

              <div className="field">
                <label className="field-label">State</label>
                <select className="input" value={state} onChange={e => setState(e.target.value)}>
                  <option value="">Select state</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.state && <p className="field-error">{errors.state}</p>}
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="field-label">Mobile number</label>
                  <div style={{ position: "relative" }}>
                    <Phone size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                    <input className="input" type="tel" maxLength={10} style={{ paddingLeft: 36 }} value={mobileNumber} onChange={e => setMobileNumber(e.target.value.replace(/\D/g, ""))} placeholder="10-digit number" />
                  </div>
                  {errors.mobileNumber && <p className="field-error">{errors.mobileNumber}</p>}
                </div>
                <div className="field">
                  <label className="field-label">Alternate mobile <span style={{ color: "var(--ink-4)", fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                  <input className="input" type="tel" maxLength={10} value={altMobile} onChange={e => setAltMobile(e.target.value.replace(/\D/g, ""))} placeholder="Optional" />
                  {errors.altMobile && <p className="field-error">{errors.altMobile}</p>}
                </div>
              </div>

              {role === "doctor" && (
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Hospital name</label>
                    <div style={{ position: "relative" }}>
                      <Building2 size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                      <input className="input" type="text" style={{ paddingLeft: 36 }} placeholder="e.g. Apollo Hospitals" value={hospitalName} onChange={e => setHospitalName(e.target.value)} />
                    </div>
                    {errors.hospitalName && <p className="field-error">{errors.hospitalName}</p>}
                  </div>
                  <div className="field">
                    <label className="field-label">Specialization</label>
                    <div style={{ position: "relative" }}>
                      <Stethoscope size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
                      <input className="input" type="text" style={{ paddingLeft: 36 }} placeholder="e.g. Cardiologist" value={specialization} onChange={e => setSpecialization(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 3: Wallet ── */}
          {regStep === 3 && (
            <>
              <div style={{ marginBottom: 20, padding: "16px", background: "var(--bg-card)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Review your details</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
                  <div><span style={{ color: "var(--ink-4)" }}>Name:</span> <strong style={{ color: "var(--ink-1)" }}>{name}</strong></div>
                  <div><span style={{ color: "var(--ink-4)" }}>Email:</span> {email}</div>
                  <div><span style={{ color: "var(--ink-4)" }}>Role:</span> <span className="chip chip-teal" style={{ marginLeft: 4 }}>{role}</span></div>
                  <div><span style={{ color: "var(--ink-4)" }}>Location:</span> {city}, {state}</div>
                  {role === "doctor" && <div><span style={{ color: "var(--ink-4)" }}>Hospital:</span> {hospitalName}</div>}
                </div>
              </div>

              <div className="field">
                <label className="field-label">MetaMask Wallet</label>
                <button
                  type="button"
                  className={`wallet-connect-btn ${walletAddress ? "connected" : ""}`}
                  onClick={connectWallet}
                >
                  <Wallet size={16} />
                  {walletAddress
                    ? <><CheckCircle2 size={14} /> {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</>
                    : "Connect MetaMask Wallet"}
                </button>
                {errors.walletAddress && <p className="field-error">{errors.walletAddress}</p>}
                <p className="field-hint">Your wallet address is stored publicly to enable blockchain interactions.</p>
              </div>
            </>
          )}

          {message && <div className={`status-banner ${messageType}`}>{message}</div>}

          {/* Navigation buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            {regStep > 1 && (
              <button className="btn btn-outline" onClick={prevStep} style={{ flex: 1 }}>
                Back
              </button>
            )}
            {regStep < 3 ? (
              <button className="btn btn-primary" onClick={nextStep} style={{ flex: 2 }}>
                Continue <ArrowRight size={15} />
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleRegister} disabled={loading} style={{ flex: 2 }}>
                {loading ? "Creating account…" : <><CheckCircle2 size={15} /> Create account</>}
              </button>
            )}
          </div>

          <p className="auth-toggle">
            Already have an account?{" "}
            <span className="auth-toggle-link" onClick={() => { resetMessages(); setScreen("login"); }}>
              Log in
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;