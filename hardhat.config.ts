import { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomicfoundation/hardhat-chai-matchers";
require('@openzeppelin/hardhat-upgrades');

// Configuración de Hardhat usando Sepolia testnet
console.log(`Configurando para Ethereum Sepolia testnet`);

// Asegúrate de tener estas variables en tu archivo .env
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const ETHERSCAN_API_KEY = process.env.API_KEY

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
    },
    compilers: [
      { version: "0.5.5" },
      { version: "0.6.6" },
      { version: "0.8.28" }
    ],
  },
  networks: {
    // Para desarrollo local con fork de Sepolia
    hardhat: {
      forking: {
        url: SEPOLIA_RPC_URL || "",
      },
      chainId: 11155111, // ID de cadena de Sepolia
    },
    // Conexión directa a Sepolia
    sepolia: {
      url: "https://eth-sepolia.g.alchemy.com/v2/JDR4rpYy7x_w4r0Z0P5QV9W-f_H7DqZ7",
      accounts: [`0x${PRIVATE_KEY}`],
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 300000, // 5 minutos
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
    externalArtifacts: [],
    dontOverrideCompile: true
  },
};

export default config;