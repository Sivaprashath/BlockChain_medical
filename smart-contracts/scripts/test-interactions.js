import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect({ network: "ganache" });
  const { ethers } = connection;

  // Get some test accounts from Ganache
  const [patient, doctor, strangerDoctor] = await ethers.getSigners();

  console.log("Patient address:", patient.address);
  console.log("Doctor address:", doctor.address);
  console.log("Stranger (no access) address:", strangerDoctor.address);
  console.log("--------------------------------------------------");

  // Connect to your already-deployed contract
  const contractAddress = "0x9dD88f75aE5a7262226ec3D709889e356B68aEAC";
  const medicalRecord = await ethers.getContractAt("MedicalRecord", contractAddress);

  // 1. Patient uploads a record (using a fake hash for now)
  const fakeHash = "a3f5b7c9d1e2f4a6b8c0d2e4f6a8b0c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3";
  let tx = await medicalRecord.connect(patient).uploadRecord(fakeHash);
  await tx.wait();
  console.log("✅ Step 1: Patient uploaded a record");

  // 2. Patient grants access to the doctor
  tx = await medicalRecord.connect(patient).grantAccess(doctor.address);
  await tx.wait();
  console.log("✅ Step 2: Patient granted access to doctor");

  // 3. Doctor (WITH access) tries to view the records
  const records = await medicalRecord.connect(doctor).getRecords(patient.address);
  console.log("✅ Step 3: Doctor successfully viewed records:", records);

  // 4. Stranger doctor (WITHOUT access) tries to view the records — should FAIL
  try {
    await medicalRecord.connect(strangerDoctor).getRecords(patient.address);
    console.log("❌ Step 4: ERROR — stranger was able to view records (this should NOT happen)");
  } catch (error) {
    console.log("✅ Step 4: Correctly blocked — stranger doctor cannot view records");
  }

  // 5. Patient revokes the doctor's access
  tx = await medicalRecord.connect(patient).revokeAccess(doctor.address);
  await tx.wait();
  console.log("✅ Step 5: Patient revoked doctor's access");

  // 6. Doctor tries again after revoke — should FAIL now
  try {
    await medicalRecord.connect(doctor).getRecords(patient.address);
    console.log("❌ Step 6: ERROR — doctor could still view records after revoke");
  } catch (error) {
    console.log("✅ Step 6: Correctly blocked — access was properly revoked");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});