/**
 * Aave protocol interactions - liquidity verification and flash loan functionality
 */
import { ethers } from "ethers";
import { AAVE, AAVE_TOKENS, TOKENS_WITH_AAVE_LIQUIDITY, ABIS } from "../../config/addresses";
import { getProvider } from "./network";
import { formatAmount } from "../utils/formatting";

// Initialize provider
const provider = getProvider();

/**
 * Verify if token is allowed for flash loans
 */
export async function verifyFlashLoanSafety(tokenAddress: string, amount: ethers.BigNumber) {
  try {
    console.log(`Verifying token: ${tokenAddress}`);
    
    // List of allowed tokens (normalize addresses for comparison)
    const allowedTokens = [
      ...Object.values(AAVE_TOKENS)
    ].map(addr => addr.toLowerCase());
    
    const normalizedAddress = tokenAddress.toLowerCase();
    const isAllowed = allowedTokens.includes(normalizedAddress);
    
    if (isAllowed) {
      console.log(`✅ Token approved for flash loan: ${normalizedAddress}`);
      return true;
    }
    
    console.log(`❌ Token not recognized - Not considered safe for flash loan`);
    return false;
  } catch (error) {
    console.error(`Error verifying safety: ${error.message}`);
    return false;
  }
}

/**
 * Check Aave liquidity for a specific token before flash loan
 */
export async function checkAaveLiquidity(tokenAddress: string, requiredAmount: ethers.BigNumber) {
  try {
    // Connect to Aave Pool
    const poolAddress = AAVE.POOL_ADDRESS;
    const poolContract = new ethers.Contract(poolAddress, ABIS.aavePool, provider);
    
    // Get token details
    const tokenContract = new ethers.Contract(tokenAddress, ABIS.erc20, provider);
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    
    // Check if token is in reserves list
    let reserves;
    try {
      reserves = await poolContract.getReservesList();
    } catch (error) {
      console.log(`Could not get reserves list: ${error.message}`);
      // Try direct balance check instead
    }
    
    // Check token balance in the pool
    const balance = await tokenContract.balanceOf(poolAddress);
    const formattedBalance = ethers.utils.formatUnits(balance, decimals);
    
    // Determine if there's enough liquidity
    const hasLiquidity = balance.gte(requiredAmount);
    const formattedRequired = ethers.utils.formatUnits(requiredAmount, decimals);
    
    if (hasLiquidity) {
      console.log(`✅ Sufficient liquidity for flash loan: ${formattedBalance} ${symbol} (need ${formattedRequired})`);
    } else {
      console.log(`⚠️ Insufficient liquidity: Need ${formattedRequired} ${symbol}, Available: ${formattedBalance} ${symbol}`);
    }
    
    // Add reserve data if available
    let reserveData = null;
    if (reserves && reserves.map(r => r.toLowerCase()).includes(tokenAddress.toLowerCase())) {
      try {
        reserveData = await poolContract.getReserveData(tokenAddress);
        console.log(`- aToken address: ${reserveData.aTokenAddress}`);
      } catch (error) {
        console.log(`Could not get reserve data: ${error.message}`);
      }
    }
    
    return {
      hasLiquidity,
      availableLiquidity: balance,
      formattedLiquidity: formattedBalance,
      reserveData
    };
  } catch (error) {
    console.error(`❌ Error checking Aave liquidity: ${error.message}`);
    return { hasLiquidity: false, error: error.message };
  }
}

/**
 * Calculate optimal flash loan amount based on available liquidity
 */
export async function getOptimalFlashLoanAmount(
  tokenAddress: string,
  requestedAmount: ethers.BigNumber,
  decimals: number
) {
  try {
    const liquidityCheck = await checkAaveLiquidity(tokenAddress, requestedAmount);
    
    if (liquidityCheck.hasLiquidity) {
      return {
        amount: requestedAmount,
        adjusted: false
      };
    }
    
    // If not enough liquidity, calculate a safe amount (80% of available)
    if (liquidityCheck.availableLiquidity) {
      const safeAmount = liquidityCheck.availableLiquidity.mul(80).div(100);
      
      // Format for display
      const formattedSafeAmount = ethers.utils.formatUnits(safeAmount, decimals);
      console.log(`🔄 Adjusting flash loan amount to ${formattedSafeAmount} based on available liquidity`);
      
      return {
        amount: safeAmount,
        formatted: formattedSafeAmount,
        adjusted: true
      };
    }
    
    // Return a conservative fallback amount if we couldn't get liquidity data
    return {
      amount: ethers.utils.parseUnits("0.1", decimals),
      formatted: "0.1",
      adjusted: true
    };
  } catch (error) {
    console.error(`Error adjusting amount: ${error.message}`);
    // Return a conservative default amount
    return {
      amount: ethers.utils.parseUnits("0.1", decimals),
      formatted: "0.1",
      adjusted: true
    };
  }
}

/**
 * Get list of tokens with sufficient Aave liquidity
 */
export async function getTokensWithAaveLiquidity() {
  // Start with known tokens that should have liquidity
  const checklist = TOKENS_WITH_AAVE_LIQUIDITY.map(symbol => ({
    symbol,
    address: AAVE_TOKENS[symbol]
  }));
  
  const results = [];
  
  for (const token of checklist) {
    try {
      // Use a small amount for checking
      const minAmount = ethers.utils.parseUnits("0.1", token.symbol === "USDC" ? 6 : 18);
      const check = await checkAaveLiquidity(token.address, minAmount);
      
      if (check.hasLiquidity) {
        results.push(token.symbol);
      }
    } catch (error) {
      console.log(`Error checking ${token.symbol}: ${error.message}`);
    }
  }
  
  console.log(`🏦 Tokens with confirmed Aave liquidity: ${results.join(", ")}`);
  return results;
}