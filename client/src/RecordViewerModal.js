import React, { useState, useEffect } from "react";
import {
  ShieldCheck, ShieldAlert, Download,
  ExternalLink, Copy, Check, RefreshCw, AlertTriangle, X
} from "lucide-react";
import { verifyIntegrity, decryptMedicalFile, tamperBuffer, calculateSHA256 } from "./utils/cryptoUtils";

export default function RecordViewerModal({
  record,
  patientAddress,
  currentUserRole = "patient",
  contract = null,
  onClose,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Verification state
  const [ipfsCID, setIpfsCID] = useState("");
  const [expectedHash, setExpectedHash] = useState("");
  const [computedHash, setComputedHash] = useState("");
  const [integrityPassed, setIntegrityPassed] = useState(null);
  const [isSimulatedTamper, setIsSimulatedTamper] = useState(false);

  // Decryption state
  const [decryptedUrl, setDecryptedUrl] = useState(null);
  const [decryptedFileName, setDecryptedFileName] = useState("");
  const [rawEncryptedBuffer, setRawEncryptedBuffer] = useState(null);

  // On-chain logging state
  const [loggingOnChain, setLoggingOnChain] = useState(false);
  const [loggedOnChain, setLoggedOnChain] = useState(false);

  useEffect(() => {
    if (!record) return;

    // Handle both struct keys and array indices
    const cid = record.ipfsCID || record[0] || record.fileHash;
    const hash = record.fileHash || record[1] || record.ipfsCID;

    setIpfsCID(cid);
    setExpectedHash(hash);

    fetchAndVerify(cid, hash, false);

    return () => {
      if (decryptedUrl) URL.revokeObjectURL(decryptedUrl);
    };
  }, [record]);

  const fetchAndVerify = async (cid, targetExpectedHash, simulateTamper = false) => {
    setLoading(true);
    setError(null);
    setIntegrityPassed(null);
    setDecryptedUrl(null);
    setIsSimulatedTamper(simulateTamper);

    try {
      // 1. Fetch encrypted file Fenc from IPFS
      let buffer = rawEncryptedBuffer;
      if (!buffer) {
        const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
        const res = await fetch(gatewayUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch file from IPFS (${res.status} ${res.statusText})`);
        }
        buffer = await res.arrayBuffer();
        setRawEncryptedBuffer(buffer);
      }

      // If simulateTamper is active, corrupt the payload
      let testBuffer = buffer;
      if (simulateTamper) {
        testBuffer = tamperBuffer(buffer);
      }

      // 2. Compute HN = SHA-256(Fenc) (Equation 3 in paper)
      const actualHash = await calculateSHA256(testBuffer);
      setComputedHash(actualHash);

      // 3. Evaluate Integrity I(n) = (HN == H)
      const integrity = await verifyIntegrity(testBuffer, targetExpectedHash);
      setIntegrityPassed(integrity.passed);

      // 4. Evaluate Access Decision: R(u, n) = P(u, n) ∧ I(n)
      if (integrity.passed) {
        // Safe to decrypt with AES-256
        const dec = await decryptMedicalFile(
          testBuffer,
          patientAddress,
          targetExpectedHash,
          record.description || "medical_record.pdf",
          "application/pdf"
        );
        setDecryptedUrl(dec.objectUrl);
        setDecryptedFileName(dec.fileName);
      } else {
        // Refuse to decrypt!
        setDecryptedUrl(null);
      }
    } catch (err) {
      console.error("Verification error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTamper = () => {
    const nextTamperState = !isSimulatedTamper;
    fetchAndVerify(ipfsCID, expectedHash, nextTamperState);
  };

  const copyText = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleLogVerificationOnChain = async () => {
    if (!contract || !patientAddress || loggedOnChain) return;
    try {
      setLoggingOnChain(true);
      const tx = await contract.logIntegrityVerification(
        patientAddress,
        ipfsCID,
        expectedHash,
        integrityPassed === true
      );
      await tx.wait();
      setLoggedOnChain(true);
    } catch (err) {
      console.warn("Could not log on-chain:", err.message);
    } finally {
      setLoggingOnChain(false);
    }
  };

  if (!record) return null;

  const recordType = record.recordType || record[2] || "Medical Record";
  const date = record.timestamp ? new Date(Number(record.timestamp) * 1000).toLocaleString() : "Recent";

  return (
    <div className="modal-overlay" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      padding: 16
    }}>
      <div className="card" style={{
        maxWidth: 680, width: "100%", maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)", borderRadius: 16,
        border: "1px solid rgba(255, 255, 255, 0.15)", position: "relative"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span className="record-badge" style={{ fontSize: 12 }}>{recordType}</span>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>• {date}</span>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink-1)" }}>
              Cryptographic Integrity Verification & Decryption
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
              Paper Implementation: AES-256 Decryption with SHA-256 Integrity Verification
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ marginLeft: 12 }}>
            <X size={18} />
          </button>
        </div>

        {/* Paper Formula Banner */}
        <div style={{
          padding: "10px 14px", borderRadius: 10,
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6366f1" }}>
              Mathematical Security Decision (Eq. 2)
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "var(--ink-1)", marginTop: 2 }}>
              R(u, n) = P(u, n) ∧ I(n)
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="record-badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontSize: 11 }}>
              P(u, n) = 1 (Authorized)
            </span>
            <span className="record-badge" style={{
              background: integrityPassed ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: integrityPassed ? "#10b981" : "#ef4444", fontSize: 11
            }}>
              I(n) = {integrityPassed === null ? "..." : integrityPassed ? "1 (Valid)" : "0 (Tampered)"}
            </span>
          </div>
        </div>

        {/* Tamper Simulation Toggle for Reviewers/Demonstration */}
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: isSimulatedTamper ? "rgba(239, 68, 68, 0.08)" : "rgba(241, 245, 249, 0.6)",
          border: isSimulatedTamper ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border)",
          marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isSimulatedTamper ? "#ef4444" : "var(--ink-2)", display: "flex", alignItems: "center", gap: 6 }}>
              {isSimulatedTamper ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
              {isSimulatedTamper ? "Tampered Record Simulation Active" : "Testing Genuine Unmodified Record"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {isSimulatedTamper
                ? "Simulating bit corruption in IPFS ciphertext to test modification detection (Table II: 150 tampered records)."
                : "Downloads original ciphertext and verifies SHA-256 matches blockchain fingerprint."}
            </div>
          </div>
          <button
            className={`btn btn-sm ${isSimulatedTamper ? "btn-danger" : "btn-outline"}`}
            onClick={handleToggleTamper}
            disabled={loading}
            style={{ flexShrink: 0, fontSize: 12 }}
          >
            {isSimulatedTamper ? "Reset to Genuine" : "🧪 Simulate Tamper"}
          </button>
        </div>

        {/* Loading / Error states */}
        {loading && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <RefreshCw size={24} className="spin" style={{ color: "#6366f1", marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}>
              Retrieving encrypted file from IPFS & computing SHA-256 fingerprint…
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: 12, background: "rgba(239, 68, 68, 0.1)", borderRadius: 8, color: "#ef4444", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && (
          <>
            {/* Hash Comparison Box */}
            <div style={{
              background: "var(--bg-2, #f8fafc)", borderRadius: 12, padding: 14,
              border: "1px solid var(--border)", marginBottom: 16
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 10 }}>
                Cryptographic Fingerprint Verification (SHA-256)
              </div>

              {/* Blockchain Registered Hash */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginBottom: 3 }}>
                  <span>Registered On-Chain Hash (H)</span>
                  <button className="btn btn-ghost btn-icon" onClick={() => copyText(expectedHash, "h")} title="Copy">
                    {copiedField === "h" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <div style={{
                  fontFamily: "monospace", fontSize: 11, background: "rgba(0,0,0,0.03)",
                  padding: "6px 10px", borderRadius: 6, wordBreak: "break-all", color: "var(--ink-1)"
                }}>
                  {expectedHash || "0x..."}
                </div>
              </div>

              {/* Newly Computed Hash from IPFS File */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginBottom: 3 }}>
                  <span>Downloaded File Computed Hash (HN = SHA256(Fenc))</span>
                  <button className="btn btn-ghost btn-icon" onClick={() => copyText(computedHash, "hn")} title="Copy">
                    {copiedField === "hn" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <div style={{
                  fontFamily: "monospace", fontSize: 11,
                  background: integrityPassed ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                  border: integrityPassed ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                  padding: "6px 10px", borderRadius: 6, wordBreak: "break-all",
                  color: integrityPassed ? "#065f46" : "#b91c1c"
                }}>
                  {computedHash}
                </div>
              </div>
            </div>

            {/* Verdict Box */}
            {integrityPassed ? (
              <div style={{
                background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: 12, padding: 14, marginBottom: 16
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <ShieldCheck size={22} color="#10b981" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#065f46" }}>
                      Integrity Verification Passed (I(n) = 1)
                    </div>
                    <div style={{ fontSize: 12, color: "#047857" }}>
                      The downloaded encrypted file matches the immutable SHA-256 fingerprint on Ethereum blockchain.
                      AES-256 decryption completed safely.
                    </div>
                  </div>
                </div>

                {decryptedUrl && (
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <a className="btn btn-primary btn-sm" href={decryptedUrl} download={decryptedFileName || "decrypted_record"}>
                      <Download size={14} /> Download Decrypted Medical File
                    </a>
                    <a className="btn btn-outline btn-sm" href={decryptedUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} /> Open in New Tab
                    </a>
                    <a className="btn btn-ghost btn-sm" href={`https://gateway.pinata.cloud/ipfs/${ipfsCID}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      View Raw Encrypted IPFS Payload
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 12, padding: 14, marginBottom: 16
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <ShieldAlert size={22} color="#ef4444" />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#b91c1c" }}>
                      INTEGRITY REJECTED — Access Blocked (I(n) = 0)
                    </div>
                    <div style={{ fontSize: 12, color: "#dc2626" }}>
                      Critical Security Alert: The downloaded file has been altered or tampered with.
                      Per Equation 2 (R = P ∧ I), access is strictly denied and decryption is aborted to protect patient medical integrity.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Blockchain Audit Logging Button (Table IV) */}
            {contract && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                  Table IV: Blockchain Operation & Audit Trail
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleLogVerificationOnChain}
                  disabled={loggingOnChain || loggedOnChain}
                  style={{ fontSize: 11 }}
                >
                  {loggedOnChain ? "✅ Recorded On-Chain" : loggingOnChain ? "Recording..." : "Log Integrity Event on Blockchain"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
