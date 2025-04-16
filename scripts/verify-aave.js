const { ethers } = require("hardhat");

async function main() {
  console.log("Verifying Aave Pool liquidity on Sepolia...");
  
  // Connect directly to the Aave Pool
  const poolAddress = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
  const poolABI = [
    "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id)",
    "function getReservesList() view returns (address[])",
    "function getReserveNormalizedIncome(address asset) view returns (uint256)"
  ];
  
  // Connect to ERC20 token interface for checking balances
  const erc20ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];
  
  const provider = ethers.provider;
  const pool = new ethers.Contract(poolAddress, poolABI, provider);
  
  // Check these tokens
  const tokens = {
    DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
    WETH: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
    USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    LINK: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5"
  };
  
  console.log("Checking available reserves in Aave pool...");
  
  try {
    // Get all available reserves
    const reserves = await pool.getReservesList();
    console.log(`Found ${reserves.length} reserves in the pool`);
    
    // For each token we care about, check if it's in the reserves list
    for (const [symbol, address] of Object.entries(tokens)) {
      try {
        const tokenContract = new ethers.Contract(address, erc20ABI, provider);
        const decimals = await tokenContract.decimals();
        
        // Check if this token is in the reserves list
        const isInReserves = reserves.map(a => a.toLowerCase()).includes(address.toLowerCase());
        console.log(`${symbol} (${address}): ${isInReserves ? "In reserves" : "NOT in reserves"}`);
        
        if (isInReserves) {
          // Check actual pool balance
          const balance = await tokenContract.balanceOf(poolAddress);
          console.log(`- Pool balance: ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
          
          // Get reserve data
          const reserveData = await pool.getReserveData(address);
          console.log(`- aToken address: ${reserveData.aTokenAddress}`);
          
          // Check complete liquidity
          await checkAavePoolLiquidityComplete(pool, address, symbol, decimals);
        }
      } catch (error) {
        console.log(`Error checking ${symbol}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Failed accessing Aave pool:", error.message);
  }
}

// Add this to the verify-aave.js script
async function checkAavePoolLiquidityComplete(pool, tokenAddress, tokenSymbol, decimals) {
  // Get reserve data from Aave
  const reserveData = await pool.getReserveData(tokenAddress);
  const aTokenAddress = reserveData.aTokenAddress;
  
  // Connect to aToken contract
  const aTokenContract = new ethers.Contract(aTokenAddress, erc20ABI, provider);
  
  // Get aToken balance (represents total deposited funds)
  const aTokenBalance = await aTokenContract.balanceOf(pool.address);
  console.log(`- Total ${tokenSymbol} liquidity (aToken balance): ${ethers.utils.formatUnits(aTokenBalance, decimals)} ${tokenSymbol}`);
  
  return aTokenBalance;
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });