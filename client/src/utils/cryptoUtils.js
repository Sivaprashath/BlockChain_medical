/**
 * Cryptographic Utility for Blockchain Medical Records
 * Implements:
 * 1. AES-256-GCM client-side file encryption before IPFS upload (Fenc)
 * 2. SHA-256 digest calculation: H = SHA256(Fenc) (Equation 1 & 3 from paper)
 * 3. SHA-256 integrity verification on download: I(n) = (HN == H)
 * 4. Access Decision evaluation: R(u, n) = P(u, n) ∧ I(n) (Equation 2 from paper)
 * 5. AES-256-GCM file decryption after integrity passes
 */

/* eslint-disable no-restricted-globals */
const getCrypto = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    return window.crypto;
  }
  if (typeof self !== "undefined" && self.crypto && self.crypto.subtle) {
    return self.crypto;
  }
  if (typeof global !== "undefined" && global.crypto && global.crypto.subtle) {
    return global.crypto;
  }
  throw new Error("Web Cryptography API is not supported in this environment");
};

/**
 * Convert ArrayBuffer to Hex String
 */
export function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert Hex String to Uint8Array
 */
export function hexToBuffer(hex) {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Calculate SHA-256 digest of an ArrayBuffer
 * Returns lowercase hex string (without 0x prefix)
 */
export async function calculateSHA256(arrayBuffer) {
  const crypto = getCrypto();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return bufferToHex(hashBuffer);
}

/**
 * Derive AES-256 key from patient wallet address + salt
 */
export async function deriveAESKey(patientAddress) {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const salt = enc.encode("MedicalRecord-Secure-AES256-Salt-v1");
  const rawKeyMaterial = enc.encode((patientAddress || "global-medical-secure").toLowerCase());

  // Hash key material with SHA-256 to ensure exact 256 bits (32 bytes)
  const keyDigest = await crypto.subtle.digest("SHA-256", new Uint8Array([...salt, ...rawKeyMaterial]));

  return crypto.subtle.importKey(
    "raw",
    keyDigest,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt file using AES-256-GCM before uploading to IPFS
 * Output structure: [12 bytes IV] + [AES-GCM Ciphertext + Tag]
 * Also computes SHA-256 of the resulting encrypted file: H = SHA256(Fenc)
 */
export async function encryptMedicalFile(file, patientAddress) {
  const crypto = getCrypto();
  const fileBuffer = await file.arrayBuffer();
  const aesKey = await deriveAESKey(patientAddress);

  // Generate random 96-bit (12-byte) initialization vector (IV)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt with AES-256-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    fileBuffer
  );

  // Pack IV (12 bytes) + Ciphertext into a single contiguous ArrayBuffer (Fenc)
  const encryptedPayload = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
  encryptedPayload.set(iv, 0);
  encryptedPayload.set(new Uint8Array(ciphertextBuffer), iv.length);

  // Calculate SHA-256 fingerprint: H = SHA256(Fenc)
  const fileHash = await calculateSHA256(encryptedPayload.buffer);

  // Create encrypted File/Blob with extension .enc
  const encryptedBlob = new Blob([encryptedPayload], { type: "application/octet-stream" });
  const encryptedFile = new File([encryptedBlob], `${file.name}.enc`, {
    type: "application/octet-stream",
    lastModified: Date.now(),
  });

  return {
    encryptedFile,
    encryptedBlob,
    fileHash, // H = SHA256(Fenc)
    originalName: file.name,
    originalSize: file.size,
    encryptedSize: encryptedBlob.size,
    mimeType: file.type || "application/octet-stream",
  };
}

/**
 * Verify Integrity of downloaded encrypted file
 * Formula: I(n) = (HN == H)
 */
export async function verifyIntegrity(encryptedArrayBuffer, expectedOnChainHash) {
  const actualHash = await calculateSHA256(encryptedArrayBuffer);
  const cleanExpected = (expectedOnChainHash || "").trim().toLowerCase().replace(/^0x/, "");
  const cleanActual = actualHash.trim().toLowerCase().replace(/^0x/, "");

  const passed = cleanExpected.length > 0 && cleanActual === cleanExpected;

  return {
    passed,
    actualHash: cleanActual,
    expectedHash: cleanExpected,
    message: passed
      ? "Integrity Verification Passed (SHA-256 matches blockchain record)"
      : `Integrity Verification Failed (Tampered file! Expected: ${cleanExpected.slice(0, 10)}..., Got: ${cleanActual.slice(0, 10)}...)`,
  };
}

/**
 * Decrypt medical file after integrity verification
 * Input: encrypted ArrayBuffer, patientAddress, optional filename & mimeType
 */
export async function decryptMedicalFile(
  encryptedArrayBuffer,
  patientAddress,
  expectedHash = null,
  fileName = "decrypted_record.pdf",
  mimeType = "application/pdf"
) {
  const crypto = getCrypto();

  // Step 1: Integrity Check if expectedHash is provided
  if (expectedHash) {
    const integrity = await verifyIntegrity(encryptedArrayBuffer, expectedHash);
    if (!integrity.passed) {
      throw new Error(`CRITICAL INTEGRITY FAILURE: ${integrity.message}`);
    }
  }

  // Step 2: Unpack IV (12 bytes) + Ciphertext
  const encryptedBytes = new Uint8Array(encryptedArrayBuffer);
  if (encryptedBytes.length <= 12) {
    throw new Error("Invalid encrypted file: file size is too small to contain AES-GCM IV");
  }

  const iv = encryptedBytes.slice(0, 12);
  const ciphertext = encryptedBytes.slice(12);

  // Step 3: Derive AES-256 Key
  const aesKey = await deriveAESKey(patientAddress);

  // Step 4: Decrypt with AES-GCM
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );

    const cleanFileName = fileName.replace(/\.enc$/i, "");
    const decryptedBlob = new Blob([decryptedBuffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(decryptedBlob);

    return {
      decryptedBlob,
      decryptedBuffer,
      objectUrl,
      fileName: cleanFileName,
      size: decryptedBuffer.byteLength,
    };
  } catch (err) {
    throw new Error(`Decryption failed: Key mismatch or corrupted data. (${err.message})`);
  }
}

/**
 * Deliberately tamper with an encrypted buffer for testing modification detection (Table II & III)
 */
export function tamperBuffer(encryptedArrayBuffer) {
  const tampered = new Uint8Array(encryptedArrayBuffer.slice(0));
  // Flip bits in the middle of ciphertext
  const targetIndex = Math.min(tampered.length - 1, Math.max(14, Math.floor(tampered.length / 2)));
  tampered[targetIndex] ^= 0xff;
  tampered[targetIndex + 1] ^= 0x5a;
  return tampered.buffer;
}
