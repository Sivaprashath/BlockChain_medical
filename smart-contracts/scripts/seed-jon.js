const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
  const artifact = JSON.parse(fs.readFileSync("/Users/siva/Desktop/Projects/medical-record-blockchain/client/src/MedicalRecord.json"));
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const contractAddress = "0x4FCeB3C3D62BeD9005c2Cb0fdC1eCf9284084090";

  const jonSigner = new ethers.Wallet("0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d", provider);
  const doctorWallet = "0x261b026aB70e314fA58480Cb4426f8e49B055d5c";
  const contract = new ethers.Contract(contractAddress, artifact.abi, jonSigner);

  const balance = await provider.getBalance(jonSigner.address);
  console.log("Jon wallet:", jonSigner.address);
  console.log("Jon ETH balance:", ethers.formatEther(balance), "ETH");

  console.log("\n1. Uploading sample record for Jon...");
  const tx1 = await contract.uploadRecord("QmJonBloodReportSample2024IPFS", "Lab Report", "Complete Blood Count - Jon");
  await tx1.wait();
  console.log("Record uploaded!");

  console.log("\n2. Granting access to doctor...");
  const nonce = await provider.getTransactionCount(jonSigner.address, "latest");
  const tx2 = await contract.grantAccess(doctorWallet, { nonce });
  await tx2.wait();
  console.log("Access granted to Dr. SivaPrashath!");

  const hasAccess = await contract.hasAccess(jonSigner.address, doctorWallet);
  console.log("\nDoctor has access:", hasAccess);
}

main().catch(console.error);
