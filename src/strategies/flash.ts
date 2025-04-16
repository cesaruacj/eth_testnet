/**
 * Flash loan arbitrage execution
 */
import { ethers } from "ethers";
import { AAVE_TOKENS, DEPLOYED_CONTRACTS, TOKENS_WITH_AAVE_LIQUIDITY, ABIS } from "../../config/addresses";
import { getWallet } from "../providers/network"; 
import { checkAaveLiquidity, getOptimalFlashLoanAmount, verifyFlashLoanSafety } from "../providers/aave";
import { getOptimizedGasFees } from "../utils/gas";
import { executeDirectArbitrage } from "./direct";

/**
 * Execute arbitrage using flash loans
 */
export async function executeFlashLoanArbitrage(
  tokenInSymbol: string,
  tokenOutSymbol: string,
  amountInFormatted: string,
  buyDexName: string,
  sellDexName: string
) {
  try {
    console.log(`\n🚀 EXECUTING ARBITRAGE WITH FLASH LOAN: ${tokenInSymbol} → ${tokenOutSymbol} → ${tokenInSymbol}`);
    
    const wallet = getWallet();
    if (!wallet) {
      console.log("❌ No wallet configured. Add PRIVATE_KEY to your .env file");
      return { success: false, error: "No wallet configured" };
    }
    
    // Map symbols to Aave token addresses
    const tokenMap = {
      "USDC": AAVE_TOKENS.USDC,
      "WETH": AAVE_TOKENS.WETH,
      "LINK": AAVE_TOKENS.LINK,
      "DAI": AAVE_TOKENS.DAI,
      "USDT": AAVE_TOKENS.USDT
    };
    
    // If token is not in the available Aave tokens, use a token with good liquidity
    if (!tokenMap[tokenInSymbol] || !TOKENS_WITH_AAVE_LIQUIDITY.includes(tokenInSymbol)) {
      console.log(`⚠️ ${tokenInSymbol} is not available for flash loans. Using WETH instead.`);
      return executeFlashLoanArbitrage("WETH", tokenOutSymbol, "0.1", buyDexName, sellDexName);
    }
    
    // Get token address
    const tokenInAddress = tokenMap[tokenInSymbol];
    if (!tokenInAddress) {
      console.log(`❌ Could not find address for ${tokenInSymbol}`);
      return { success: false, error: `Unknown token ${tokenInSymbol}` };
    }
    
    // Verify flash loan safety
    const isSafe = await verifyFlashLoanSafety(tokenInAddress, ethers.utils.parseUnits("1", 18));
    if (!isSafe) {
      console.log(`❌ Token not considered safe for flash loan. Aborting operation.`);
      return { success: false, error: "Token safety check failed" };
    }
    
    // Get token details
    const tokenContract = new ethers.Contract(
      tokenInAddress,
      ABIS.erc20,
      wallet
    );
    const decimals = await tokenContract.decimals();
    
    // Parse amount with correct decimals
    const amountIn = ethers.utils.parseUnits(amountInFormatted, decimals);
    
    // Check Aave liquidity and adjust amount if needed
    const liquidityCheck = await checkAaveLiquidity(tokenInAddress, amountIn);
    if (!liquidityCheck.hasLiquidity) {
      console.log(`⚠️ Switching to direct arbitrage due to insufficient Aave liquidity`);
      return executeDirectArbitrage(tokenInSymbol, amountInFormatted);
    }
    
    // Get optimal amount based on liquidity
    const optimalAmount = await getOptimalFlashLoanAmount(tokenInAddress, amountIn, decimals);
    const finalAmount = optimalAmount.adjusted ? optimalAmount.amount : amountIn;
    
    console.log(`💰 Initiating flash loan for ${ethers.utils.formatUnits(finalAmount, decimals)} ${tokenInSymbol}...`);
    
    // Connect to flash loan contract
    const flashLoanContract = new ethers.Contract(
      DEPLOYED_CONTRACTS.FLASH_LOAN,
      ABIS.flashLoan,
      wallet
    );
    
    // Get optimal gas settings
    const gasSettings = await getOptimizedGasFees('fast');
    
    // Execute the flash loan
    const tx = await flashLoanContract.executeFlashLoan(
      tokenInAddress,
      finalAmount,
      { ...gasSettings }
    );

    console.log(`✅ Flash loan initiated! Tx hash: ${tx.hash}`);
    console.log(`📊 View details at: https://sepolia.etherscan.io/tx/${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error(`Error executing flash loan: ${error.message}`);
    return { success: false, error };
  }
}