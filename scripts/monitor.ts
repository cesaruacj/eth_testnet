import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { getProvider, getWallet } from "../src/providers/network";
import { getPrices, getDexName, getDexPrices } from "../src/providers/dexes";
import { checkAaveLiquidity } from "../src/providers/aave";
import { executeFlashLoanArbitrage } from "../src/strategies/flash";
import { executeDirectArbitrage } from "../src/strategies/direct";
import { analyzeArbitragePairs } from "../src/strategies/analyzer";
import { findTriangularArbitrageOpportunities } from "../src/strategies/triangular";
import { TOKEN_ADDRESSES, TOKENS_WITH_AAVE_LIQUIDITY } from "../config/addresses";
import { ARBITRAGE_SETTINGS, TEST_AMOUNTS } from "../config/settings";
import { formatTokenAmount } from "../src/utils/formatting";
import { sleep } from "../src/utils/formatting";

dotenv.config();

const provider = getProvider();
const wallet = getWallet();

// Command-line arguments parsing
const args = process.argv.slice(2);
const runOnce = args.includes("--once");
const monitorOnly = args.includes("--monitor-only") || !wallet;

let consecutiveFailures = 0;
let discoveredFeeTiers = {};

/**
 * Main arbitrage monitoring function
 */
async function monitor() {
  try {
    console.log("🚀 Starting arbitrage monitoring...");

    // 1. Discover fee tiers for V3 pools
    discoveredFeeTiers = await getDexPrices();
    
    // 2. Query prices across DEXes
    console.log("\n=================== QUERYING PRICES ===================");
    const priceResults = await getPrices(provider);
    
    // 3. Analyze for direct arbitrage opportunities
    console.log("\n=================== DIRECT ARBITRAGE ANALYSIS ===================");
    const opportunities = await analyzeArbitragePairs(
      priceResults,
      ARBITRAGE_SETTINGS.MIN_PROFIT_PERCENT
    );
    
    // 4. Execute profitable opportunities if enabled
    if (opportunities.length > 0 && !monitorOnly && ARBITRAGE_SETTINGS.IS_EXECUTION_ENABLED) {
      console.log(`\nFound ${opportunities.length} profitable opportunities!`);
      
      for (const opp of opportunities) {
        const { tokenIn, tokenOut, buyDex, sellDex, profitPercent, amountIn } = opp;
        console.log(`\n🔍 Executing ${profitPercent.toFixed(2)}% opportunity: Buy ${tokenIn}/${tokenOut} on ${getDexName(buyDex)}, sell on ${getDexName(sellDex)}`);
        
        // Check if this token has Aave liquidity for flash loans
        if (TOKENS_WITH_AAVE_LIQUIDITY.includes(tokenIn)) {
          // Try flash loan arbitrage first
          const flashResult = await executeFlashLoanArbitrage(
            opp,
            wallet,
            provider
          );
          
          if (flashResult.success) {
            console.log(`✅ Flash loan arbitrage successful! Transaction: ${flashResult.txHash}`);
            consecutiveFailures = 0;
          } else {
            console.log(`⚠️ Flash loan failed, falling back to direct arbitrage`);
            const directResult = await executeDirectArbitrage(opp, wallet, provider);
            
            if (directResult.success) {
              console.log(`✅ Direct arbitrage successful! Transaction: ${directResult.txHash}`);
              consecutiveFailures = 0;
            } else {
              console.log(`❌ All arbitrage execution methods failed`);
              consecutiveFailures++;
            }
          }
        } else {
          // For tokens without Aave liquidity, use direct arbitrage with user's funds
          console.log(`ℹ️ ${tokenIn} not available in Aave, executing direct arbitrage`);
          const directResult = await executeDirectArbitrage(opp, wallet, provider);
          
          if (directResult.success) {
            console.log(`✅ Direct arbitrage successful! Transaction: ${directResult.txHash}`);
            consecutiveFailures = 0;
          } else {
            console.log(`❌ Direct arbitrage failed`);
            consecutiveFailures++;
          }
        }
        
        // Check if we've had too many consecutive failures
        if (consecutiveFailures >= ARBITRAGE_SETTINGS.MAX_CONSECUTIVE_FAILURES) {
          console.log(`⚠️ ${consecutiveFailures} consecutive failures. Pausing execution for safety.`);
          ARBITRAGE_SETTINGS.IS_EXECUTION_ENABLED = false;
        }
      }
    } else if (opportunities.length > 0) {
      console.log(`\nFound ${opportunities.length} profitable opportunities (execution disabled)`);
    } else {
      console.log("\nNo profitable arbitrage opportunities found in this scan");
    }
    
    // 5. Check for triangular arbitrage opportunities
    console.log("\n=================== TRIANGULAR ARBITRAGE ANALYSIS ===================");
    const triangularOpportunities = await findTriangularArbitrageOpportunities(
      priceResults,
      ARBITRAGE_SETTINGS.MIN_PROFIT_PERCENT
    );
    
    if (triangularOpportunities.length > 0) {
      console.log(`Found ${triangularOpportunities.length} triangular arbitrage opportunities`);
      // Triangular execution would go here if implemented
    } else {
      console.log("No triangular arbitrage opportunities found");
    }
    
    // Return true if we should continue monitoring
    return true;
  } catch (error) {
    console.error("Error in monitoring cycle:", error);
    return true; // Continue monitoring despite errors
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log("🤖 Arbitrage Bot Starting");
  console.log(`Network: Sepolia Testnet`);
  console.log(`Wallet: ${wallet ? wallet.address : 'No wallet configured - Monitor mode only'}`);
  console.log(`Mode: ${runOnce ? 'Single scan' : 'Continuous monitoring'}`);
  console.log(`Execution: ${ARBITRAGE_SETTINGS.IS_EXECUTION_ENABLED && !monitorOnly ? 'Enabled' : 'Disabled'}`);
  console.log(`Min Profit: ${ARBITRAGE_SETTINGS.MIN_PROFIT_PERCENT}%`);
  console.log("-----------------------------------------------------");
  
  if (runOnce) {
    // Just run once and exit
    await monitor();
  } else {
    // Continuous monitoring with interval
    let running = true;
    
    while (running) {
      running = await monitor();
      
      // Wait between monitoring cycles
      if (running) {
        const waitTime = 60; // seconds
        console.log(`\nWaiting ${waitTime} seconds until next scan...\n`);
        await sleep(waitTime * 1000);
      }
    }
  }
}

// Start the monitoring
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });