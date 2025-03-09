require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers"); // Add this for better Chai matchers
require("@nomicfoundation/hardhat-network-helpers"); // Add this for loadFixture and other testing helpers
require("dotenv").config(); // Para cargar PRIVATE_KEY del archivo .env

// Muestra las cuentas disponibles
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();
  for (const account of accounts) {
    console.log(account.address);
  }
});

module.exports = {
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
        // Usamos Base Mainnet para forking en tests locales
        url: "https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F",
      },
    },
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F",
      chainId: 84532, // ChainID de Base Sepolia
      accounts: [process.env.PRIVATE_KEY],
    },
    baseMainnet: {
      url: "https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F",
      chainId: 8453, // ChainID de Base Mainnet
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./contracts", // Ubicación de los contratos
    tests: "./test",        // Ubicación de los tests
    cache: "./cache",       // Caché
    artifacts: "./artifacts", // Artefactos compilados
  },
  mocha: {
    timeout: 100000 // Increase timeout for tests if needed
  },
};