/**
 * Triangular arbitrage detection and execution
 */
import { ethers } from "ethers";
import { formatPriceComparison } from "../utils/formatting";

/**
 * Find triangular arbitrage opportunities
 */
export async function findTriangularArbitrageOpportunities(priceResults) {
  console.log("\n=================== TRIANGULAR ARBITRAGE ANALYSIS ===================");
  
  // Define potential triangle routes
  // Each route is a sequence of 3 swaps that should return to the original token
  const triangleRoutes = [
    // Example: ETH -> USDC -> LINK -> ETH
    { 
      name: "ETH-USDC-LINK",
      steps: [
        { from: "WETH", to: "USDC", priceKey: "usdc_weth", invertPrice: true },
        { from: "USDC", to: "LINK", priceKey: "usdc_link" },
        { from: "LINK", to: "WETH", priceKey: "link_weth" }
      ]
    },
    // Add more triangular routes as needed
  ];
  
  const opportunities = [];
  
  // Check each route
  for (const route of triangleRoutes) {
    try {
      // Skip routes with missing price data
      let hasAllPrices = true;
      for (const step of route.steps) {
        if (!priceResults[step.priceKey]) {
          hasAllPrices = false;
          break;
        }
      }
      
      if (!hasAllPrices) {
        console.log(`Skipping ${route.name} due to missing price data`);
        continue;
      }
      
      // Calculate the potential profit for each DEX combination
      const dexes = ["uniV2", "sushi", "uniV3_3000"];
      
      for (const startDex of dexes) {
        for (const midDex of dexes) {
          for (const endDex of dexes) {
            // Skip if any DEX doesn't have the required price
            let hasRequiredPrices = true;
            let startPrice, midPrice, endPrice;
            
            // Get the price for the first step
            if (route.steps[0].invertPrice) {
              startPrice = 1 / priceResults[route.steps[0].priceKey][startDex];
            } else {
              startPrice = priceResults[route.steps[0].priceKey][startDex];
            }
            
            // Get the price for the second step
            if (route.steps[1].invertPrice) {
              midPrice = 1 / priceResults[route.steps[1].priceKey][midDex];
            } else {
              midPrice = priceResults[route.steps[1].priceKey][midDex];
            }
            
            // Get the price for the third step
            if (route.steps[2].invertPrice) {
              endPrice = 1 / priceResults[route.steps[2].priceKey][endDex];
            } else {
              endPrice = priceResults[route.steps[2].priceKey][endDex];
            }
            
            if (isNaN(startPrice) || isNaN(midPrice) || isNaN(endPrice)) {
              hasRequiredPrices = false;
            }
            
            if (!hasRequiredPrices) continue;
            
            // Calculate the result of the complete triangle
            const startAmount = ethers.utils.parseEther("1"); // 1 ETH
            const midAmount = startAmount.mul(Math.floor(startPrice * 1000000)).div(1000000);
            const endAmount = midAmount.mul(Math.floor(midPrice * 1000000)).div(1000000);
            const finalAmount = endAmount.mul(Math.floor(endPrice * 1000000)).div(1000000);
            
            // Calculate profit percentage
            const profitPercent = ((finalAmount.sub(startAmount)).mul(100).div(startAmount)).toNumber();
            
            if (profitPercent > 0) {
              opportunities.push({
                route: route.name,
                dexes: [startDex, midDex, endDex],
                profitPercent
              });
            }
          }
        }
      }
    } catch (error) {
      console.log(`Error analyzing ${route.name}: ${error.message}`);
    }
  }
  
  // Sort by profit percentage
  opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  
  console.log(`Found ${opportunities.length} potential triangular routes`);
  
  // Log the top opportunities
  opportunities.slice(0, 3).forEach((opp, idx) => {
    console.log(`${idx+1}. ${opp.route} via ${opp.dexes.join(' -> ')}: +${opp.profitPercent}%`);
  });
  
  return opportunities;
}