import hre from "hardhat";

async function main() {
  console.log("🚀 Deploying MedicalRecord contract...");

  // Use the network passed via --network flag (ganache or localhost)
  const { ethers } = await hre.network.connect();

  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deployer: ${deployer.address}`);

  const MedicalRecord = await ethers.getContractFactory("MedicalRecord");
  const contract = await MedicalRecord.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ MedicalRecord deployed to:", address);
  console.log("\n📋 Add these to client/.env:");
  console.log(`   REACT_APP_CONTRACT_ADDRESS=${address}`);
  console.log(`   REACT_APP_RPC_URL=http://127.0.0.1:8545`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});