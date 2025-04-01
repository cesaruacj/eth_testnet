import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@nomiclabs/hardhat-ethers";             // v5 compatible
// import "@nomiclabs/hardhat-waffle";             // v5 compatible
import "@typechain/hardhat";                    // make sure using v8.1.1
import "@nomiclabs/hardhat-etherscan";          // v5 compatible
import "hardhat-gas-reporter";                  // v5 compatible
import "solidity-coverage";                     // v5 compatible
import "@nomicfoundation/hardhat-chai-matchers"; // use v1 for ethers v5

// Configuración simplificada - siempre usando Base Mainnet
console.log(`Usando Base Mainnet (fork local)`);

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
        url: `https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F`,
      },
      hardfork: "merge",
      gasPrice: "auto",
      gasMultiplier: 2,
    },
    baseMainnet: {
      url: `https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F`,
      chainId: 8453,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: "auto", 
      gasMultiplier: 1.5,
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
    timeout: 300000, // Aumentar a 5 minutos para operaciones largas
  },
  typechain: {
    outDir: 'typechain-types',
    target: '@typechain/ethers-v5',
    alwaysGenerateOverloads: false,
  },
};

export default config;