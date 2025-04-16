/**
 * DEX interaction logic - price queries across multiple DEXes
 */
import { ethers } from "ethers";
import { TOKENS, DEX_ROUTERS, POOLS, ABIS, FEE_TIERS } from "../../config/addresses";
import { TOKEN_DECIMALS, TOKEN_AMOUNTS } from "../../config/settings";
import { formatAmount } from "../utils/formatting";
import { getProvider } from "./network";

// Initialize provider and contracts
const provider = getProvider();
const sushiRouter = new ethers.Contract(DEX_ROUTERS.SUSHI_V2, ABIS.routerV2, provider);
const uniV2Router = new ethers.Contract(DEX_ROUTERS.UNISWAP_V2, ABIS.routerV2, provider);
const uniV3Quoter = new ethers.Contract(DEX_ROUTERS.UNISWAP_V3_QUOTER, ABIS.quoterV3, provider);

// Initialize fee tiers mapping for V3 pools
const V3_POOL_FEES = {
  [POOLS.UNIV3_METH_WETH]: FEE_TIERS.MEDIUM,     // 0.3%
  [POOLS.UNIV3_YU_YBTC]: FEE_TIERS.MEDIUM,       // 0.3%
  [POOLS.UNIV3_USDC_WETH]: FEE_TIERS.LOW,        // 0.05%
  [POOLS.UNIV3_MON_WETH]: FEE_TIERS.HIGH,        // 1%
  [POOLS.UNIV3_UNI_WETH]: FEE_TIERS.MEDIUM,      // 0.3%
  [POOLS.UNIV3_USDT_WETH]: FEE_TIERS.HIGH,       // 1%
  [POOLS.UNIV3_USDC_UNI]: FEE_TIERS.LOWEST,      // 0.01%
  [POOLS.UNIV3_LINK_WETH]: FEE_TIERS.HIGH,       // 1%
  [POOLS.UNIV3_QRT_WETH]: FEE_TIERS.MEDIUM,      // 0.3%
  [POOLS.UNIV3_YU_WETH]: FEE_TIERS.HIGH          // 1%
};

// Keep track of discovered fee tiers
let discoveredFeeTiers: Record<string, number> = {};

/**
 * Discovers fee tiers for Uniswap V3 pools
 */
export async function discoverV3PoolFeeTiers() {
  console.log("\n🔍 Using known fee tiers for UniswapV3 pools...");
  
  // Map token pairs to their known fees
  discoveredFeeTiers = {
    [`${TOKENS.USDC_V3}_${TOKENS.WETH}`]: FEE_TIERS.LOW,       // USDC/WETH = 0.05%
    [`${TOKENS.MON}_${TOKENS.WETH}`]: FEE_TIERS.HIGH,          // MON/WETH = 1%
    [`${TOKENS.UNI}_${TOKENS.WETH}`]: FEE_TIERS.MEDIUM,        // UNI/WETH = 0.3%
    [`${TOKENS.LINK}_${TOKENS.WETH}`]: FEE_TIERS.HIGH,         // LINK/WETH = 1%
    [`${TOKENS.YU}_${TOKENS.YBTC}`]: FEE_TIERS.MEDIUM,         // YU/YBTC = 0.3%
    [`${TOKENS.USDT}_${TOKENS.WETH}`]: FEE_TIERS.HIGH,         // USDT/WETH = 1%
    [`${TOKENS.USDC_V3}_${TOKENS.UNI}`]: FEE_TIERS.LOWEST,     // USDC/UNI = 0.01%
    [`${TOKENS.QRT}_${TOKENS.WETH}`]: FEE_TIERS.MEDIUM,        // QRT/WETH = 0.3%
    [`${TOKENS.YU}_${TOKENS.WETH}`]: FEE_TIERS.HIGH            // YU/WETH = 1%
  };
  
  console.log("✅ Fee tiers configured for all known pairs");
  
  return discoveredFeeTiers;
}

/**
 * Gets decimals for a token symbol
 */
