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

contract MockDexAggregator {
    function getBestDexQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 bestAmountOut, uint256 bestDexIndex) {
        // Always return 1.01x the input amount (simulated 1% profit)
        return (amountIn * 101 / 100, 0);
    }
    
    function swapOnDex(
        uint256 dexIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 slippageTolerance
    ) public returns (uint256) {
        // Always return successful swap with 1% profit
        return amountIn * 101 / 100;
    }
}