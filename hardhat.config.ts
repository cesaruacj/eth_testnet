import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.5.5" },
      { version: "0.6.6" },
      { version: "0.8.28" }
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://base-mainnet.g.alchemy.com/v2/${process.env.BASESCAN_API_KEY}`,
      },
    },
    baseSepolia: {
      url: `https://base-sepolia.g.alchemy.com/v2/${process.env.BASESCAN_API_KEY}`,
      chainId: 84532,
      accounts: [process.env.PRIVATE_KEY],
    },
    baseMainnet: {
      url: `https://base-mainnet.g.alchemy.com/v2/${process.env.BASESCAN_API_KEY}`,
      chainId: 8453,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY,
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 100000,
  },
};

export default config;