function getDecimals(symbol: string): number {
  return TOKEN_DECIMALS[symbol] || 18; // Most tokens use 18 decimals as default
}

/**
 * Query prices for a specific token pair across all DEXes
 */
export async function queryTokenPair(tokenInSymbol: string, tokenOutSymbol: string): Promise<Record<string, number>> {
  const tokenIn = TOKENS[tokenInSymbol];
  const tokenOut = TOKENS[tokenOutSymbol];
  const amountInFormatted = TOKEN_AMOUNTS[tokenInSymbol];
  const decimalsIn = getDecimals(tokenInSymbol);
  const decimalsOut = getDecimals(tokenOutSymbol);
  
  // Parse amount with correct decimals
  const amountIn = ethers.utils.parseUnits(amountInFormatted, decimalsIn);
  
  console.log(`\n----- PAIR ${tokenOutSymbol}/${tokenInSymbol} (${formatAmount(amountIn, decimalsIn)} ${tokenInSymbol} → ${tokenOutSymbol}) -----`);
  
  const results = {
    sushi: NaN,
    uniV2: NaN,
    uniV3_3000: NaN,
    uniV3_500: NaN,
    uniV3_10000: NaN,
    uniV3_100: NaN
  };
  
  // 1) SushiSwap V2
  try {
    const path = [tokenIn, tokenOut];
    const amountsOut = await sushiRouter.getAmountsOut(amountIn, path);
    results.sushi = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`SushiSwap V2: ${results.sushi} ${tokenOutSymbol} for ${formatAmount(amountIn, decimalsIn)} ${tokenInSymbol}`);
  } catch (error) {
    console.log(`SushiSwap V2 pool ${tokenInSymbol}/${tokenOutSymbol} doesn't exist or an error occurred`);
  }

  // 2) Uniswap V2
  try {
    const path = [tokenIn, tokenOut];
    const amountsOut = await uniV2Router.getAmountsOut(amountIn, path);
    results.uniV2 = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`Uniswap V2: ${results.uniV2} ${tokenOutSymbol} for ${formatAmount(amountIn, decimalsIn)} ${tokenInSymbol}`);
  } catch (error) {
    console.log(`Uniswap V2 pool ${tokenInSymbol}/${tokenOutSymbol} doesn't exist or an error occurred`);
  }

  // 3) Uniswap V3 with specific fee tiers
  const v3TokenIn = TOKENS[`${tokenInSymbol}_V3`] || tokenIn;
  const v3TokenOut = TOKENS[`${tokenOutSymbol}_V3`] || tokenOut;
  const pairKey = `${v3TokenIn}_${v3TokenOut}`;
  
  // Try with each fee tier
  const feeTiers = [FEE_TIERS.LOWEST, FEE_TIERS.LOW, FEE_TIERS.MEDIUM, FEE_TIERS.HIGH];
  
  for (const fee of feeTiers) {
    try {
      // Skip if we know this pair has a specific fee tier and it's not this one
      if (discoveredFeeTiers[pairKey] && discoveredFeeTiers[pairKey] !== fee) {
        continue;
      }
      
      const outToken = await uniV3Quoter.callStatic.quoteExactInputSingle(
        v3TokenIn, amountIn, v3TokenOut, fee, 0
      );
      
      const feeTierKey = `uniV3_${fee}`;
      results[feeTierKey] = parseFloat(ethers.utils.formatUnits(outToken, decimalsOut));
      console.log(`Uniswap V3 (${fee/10000}%): ${results[feeTierKey]} ${tokenOutSymbol} for ${formatAmount(amountIn, decimalsIn)} ${tokenInSymbol}`);
    } catch (error) {
      // Only log errors for fee tiers we expect to exist
      if (discoveredFeeTiers[pairKey] === fee) {
        console.log(`Uniswap V3 (${fee/10000}%) pool ${tokenInSymbol}/${tokenOutSymbol} doesn't exist or an error occurred`);
      }
    }
  }
  
  return results;
}

/**
 * Check reserves of a specific V2 pool
 */
