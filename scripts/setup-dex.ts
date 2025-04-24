import { ethers } from "hardhat";
import { DEPLOYED_CONTRACTS, DEX_ROUTERS } from "./sepoliaAddresses";

async function main() {
  console.log("Setting up DEX Aggregator with Sepolia routers...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);
  
  const dexAggregator = await ethers.getContractAt(
    "DexAggregator", 
    DEPLOYED_CONTRACTS.DEX_AGGREGATOR
  );
  
  console.log("Adding Uniswap V2...");
  await dexAggregator.addDex(
    0, // DexType.UniswapV2
    DEX_ROUTERS.UNISWAP_V2
  );
  
  console.log("Adding SushiSwap...");
  await dexAggregator.addDex(
    2, // DexType.SushiSwap
    DEX_ROUTERS.SUSHI_V2
  );
  
  // Optionally add Uniswap V3 if supported on Sepolia
  console.log("Adding Uniswap V3...");
  await dexAggregator.addDex(
    1, // DexType.UniswapV3
    DEX_ROUTERS.UNISWAP_V3
  );
  
  console.log("✅ DEXes configured successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });