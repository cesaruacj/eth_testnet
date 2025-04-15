// filepath: c:\Users\ccane\OneDrive\Escritorio\Maestria UACJ\4to Semestre\Seminario IV\basefl2\scripts\deploy.ts
// La sintaxis ya parece ser compatible con ethers v5
import { ethers } from "hardhat";

const AAVE_PROVIDER_ADDRESS = "0x012b5a383E1c09E2893e6b4bA3B5b936Ad616C9A";

async function main() {
  // Obtener la dirección correcta del PoolAddressesProvider de Aave v3 en ETH Sepolia
  const addressesProvider: string = AAVE_PROVIDER_ADDRESS;

  // Primero desplegamos el DexAggregator
  console.log("Desplegando DexAggregator...");
  const DexAggregator = await ethers.getContractFactory("DexAggregator");
  const dexAggregator = await DexAggregator.deploy();
  await dexAggregator.deployed();
  console.log("DexAggregator desplegado en:", dexAggregator.address);

  // Desplegamos ArbitrageLogic con la dirección del DexAggregator
  console.log("Desplegando ArbitrageLogic...");
  const ArbitrageLogic = await ethers.getContractFactory("ArbitrageLogic");
  const arbitrageLogic = await ArbitrageLogic.deploy(dexAggregator.address);
  await arbitrageLogic.deployed();
  console.log("ArbitrageLogic desplegado en:", arbitrageLogic.address);

  // Desplegamos FlashLoanSepolia con ambos parámetros
  console.log("Desplegando FlashLoanSepolia...");
  const FlashLoanSepolia = await ethers.getContractFactory("FlashLoanSepolia");
  const flashLoan = await FlashLoanSepolia.deploy(addressesProvider, arbitrageLogic.address);
  await flashLoan.deployed();
  console.log("FlashLoanSepolia desplegado en:", flashLoan.address);

  console.log("\nActualiza tu CONFIG con:");
  console.log(`flashLoanContractAddress: "${flashLoan.address}"`);
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al desplegar el contrato:", error);
  process.exitCode = 1;
});
