import React, { useState, useEffect } from "react";
import axios from "axios";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import {
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  Trash2,
  HeartHandshake,
  UserCheck,
  KeyRound,
  Info,
  User,
} from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL?.replace("/api/auth", "/api/fingerprint") || "http://localhost:5001/api/fingerprint";

export default function FingerprintSettings({ user }) {
  const [status, setStatus] = useState({
    hasPatientFingerprint: false,
    patientDeviceName: "",
    hasGuardianFingerprint: false,
    guardianName: "",
    guardianDeviceName: "",
  });
  const [loading, setLoading] = useState(true);
  const [guardianInputName, setGuardianInputName] = useState("");
  const [message, setMessage] = useState(null);
  const [testingAuth, setTestingAuth] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/status`, { headers });
      setStatus(res.data);
      if (res.data.guardianName) {
        setGuardianInputName(res.data.guardianName);
      }
    } catch (err) {
      console.error("Failed to load fingerprint status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // 1. Hardware Fingerprint Registration (WebAuthn / Touch ID)
  // Prompts the operating system to ask for the finger on the sensor!
  const handleRegister = async (type) => {
    try {
      const isGuardian = type === "guardian";
      if (isGuardian && !guardianInputName.trim()) {
        setMessage({
          type: "error",
          text: "Please enter the Guardian's Name & Relationship (e.g. 'Sarah (Wife)' or 'Robert (Parent)').",
        });
        return;
      }

      setMessage({
        type: "info",
        text: `Fingerprint sensor activating… Please place your finger on the sensor when prompted.`,
      });

      // 1. Fetch challenge & options from backend
      const optRes = await axios.post(
        `${API_BASE}/register/options`,
        {
          type,
          guardianName: isGuardian ? guardianInputName.trim() : undefined,
          deviceName: isGuardian ? "Guardian Touch ID / Sensor" : "Patient Touch ID / Sensor",
        },
        { headers }
      );

      // 2. Browser/OS prompts the user to place finger on sensor
      let regResponse;
      try {
        regResponse = await startRegistration({ optionsJSON: optRes.data });
      } catch (authError) {
        console.warn("Hardware sensor prompt error:", authError);
        setMessage({
          type: "error",
          text:
            authError.name === "NotAllowedError"
              ? "Biometric scan cancelled. To scan, touch the fingerprint sensor when the prompt appears."
              : `Biometric sensor error: ${authError.message}. Ensure Touch ID or fingerprint sensor is set up.`,
        });
        return;
      }

      // 3. Send biometric credential back to server for verification & recording
      const verifyRes = await axios.post(
        `${API_BASE}/register/verify`,
        {
          type,
          response: regResponse,
          guardianName: isGuardian ? guardianInputName.trim() : undefined,
          deviceName: isGuardian ? "Guardian Touch ID / Sensor" : "Patient Touch ID / Sensor",
        },
        { headers }
      );

      setMessage({
        type: "success",
        text: `🎉 ${verifyRes.data.message || "Fingerprint scanned and recorded successfully!"}`,
      });

      await loadStatus();
    } catch (err) {
      console.error("Registration error:", err);
      setMessage({
        type: "error",
        text: err.response?.data?.message || err.message || "Failed to register fingerprint",
      });
    }
  };

  // 2. Remove Fingerprint
  const handleRemove = async (type) => {
    if (!window.confirm(`Are you sure you want to remove the ${type === "guardian" ? "guardian" : "primary"} fingerprint?`)) {
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/remove`, { type }, { headers });
      setMessage({ type: "success", text: res.data.message });
      if (type === "guardian") {
        setGuardianInputName("");
      }
      await loadStatus();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.message || err.message });
    }
  };

  // 3. Test Fingerprint Scan (Prompts OS for finger)
  const handleTestScan = async () => {
    try {
      setTestingAuth(true);
      setTestResult(null);
      setMessage({ type: "info", text: "Sensor active! Place your registered finger on the sensor…" });

      const optRes = await axios.post(`${API_BASE}/auth/options`, {
        patientQuery: user.email,
      });

      if (!optRes.data.hasBiometrics) {
        setMessage({ type: "error", text: "No fingerprints registered yet to test!" });
        setTestingAuth(false);
        return;
      }

      // Trigger OS biometric prompt
      const authResp = await startAuthentication({ optionsJSON: optRes.data.options });

      // Verify with backend
      const verifyRes = await axios.post(`${API_BASE}/auth/verify`, {
        patientQuery: user.email,
        response: authResp,
      });

      setTestResult(verifyRes.data);
      setMessage({
        type: "success",
        text: `✅ Recognized & Verified: ${verifyRes.data.authorizedBy}!`,
      });
    } catch (err) {
      console.warn("Test scan error:", err);
      if (err.name === "NotAllowedError") {
        setMessage({ type: "error", text: "Scan cancelled. Please place your registered finger on the sensor." });
      } else {
        setMessage({
          type: "error",
          text: err.response?.data?.message || err.message || "Fingerprint verification failed.",
        });
      }
    } finally {
      setTestingAuth(false);
    }
  };

  // 4. Quick Simulation Test (Optional for instant testing)
  const handleSimulateTest = async (approvedBy) => {
    try {
      setTestingAuth(true);
      setTestResult(null);
      const res = await axios.post(`${API_BASE}/auth/simulate`, {
        patientQuery: user.email,
        approvedBy,
      });
      setTestResult(res.data);
      setMessage({
        type: "success",
        text: `✅ ${res.data.authorizedBy} authorized successfully!`,
      });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.message || err.message });
    } finally {
      setTestingAuth(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <div className="page-header">
        <h1 className="page-title">Biometric Fingerprint Authentication</h1>
        <p className="page-subtitle">
          Secure your medical records on blockchain using hardware biometric authentication.
        </p>
      </div>

      {/* Helpful Tip about macOS Multi-Finger Setup */}
      <div
        style={{
          marginBottom: 20,
          padding: "14px 18px",
          borderRadius: "var(--radius-md)",
          background: "rgba(14, 165, 233, 0.08)",
          border: "1px solid rgba(14, 165, 233, 0.25)",
          color: "#0369a1",
          fontSize: 13,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          lineHeight: 1.5,
        }}
      >
        <Info size={20} color="#0284c7" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>How to use ANY finger or another person's finger on Mac:</strong>
          <div style={{ marginTop: 3 }}>
            macOS Touch ID uses Apple's hardware Secure Enclave and verifies against the fingerprints enrolled in your Mac.
            To use any other finger (or a guardian / friend's finger), simply go to{" "}
            <strong>Mac System Settings ➔ Touch ID & Passcode ➔ click "Add Fingerprint"</strong>.
            Once enrolled on your Mac, whenever the browser asks for your fingerprint, you or your guardian can place that finger on the sensor and it will scan and record!
          </div>
        </div>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 18px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background:
              message.type === "success"
                ? "rgba(16, 185, 129, 0.12)"
                : message.type === "error"
                ? "rgba(239, 68, 68, 0.12)"
                : "rgba(99, 102, 241, 0.12)",
            border: `1px solid ${
              message.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : message.type === "error"
                ? "rgba(239, 68, 68, 0.3)"
                : "rgba(99, 102, 241, 0.3)"
            }`,
            color:
              message.type === "success"
                ? "#065f46"
                : message.type === "error"
                ? "#991b1b"
                : "#3730a3",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {message.type === "success" ? (
              <CheckCircle2 size={18} color="#10b981" />
            ) : message.type === "error" ? (
              <AlertCircle size={18} color="#ef4444" />
            ) : (
              <Info size={18} color="#6366f1" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Grid: Patient and Guardian Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, marginBottom: 24 }}>
        {/* 1. Patient Primary Fingerprint */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="icon-chip"><Fingerprint size={18} /></div>
              <div className="card-header-text">
                <h3 className="card-title">Patient Primary Fingerprint</h3>
                <p className="card-subtitle">Required for doctor record authorization</p>
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "var(--bg-base)", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase" }}>Status</span>
                {status.hasPatientFingerprint ? (
                  <span className="chip chip-teal" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={12} /> Registered & Active
                  </span>
                ) : (
                  <span className="chip" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#b45309" }}>
                    Not Registered
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {status.hasPatientFingerprint ? (
                  <div>
                    <strong>Sensor Device:</strong> {status.patientDeviceName || "Touch ID / Built-in Sensor"}
                  </div>
                ) : (
                  <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
                    No fingerprint registered yet. Click below to place your finger on the sensor.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => handleRegister("patient")}
              disabled={loading}
            >
              <Fingerprint size={16} />
              {status.hasPatientFingerprint ? "Scan & Update Fingerprint" : "Scan & Record Fingerprint"}
            </button>
            {status.hasPatientFingerprint && (
              <button
                className="btn btn-outline"
                style={{ color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => handleRemove("patient")}
                title="Remove fingerprint"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {/* 2. Guardian / Emergency Fingerprint */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="icon-chip gold"><HeartHandshake size={18} /></div>
              <div className="card-header-text">
                <h3 className="card-title">Guardian Fingerprint</h3>
                <p className="card-subtitle">Backup access if you are unconscious or injured</p>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label">Guardian Name & Relationship</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Sarah (Wife) or Robert (Father)"
                value={guardianInputName}
                onChange={(e) => setGuardianInputName(e.target.value)}
              />
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "var(--bg-base)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase" }}>Guardian Status</span>
                {status.hasGuardianFingerprint ? (
                  <span className="chip chip-teal" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={12} /> Registered
                  </span>
                ) : (
                  <span className="chip" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#b45309" }}>
                    Not Registered
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {status.hasGuardianFingerprint ? (
                  <div>
                    <strong>Authorized Person:</strong> {status.guardianName || "Designated Guardian"}
                  </div>
                ) : (
                  <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
                    Enter guardian's name and scan their finger on the sensor to enable backup access.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1, borderColor: "var(--gold)", color: "#b45309", justifyContent: "center" }}
              onClick={() => handleRegister("guardian")}
              disabled={loading || !guardianInputName.trim()}
            >
              <UserCheck size={16} />
              {status.hasGuardianFingerprint ? "Re-scan Guardian Finger" : "Scan & Record Guardian Finger"}
            </button>
            {status.hasGuardianFingerprint && (
              <button
                className="btn btn-outline"
                style={{ color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => handleRemove("guardian")}
                title="Remove guardian fingerprint"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Live Biometric Scanner Test & Verification */}
      <div className="card">
        <div className="card-header">
          <div className="icon-chip" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
            <KeyRound size={18} />
          </div>
          <div className="card-header-text">
            <h3 className="card-title">Test Biometric Authentication</h3>
            <p className="card-subtitle">
              Click below and place your finger on the sensor. The system will ask for your finger and detect whether it matches the Patient or Guardian.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 500 }}>
            Click <strong>"Test Biometric Scan"</strong> and touch the sensor when prompted. Your device will verify your fingerprint and report the authorized identity.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={handleTestScan}
              disabled={testingAuth || (!status.hasPatientFingerprint && !status.hasGuardianFingerprint)}
            >
              <Fingerprint size={16} />
              {testingAuth ? "Awaiting Finger…" : "Test Biometric Scan"}
            </button>

            {/* Quick Demo Test Buttons */}
            {status.hasPatientFingerprint && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => handleSimulateTest("patient")}
                disabled={testingAuth}
                title="Quick demo simulation"
              >
                <User size={13} /> Quick Test: Patient
              </button>
            )}
            {status.hasGuardianFingerprint && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ borderColor: "var(--gold)", color: "#b45309" }}
                onClick={() => handleSimulateTest("guardian")}
                disabled={testingAuth}
                title="Quick demo simulation"
              >
                <HeartHandshake size={13} /> Quick Test: Guardian
              </button>
            )}
          </div>
        </div>

        {testResult && (
          <div
            style={{
              marginTop: 16,
              padding: "14px 18px",
              background: testResult.error ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
              border: `1px solid ${testResult.error ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)"}`,
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {testResult.error ? <AlertCircle size={22} color="#ef4444" /> : <CheckCircle2 size={22} color="#10b981" />}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: testResult.error ? "#991b1b" : "#065f46" }}>
                {testResult.error ? "Verification Failed" : `Authenticated: ${testResult.authorizedBy}`}
              </div>
              <div style={{ fontSize: 12, color: testResult.error ? "#b91c1c" : "#047857", marginTop: 2 }}>
                {testResult.error
                  ? testResult.message
                  : `Role: ${testResult.signerType?.toUpperCase()} • Verified at ${new Date(testResult.timestamp).toLocaleTimeString()}`}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
