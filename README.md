# MediChain — Decentralized Medical Record Management on Blockchain

MediChain is a decentralized, secure, and privacy-first Electronic Health Record (EHR) management system powered by **Ethereum Smart Contracts**, **IPFS decentralized storage**, and **WebAuthn Biometric Verification**.

---

## 🌟 Key Features

### 1. 🔐 Dual-Biometric Authentication (Touch ID / WebAuthn)
- **Primary Patient Fingerprint**: Patients register their hardware biometric credential (Touch ID / Fingerprint sensor) using WebAuthn.
- **Emergency Guardian Access**: Allows patients to register a backup fingerprint for a designated guardian (spouse, parent, or family member). If the patient is incapacitated or injured, the guardian can authorize doctor access in real time.
- **Biometric Challenge on Doctor Record Lookup**: Doctors cannot access patient records without biometric authorization approval.

### 2. 📋 Granular Access & Doctor Upload Permissions
- **Independent On-Chain Permissions**: Patients maintain full sovereignty over their records:
  - **View Permission**: Grants/revokes doctor read access.
  - **Upload Permission**: Allows authorized doctors to upload lab reports, prescriptions, or clinical summaries directly to the patient's blockchain profile via `doctorUploadRecord`.
- **IPFS Distributed Storage**: Medical files are pinned to IPFS, and only the cryptographic hash and metadata are permanently recorded on the blockchain.

### 3. 👥 Role-Based Portals
- **Patient Portal**: Upload personal records, manage doctor permissions, register dual biometrics, and monitor audit trails.
- **Doctor Portal**: Lookup patient records with biometric consent, view verified documents, and upload medical records for permitted patients.
- **Hospital Portal**: Manage hospital doctors and departmental affiliations.

### 4. 🛡️ Audit Logging & Blockchain Transparency
- Every record upload, permission grant, and revocation emits smart contract events indexed in real time.

---

## 🏗️ Architecture & Tech Stack

- **Smart Contracts**: Solidity `^0.8.28`, Hardhat, Ganache local blockchain
- **Frontend**: React 19, Ethers.js v6, Lucide React, SimpleWebAuthn Browser, Vanilla CSS
- **Backend**: Node.js, Express, MongoDB (Mongoose), JWT, Bcrypt, Nodemailer OTP, SimpleWebAuthn Server
- **Decentralized Storage**: Pinata IPFS Gateway

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB running locally on `mongodb://127.0.0.1:27017`
- MetaMask browser extension
- Ganache CLI or Ganache GUI running on `http://127.0.0.1:8545`

### 1. Smart Contract Deployment
```bash
cd smart-contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network ganache
```

### 2. Backend Server Setup
```bash
cd server
npm install
cp .env.example .env
# Configure your MongoDB URI, JWT secret, and email credentials in .env
npm start
```

### 3. Frontend Client Setup
```bash
cd client
npm install
cp .env.example .env
# Set REACT_APP_CONTRACT_ADDRESS to your deployed contract address from step 1
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📄 License
This project is licensed under the MIT License.
