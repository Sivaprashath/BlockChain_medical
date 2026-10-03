import type { HardhatUserConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "paris",
    },
  },
  plugins: [hardhatEthers],
  networks: {
    ganache: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
};

export default config;