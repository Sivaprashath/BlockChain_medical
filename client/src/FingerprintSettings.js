import React, { useState, useEffect } from "react";
import axios from "axios";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import {
  Fingerprint,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  HeartHandshake,
  UserCheck,
  KeyRound,
  Info
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
  const [message, setMessage] = useState(null); // { type: 'success' | 'error' | 'info', text: '' }
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

  const handleRegister = async (type) => {
    try {
      setMessage({ type: "info", text: `Preparing ${type === "guardian" ? "Guardian" : "Patient"} fingerprint registration…` });
      
      const isGuardian = type === "guardian";
      if (isGuardian && !guardianInputName.trim()) {
        setMessage({ type: "error", text: "Please enter the Guardian's Name & Relationship (e.g. 'Jane Doe (Spouse)')." });
        return;
      }

      // 1. Get registration options from server
      const optRes = await axios.post(
        `${API_BASE}/register/options`,
        {
          type,
          guardianName: isGuardian ? guardianInputName.trim() : undefined,
          deviceName: isGuardian ? "Guardian Touch ID / Sensor" : "Patient Touch ID / Sensor",
        },
        { headers }
      );

      setMessage({ type: "info", text: "Touch ID / Fingerprint sensor activated! Place finger on sensor now…" });

      // 2. Pass options to browser WebAuthn authenticator
      let regResponse;
      try {
        regResponse = await startRegistration({ optionsJSON: optRes.data });
      } catch (authError) {
        // If user cancelled or device lacks hardware sensor
        console.warn("Hardware WebAuthn prompt error:", authError);
        setMessage({
          type: "error",
          text: authError.name === "NotAllowedError"
            ? "Biometric scan cancelled or timed out."
            : `Biometric sensor error: ${authError.message}. Make sure Touch ID / fingerprint is set up in your system.`
        });
        return;
      }

      // 3. Send response back to server for verification
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
        text: `✅ ${verifyRes.data.message || "Fingerprint registered successfully!"}`,
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

  // Test scanning to see if patient or guardian matches
  const handleTestScan = async () => {
    try {
      setTestingAuth(true);
      setTestResult(null);
      setMessage({ type: "info", text: "Requesting biometric challenge from server…" });

      const optRes = await axios.post(`${API_BASE}/auth/options`, {
        patientQuery: user.email,
      });

      if (!optRes.data.hasBiometrics) {
        setMessage({ type: "error", text: "No fingerprints registered yet to test!" });
        setTestingAuth(false);
        return;
      }

      setMessage({ type: "info", text: "Place any registered finger on the sensor (Patient or Guardian)…" });

      const authResponse = await startAuthentication({ optionsJSON: optRes.data.options });

      const verifyRes = await axios.post(`${API_BASE}/auth/verify`, {
        patientQuery: user.email,
        response: authResponse,
      });

      setTestResult(verifyRes.data);
      setMessage({
        type: "success",
        text: `🎉 Verification Success! Recognized as: ${verifyRes.data.authorizedBy}`,
      });
    } catch (err) {
      console.error("Test scan error:", err);
      setMessage({
        type: "error",
        text: err.response?.data?.message || err.message || "Biometric authentication failed",
      });
    } finally {
      setTestingAuth(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <div className="page-header">
        <h1 className="page-title">Biometric Access & Emergency Guardian</h1>
        <p className="page-subtitle">
          Configure two-party biometric authorization for doctors accessing your on-chain medical records.
        </p>
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
            <X size={15} />
          </button>
        </div>
      )}

      {/* Explanatory Banner */}
      <div
        className="card"
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(16, 185, 129, 0.05) 100%)",
          borderColor: "rgba(99, 102, 241, 0.2)",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(99, 102, 241, 0.15)",
              color: "var(--teal)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-1)", marginBottom: 4 }}>
              Dual Biometric Security Protocol
            </h3>
            <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              Doctors must obtain a biometric fingerprint scan before viewing your medical history. MediChain stores{" "}
              <strong>two distinct biometric credentials</strong>: your primary fingerprint and a designated guardian’s
              fingerprint (e.g., spouse or parent). If you are injured, incapacitated, or under treatment, your guardian can
              scan their fingerprint to securely unlock access for the doctor.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* 1. Primary Patient Fingerprint */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="icon-chip">
                <Fingerprint size={18} />
              </div>
              <div className="card-header-text">
                <h3 className="card-title">Patient Fingerprint</h3>
                <p className="card-subtitle">Your primary Touch ID / biometric sensor</p>
              </div>
            </div>

            <div style={{ margin: "16px 0", padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "var(--bg-base)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase" }}>Status</span>
                {status.hasPatientFingerprint ? (
                  <span className="chip chip-teal" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={12} /> Registered
                  </span>
                ) : (
                  <span className="chip" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#b45309" }}>
                    Not Configured
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {status.hasPatientFingerprint ? (
                  <div>
                    <strong>Sensor:</strong> {status.patientDeviceName || "Touch ID / Built-in Sensor"}
                  </div>
                ) : (
                  <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
                    No fingerprint registered for your patient profile yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => handleRegister("patient")}
              disabled={loading}
            >
              <Fingerprint size={16} />
              {status.hasPatientFingerprint ? "Update Fingerprint" : "Register Fingerprint"}
            </button>
            {status.hasPatientFingerprint && (
              <button
                className="btn btn-outline"
                style={{ color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => handleRemove("patient")}
                title="Remove primary fingerprint"
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
              <div className="icon-chip gold">
                <HeartHandshake size={18} />
              </div>
              <div className="card-header-text">
                <h3 className="card-title">Guardian Fingerprint</h3>
                <p className="card-subtitle">Backup access if you are injured or unable to scan</p>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label">Guardian Name & Relationship</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Sarah Doe (Wife) or Robert (Parent)"
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
                    Not Configured
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {status.hasGuardianFingerprint ? (
                  <div>
                    <strong>Authorized:</strong> {status.guardianName || "Designated Guardian"}
                  </div>
                ) : (
                  <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
                    No guardian fingerprint registered. Add one to enable emergency authorization.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1, borderColor: "var(--gold)", color: "#b45309" }}
              onClick={() => handleRegister("guardian")}
              disabled={loading || !guardianInputName.trim()}
            >
              <UserCheck size={16} />
              {status.hasGuardianFingerprint ? "Update Guardian Sensor" : "Register Guardian Fingerprint"}
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

      {/* Live Biometric Test & Verification Card */}
      <div className="card">
        <div className="card-header">
          <div className="icon-chip" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
            <KeyRound size={18} />
          </div>
          <div className="card-header-text">
            <h3 className="card-title">Test Biometric Authentication</h3>
            <p className="card-subtitle">
              Verify that either fingerprint credential (Patient or Guardian) is recognized properly by WebAuthn.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Click below to initiate a live biometric scan. Touch the sensor with either your finger or your guardian’s
            finger. The system will automatically detect which credential authorized the request.
          </div>
          <button
            className="btn btn-primary"
            onClick={handleTestScan}
            disabled={testingAuth || (!status.hasPatientFingerprint && !status.hasGuardianFingerprint)}
          >
            <Fingerprint size={16} />
            {testingAuth ? "Scanning…" : "Test Biometric Scan"}
          </button>
        </div>

        {testResult && (
          <div
            style={{
              marginTop: 16,
              padding: "14px 18px",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <CheckCircle2 size={24} color="#10b981" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#065f46" }}>
                Authentication Successful: {testResult.authorizedBy}
              </div>
              <div style={{ fontSize: 12, color: "#047857", marginTop: 2 }}>
                Matched Credential Role: <strong>{testResult.signerType?.toUpperCase()}</strong> • Timestamp:{" "}
                {new Date(testResult.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
