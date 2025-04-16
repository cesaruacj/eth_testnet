/**
 * Direct arbitrage execution (without flash loans)
 */
import { ethers } from "ethers";
import { TOKENS, DEPLOYED_CONTRACTS, ABIS } from "../../config/addresses";
import { getWallet } from "../providers/network";
import { getOptimizedGasFees } from "../utils/gas";

/**
 * Execute direct arbitrage without flash loans
 */
export async function executeDirectArbitrage(tokenInSymbol: string, amountInFormatted: string) {
  try {
    console.log(`🚀 Executing direct arbitrage with ${amountInFormatted} ${tokenInSymbol}...`);
    
    const wallet = getWallet();
    if (!wallet) {
      console.log("❌ No wallet configured. Add PRIVATE_KEY to your .env file");
      return { success: false, error: "No wallet configured" };
    }
    
    // Map symbols to addresses
    const tokenMap = {
      "USDC": TOKENS.USDC,
      "WETH": TOKENS.WETH,
      "LINK": TOKENS.LINK,
      "DAI": TOKENS.DAI,
      "USDT": TOKENS.USDT,
      "UNI": TOKENS.UNI,
      "YBTC": TOKENS.YBTC,
      "MON": TOKENS.MON,
      "YU": TOKENS.YU,
      "QRT": TOKENS.QRT,
      "COW": TOKENS.COW
    };
    
    const tokenInAddress = tokenMap[tokenInSymbol];
    if (!tokenInAddress) {
      console.log(`❌ Could not find address for ${tokenInSymbol}`);
      return { success: false, error: `Unknown token ${tokenInSymbol}` };
    }
    
    // Connect to ArbitrageLogic contract
    const arbLogicContract = new ethers.Contract(
      DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC,
      ABIS.arbitrageLogic,
      wallet
    );
    
    // Get token details
    const tokenContract = new ethers.Contract(
      tokenInAddress,
      ABIS.erc20,
      wallet
    );
    const decimals = await tokenContract.decimals();
    
    // Parse amount with correct decimals
    const amountIn = ethers.utils.parseUnits(amountInFormatted, decimals);
    
    // Check wallet balance
    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance.lt(amountIn)) {
      console.log(`❌ Insufficient balance: ${ethers.utils.formatUnits(balance, decimals)} ${tokenInSymbol} (need ${amountInFormatted})`);
      return { success: false, error: "Insufficient balance" };
    }
    
    // Approve ArbitrageLogic to spend tokens
    const approveTx = await tokenContract.approve(DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC, amountIn);
    await approveTx.wait();
    console.log(`✅ Approved ${DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC} to spend ${amountInFormatted} ${tokenInSymbol}`);
    
    // Get optimal gas settings
    const gasSettings = await getOptimizedGasFees('fast');
    
    // Execute direct arbitrage
    const tx = await arbLogicContract.executeDirectArbitrage(
      tokenInAddress, 
      amountIn,
      { ...gasSettings }
    );
    
    console.log(`✅ Direct arbitrage initiated! Tx hash: ${tx.hash}`);
    console.log(`📊 View details at: https://sepolia.etherscan.io/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error(`Error executing direct arbitrage: ${error.message}`);
    return { success: false, error };
  }
}