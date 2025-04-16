import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { CONTRACT_ADDRESSES, AAVE_ADDRESSES, TOKEN_ADDRESSES } from "../config/addresses";
import { provider } from "../src/providers/network";
dotenv.config();

// Command-line arguments parsing
const args = process.argv.slice(2);
const command = args[0] || "help";

async function verifyContracts() {
  console.log("Verifying contract deployments...");
  
  const contracts = {
    "ArbitrageLogic": CONTRACT_ADDRESSES.ARBITRAGE_LOGIC,
    "FlashLoan": CONTRACT_ADDRESSES.FLASH_LOAN,
    "DexAggregator": CONTRACT_ADDRESSES.DEX_AGGREGATOR,
  };
  
  for (const [name, address] of Object.entries(contracts)) {
    try {
      const code = await provider.getCode(address);
      if (code === "0x") {
        console.log(`❌ ${name} at ${address} has no deployed code!`);
      } else {
        console.log(`✅ ${name} at ${address} is deployed`);
      }
    } catch (error) {
      console.log(`❌ Error verifying ${name}: ${error.message}`);
    }
  }
}

async function verifyAaveLiquidity() {
  console.log("Verifying Aave Pool liquidity on Sepolia...");
  
  // Connect directly to the Aave Pool
  const poolAddress = AAVE_ADDRESSES.POOL;
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
  
  const pool = new ethers.Contract(poolAddress, poolABI, provider);
  
  // Check these tokens
  const tokens = {
    DAI: TOKEN_ADDRESSES.DAI,
    WETH: TOKEN_ADDRESSES.WETH,
    USDC: TOKEN_ADDRESSES.USDC,
    LINK: TOKEN_ADDRESSES.LINK
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
          
          // Check aToken balance (this represents the total deposits)
          const aTokenContract = new ethers.Contract(reserveData.aTokenAddress, erc20ABI, provider);
          const aTokenBalance = await aTokenContract.balanceOf(poolAddress);
          console.log(`- Total deposits (aToken balance): ${ethers.utils.formatUnits(aTokenBalance, decimals)} ${symbol}`);
          
          console.log(`- aToken address: ${reserveData.aTokenAddress}`);
        }
      } catch (error) {
        console.log(`Error checking ${symbol}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error("❌ Failed accessing Aave pool:", error.message);
  }
}

async function verifyWalletBalances() {
  if (!process.env.PRIVATE_KEY) {
    return console.log("❌ No PRIVATE_KEY found in .env file");
  }
  
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log(`Checking wallet: ${wallet.address}`);
  
  // Check ETH balance
  const ethBalance = await provider.getBalance(wallet.address);
  console.log(`ETH balance: ${ethers.utils.formatEther(ethBalance)} ETH`);
  
  // Check token balances
  const tokens = {
    DAI: TOKEN_ADDRESSES.DAI,
    WETH: TOKEN_ADDRESSES.WETH, 
    USDC: TOKEN_ADDRESSES.USDC,
    LINK: TOKEN_ADDRESSES.LINK
  };
  
  const erc20ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];
  
  for (const [symbol, address] of Object.entries(tokens)) {
    try {
      const tokenContract = new ethers.Contract(address, erc20ABI, provider);
      const balance = await tokenContract.balanceOf(wallet.address);
      const decimals = await tokenContract.decimals();
      console.log(`${symbol} balance: ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
    } catch (error) {
      console.log(`Error checking ${symbol} balance: ${error.message}`);
    }
  }
}

async function showHelp() {
  console.log("Arbitrage System Verification Utilities");
  console.log("--------------------------------------");
  console.log("Available commands:");
  console.log("  contracts   - Verify contract deployments");
  console.log("  aave        - Check Aave protocol liquidity");
  console.log("  wallet      - Check wallet token balances");
  console.log("  all         - Run all verifications");
  console.log("  help        - Show this help message");
  console.log("\nExample: npx hardhat run scripts/verify.ts -- aave");
}

async function main() {
  console.log("🔍 Running verification utilities...");
  
  switch (command) {
    case "contracts":
      await verifyContracts();
      break;
    case "aave":
      await verifyAaveLiquidity();
      break;
    case "wallet":
      await verifyWalletBalances();
      break;
    case "all":
      await verifyContracts();
      console.log("\n-----------------------\n");
      await verifyAaveLiquidity();
      console.log("\n-----------------------\n");
      await verifyWalletBalances();
      break;
    case "help":
    default:
      await showHelp();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });