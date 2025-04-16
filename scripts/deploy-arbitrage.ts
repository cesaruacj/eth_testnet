import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // Desplegar DexAggregator
  const DexAggregatorFactory = await ethers.getContractFactory("DexAggregator");
  const dexAggregator = await DexAggregatorFactory.deploy({
    gasPrice: ethers.utils.parseUnits("10", "gwei"), // Mayor precio de gas
    gasLimit: 3000000, // Mayor límite de gas
  });
  await dexAggregator.deployed();
  console.log(`DexAggregator deployed to: ${dexAggregator.address}`);

  // Desplegar ArbitrageLogic pasando la dirección de DexAggregator
  const ArbitrageLogicFactory = await ethers.getContractFactory("ArbitrageLogic");
  const arbitrageLogic = await ArbitrageLogicFactory.deploy(dexAggregator.address);
  await arbitrageLogic.deployed();
  console.log(`ArbitrageLogic deployed to: ${arbitrageLogic.address}`);

  // Desplegar FlashLoanSepolia con la dirección del Provider de Aave y ArbitrageLogic
  const AAVE_PROVIDER_ADDRESS = "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A"; // Dirección del Aave Provider en Sepolia
  const FlashLoanFactory = await ethers.getContractFactory("FlashLoanSepolia");
  const flashLoan = await FlashLoanFactory.deploy(AAVE_PROVIDER_ADDRESS, arbitrageLogic.address);
  await flashLoan.deployed();
  console.log(`FlashLoanSepolia deployed to: ${flashLoan.address}`);
  
  console.log("\nUpdate your CONFIG with:");
  console.log(`flashLoanContractAddress: "${flashLoan.address}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });
