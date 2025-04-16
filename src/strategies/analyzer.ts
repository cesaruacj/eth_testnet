/**
 * Arbitrage opportunity analysis and detection
 */
import { ARBITRAGE_SETTINGS } from "../../config/settings";
import { formatPriceComparison } from "../utils/formatting";

/**
 * Structure of an arbitrage opportunity
 */
export interface ArbitrageOpportunity {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountInFormatted: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  estimatedProfit: string;
}

/**
 * Analyze price results to find arbitrage opportunities
 */
export function analyzeArbitragePairs(
  priceResults: any,
  minProfitPercent: number = ARBITRAGE_SETTINGS.MIN_PROFIT_PERCENT
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  // Define token pairs to analyze
  const tokenPairs = [
    { results: priceResults.usdc_weth, tokenIn: "USDC", tokenOut: "WETH", amount: "1000" },
    { results: priceResults.ybtc_weth, tokenIn: "YBTC", tokenOut: "WETH", amount: "0.05" },
    { results: priceResults.meth_weth, tokenIn: "MON", tokenOut: "WETH", amount: "1" },
    { results: priceResults.uni_weth, tokenIn: "UNI", tokenOut: "WETH", amount: "10" },
    { results: priceResults.link_weth, tokenIn: "LINK", tokenOut: "WETH", amount: "5" },
    { results: priceResults.dai_weth, tokenIn: "DAI", tokenOut: "WETH", amount: "1000" }
  ];
  
  // Analyze each token pair
  for (const pair of tokenPairs) {
    console.log(`\n📊 ANALYSIS FOR ${pair.tokenIn}/${pair.tokenOut}:`);
    
    // Filter valid prices (not NaN)
    const validPrices: Record<string, number> = {};
    Object.entries(pair.results || {}).forEach(([dex, price]) => {
      if (!isNaN(price as number)) validPrices[dex] = price as number;
    });
    
    // Skip if not enough DEXes have liquidity
    if (Object.keys(validPrices).length < 2) {
      console.log(`No arbitrage possible: Not enough DEXes with liquidity`);
      continue;
    }
    
    // Find best buy (lowest price) and best sell (highest price)
    let maxPrice = -Infinity, minPrice = Infinity;
    let buyDex = '', sellDex = '';
    
    Object.entries(validPrices).forEach(([dex, price]) => {
      if (price > maxPrice) { maxPrice = price; sellDex = dex; }
      if (price < minPrice) { minPrice = price; buyDex = dex; }
    });
    
    const diffPercent = ((maxPrice - minPrice) / minPrice) * 100;
    
    // Format and log the price comparison
    console.log(formatPriceComparison(minPrice, maxPrice, getDexName(buyDex), getDexName(sellDex)));
    
    // Add to opportunities list if profitable
    if (diffPercent > minProfitPercent) {
      // Calculate estimated profit in output token
      const inputAmount = parseFloat(pair.amount);
      const outputWithoutArb = inputAmount * minPrice;
      const outputWithArb = inputAmount * maxPrice;
      const profit = outputWithArb - outputWithoutArb;
      
      opportunities.push({
        tokenInSymbol: pair.tokenIn,
        tokenOutSymbol: pair.tokenOut,
        amountInFormatted: pair.amount,
        buyDex,
        sellDex,
        buyPrice: minPrice,
        sellPrice: maxPrice,
        profitPercent: diffPercent,
        estimatedProfit: profit.toFixed(6) + " " + pair.tokenOut
      });
    }
  }
  
  // Sort opportunities by profit percentage (highest first)
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Get DEX name from identifier
 */
function getDexName(dexKey: string): string {
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