require("@nomicfoundation/hardhat-ethers"); // Usar ethers compatible con v6
require("dotenv").config(); // Manejar claves privadas de forma segura

module.exports = {
  solidity: "0.8.28", // Usar la versión más reciente de Solidity
  networks: {
    baseSepolia: {
      url: "https://sepolia.base.org", // Endpoint RPC de Base Sepolia
      accounts: [process.env.PRIVATE_KEY], // Clave privada del archivo .env
      chainId: 84531, // chainId de Base Sepoli
    },
  },
  paths: {
    sources: "./contracts", // Contratos
    tests: "./test", // Pruebas
    cache: "./cache", // Cache
    artifacts: "./artifacts", // Artefactos compilados
  },
};