export async function checkPoolReserves(
  poolAddress: string,
  symbol0: string,
  symbol1: string,
  amountToSwap?: ethers.BigNumber,
  swapSymbol?: string
) {
  try {
    const decimals0 = getDecimals(symbol0); 
    const decimals1 = getDecimals(symbol1);
    
    const pairContract = new ethers.Contract(poolAddress, ABIS.pair, provider);
    
    // Get token addresses to verify order
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();
    
    // Get reserves
    const reserves = await pairContract.getReserves();
    console.log(`Pool V2 ${symbol0}/${symbol1} Reserves: ${ethers.utils.formatUnits(reserves[0], decimals0)} ${symbol0}, ${ethers.utils.formatUnits(reserves[1], decimals1)} ${symbol1}`);
    
    // Calculate price ratios
    const reserve0 = parseFloat(ethers.utils.formatUnits(reserves[0], decimals0));
    const reserve1 = parseFloat(ethers.utils.formatUnits(reserves[1], decimals1));
    
    const price01 = reserve1 / reserve0; // Price of token0 in terms of token1
    const price10 = reserve0 / reserve1; // Price of token1 in terms of token0
    
    console.log(`Implied price: 1 ${symbol0} = ${price01.toFixed(6)} ${symbol1}`);
    console.log(`Implied price: 1 ${symbol1} = ${price10.toFixed(6)} ${symbol0}`);
    
    // Calculate expected slippage if swap amount is provided
    if (amountToSwap && swapSymbol) {
      if (swapSymbol === symbol0) {
        const swapAmount = parseFloat(ethers.utils.formatUnits(amountToSwap, decimals0));
        const expectedSlippage = (swapAmount / reserve0) * 100;
        console.log(`Expected slippage for ${swapAmount} ${symbol0} swap: ~${expectedSlippage.toFixed(2)}%`);
      } else if (swapSymbol === symbol1) {
        const swapAmount = parseFloat(ethers.utils.formatUnits(amountToSwap, decimals1));
        const expectedSlippage = (swapAmount / reserve1) * 100;
        console.log(`Expected slippage for ${swapAmount} ${symbol1} swap: ~${expectedSlippage.toFixed(2)}%`);
      }
    }
    
    return { token0, token1, reserve0, reserve1, price01, price10 };
  } catch (error) {
    console.log(`Error checking pool reserves for ${poolAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Get prices for all configured token pairs
 */
export async function getDexPrices() {
  console.log("=================== QUERYING PRICES ===================");
  
  // Initialize fee tiers
  await discoverV3PoolFeeTiers();
  
  // Query each token pair
  const results = {
    usdc_weth: await queryTokenPair("USDC", "WETH"),
    ybtc_weth: await queryTokenPair("YBTC", "WETH"),
    meth_weth: await queryTokenPair("MON", "WETH"),
    uni_weth: await queryTokenPair("UNI", "WETH"),
    link_weth: await queryTokenPair("LINK", "WETH"),
    dai_weth: await queryTokenPair("DAI", "WETH")
  };
  
  // Check reserves of major pools
  console.log("\n===== VERIFYING RESERVES OF MAIN POOLS =====");
  await checkPoolReserves(
    POOLS.UNIV2_USDC_WETH, 
    "USDC", 
    "WETH", 
    ethers.utils.parseUnits(TOKEN_AMOUNTS.USDC, TOKEN_DECIMALS.USDC), 
    "USDC"
  );
  
  return results;
}

/**
 * Get DEX name from price result key
 */
export function getDexName(dexKey: string): string {
  const dexNames = {
    "uniV2": "Uniswap V2",
    "sushi": "SushiSwap V2",
    "uniV3_100": "Uniswap V3 (0.01%)",
    "uniV3_500": "Uniswap V3 (0.05%)",
    "uniV3_3000": "Uniswap V3 (0.3%)",
    "uniV3_10000": "Uniswap V3 (1%)"
  };
  
  return dexNames[dexKey] || dexKey;
}