import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // 1. Deploy DexAggregator
  console.log("Deploying DexAggregator...");
  const DexAggregatorFactory = await ethers.getContractFactory("DexAggregator");
  const dexAggregator = await DexAggregatorFactory.deploy({
    gasPrice: ethers.utils.parseUnits("10", "gwei"),
    gasLimit: 3000000,
  });
  await dexAggregator.deployed();
  console.log(`DexAggregator deployed to: ${dexAggregator.address}`);

  // 2. Deploy ArbitrageLogic with DexAggregator address
  console.log("Deploying ArbitrageLogic...");
  const ArbitrageLogicFactory = await ethers.getContractFactory("ArbitrageLogic");
  const arbitrageLogic = await ArbitrageLogicFactory.deploy(dexAggregator.address);
  await arbitrageLogic.deployed();
  console.log(`ArbitrageLogic deployed to: ${arbitrageLogic.address}`);

  // 3. Deploy FlashLoanSepolia with Aave provider and ArbitrageLogic addresses
  console.log("Deploying FlashLoanSepolia...");
  const AAVE_PROVIDER_ADDRESS = "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A";
  const FlashLoanFactory = await ethers.getContractFactory("FlashLoanSepolia");
  const flashLoan = await FlashLoanFactory.deploy(AAVE_PROVIDER_ADDRESS, arbitrageLogic.address);
  await flashLoan.deployed();
  console.log(`FlashLoanSepolia deployed to: ${flashLoan.address}`);

  // Transfiere la propiedad de ArbitrageLogic a FlashLoanSepolia
  console.log("\nConfigurando permisos entre contratos...");
  console.log("Transfiriendo ownership de ArbitrageLogic a FlashLoanSepolia...");
  try {
    // Llama a setOwner() para transferir la propiedad
    const setOwnerTx = await arbitrageLogic.setOwner(flashLoan.address);
    await setOwnerTx.wait();
    console.log("✅ Ownership transferido exitosamente");
    
    // Verifica el nuevo owner
    const newOwner = await arbitrageLogic.owner();
    console.log(`Nuevo owner de ArbitrageLogic: ${newOwner}`);
    console.log(`Dirección de FlashLoanSepolia: ${flashLoan.address}`);
    console.log(`¿Coinciden? ${newOwner.toLowerCase() === flashLoan.address.toLowerCase()}`);
  } catch (error) {
    console.error("❌ Error al transferir ownership:", error);
  }

  // 4. Update configuration file with new addresses
  try {
    const configPath = path.join(__dirname, "sepoliaAddresses.ts");
    let configContent = fs.readFileSync(configPath, "utf8");
    
    // Update contract addresses in the config file
    configContent = configContent.replace(
      /export const DEPLOYED_CONTRACTS = \{[\s\S]*?\}/,
      `export const DEPLOYED_CONTRACTS = {
  // Automatically updated by deploy script
  ARBITRAGE_LOGIC: "${arbitrageLogic.address}",
  FLASH_LOAN: "${flashLoan.address}"
}`
    );
    
    fs.writeFileSync(configPath, configContent);
    console.log("✅ Configuration file updated with new contract addresses");
  } catch (error) {
    console.error("❌ Failed to update configuration file:", error);
    console.log("\nPlease manually update your config/addresses.ts file with:");
    console.log(`DEX_AGGREGATOR: "${dexAggregator.address}",`);
    console.log(`ARBITRAGE_LOGIC: "${arbitrageLogic.address}",`);
    console.log(`FLASH_LOAN: "${flashLoan.address}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
