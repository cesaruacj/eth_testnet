// update.ts
import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import { getOptimizedGasFees } from "../src/utils/gas";
dotenv.config();

async function main() {
  // Obtener direcciones de los proxies desde .env o archivo de configuración
  const ARBITRAGE_PROXY = process.env.ARBITRAGE_PROXY_ADDRESS;
  const FLASH_LOAN_PROXY = process.env.FLASH_LOAN_PROXY_ADDRESS;
  
  console.log("Getting gas settings...");
  const gasSettings = await getOptimizedGasFees('default');
  
  // Actualizar ArbitrageLogic
  console.log("Upgrading ArbitrageLogic...");
  const ArbitrageLogicV2 = await ethers.getContractFactory("ArbitrageLogicUpgradeable");
  const upgradedArbitrage = await upgrades.upgradeProxy(
    ARBITRAGE_PROXY,
    ArbitrageLogicV2,
    { gasLimit: gasSettings.gasLimit }
  );
  console.log("✅ ArbitrageLogic upgraded");
  
  // Actualizar FlashLoanSepolia
  console.log("Upgrading FlashLoanSepolia...");
  const FlashLoanV2 = await ethers.getContractFactory("FlashLoanSepoliaUpgradeable");
  const upgradedFlashLoan = await upgrades.upgradeProxy(
    FLASH_LOAN_PROXY,
    FlashLoanV2,
    { gasLimit: gasSettings.gasLimit }
  );
  console.log("✅ FlashLoanSepolia upgraded");
  
  // Esperar confirmaciones
  await upgradedArbitrage.deployed();
  await upgradedFlashLoan.deployed();
  
  console.log("All contracts upgraded successfully!");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });