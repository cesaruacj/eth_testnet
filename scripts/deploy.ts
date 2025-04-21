import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { AAVE_TOKENS } from "./sepoliaAddresses";
import { getOptimizedGasFees } from "../src/utils/gas";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // 1. Deploy DexAggregator
  console.log("Deploying DexAggregator...");
  const UNISWAP_V3_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"; // Sepolia Quoter
  const DexAggregatorFactory = await ethers.getContractFactory("DexAggregator");

  // Constructor args y opciones de TX separados
  const gasSettings = await getOptimizedGasFees('default'); //
  const dexAggregator = await DexAggregatorFactory.deploy(
    UNISWAP_V3_QUOTER,
    gasSettings
  );
  const receipt = await dexAggregator.deployTransaction.wait();
  console.log(`Gas usado en despliegue: ${receipt.gasUsed.toString()}`);
  console.log(`Costo en ETH: ${ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice))}`);
  await dexAggregator.deployed();
  console.log(`DexAggregator deployed to: ${dexAggregator.address}`);

  // Después de desplegar DexAggregator
  console.log("Configurando DEXs...");
  await dexAggregator.addDex(
      0, // UniswapV2
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" // Router de Uniswap V2 en Sepolia
  );
  console.log("✅ DEX configurado");

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

  // NUEVO: Configurar FlashLoanAddress en ArbitrageLogic
  console.log("Configurando dirección de FlashLoan en ArbitrageLogic...");
  await arbitrageLogic.setFlashLoanAddress(flashLoan.address);

  // NUEVO: Configurar price feeds (necesitarás agregar referencias a AAVE_TOKENS y CHAINLINK_PRICE_FEEDS)
  console.log("Configurando oráculos de precios...");
  const CHAINLINK_PRICE_FEEDS = {
    LINK: "0xc59E3633BAAC79493d908e63626716e204A45EdF" // LINK/USD Sepolia
  };
  await arbitrageLogic.setPriceFeed(AAVE_TOKENS.LINK, CHAINLINK_PRICE_FEEDS.LINK);

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
