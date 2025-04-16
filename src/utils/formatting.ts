/**
 * Formatting utilities for display and logging
 */
import { ethers } from "ethers";

/**
 * Format an amount with appropriate decimal places
 */
export function formatAmount(amount: ethers.BigNumber, decimals: number): string {
  const formatted = ethers.utils.formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  
  if (num < 0.001) {
    return num.toExponential(6);
  } else if (num < 1) {
    return num.toFixed(6);
  } else {
    return num.toFixed(Math.min(decimals, 4));
  }
}

/**
 * Format token amount with symbol
 */
export function formatTokenAmount(amount: ethers.BigNumber, decimals: number, symbol: string): string {
  return `${formatAmount(amount, decimals)} ${symbol}`;
}

/**
 * Format a percentage for display
 */
export function formatPercent(value: number, precision = 2): string {
  return `${value.toFixed(precision)}%`;
}

/**
 * Format timestamp to readable date/time
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

/**
 * Shorten an Ethereum address for display
 */
export function shortenAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format transaction result for console output
 */
export function formatTransactionResult(result: any): string {
  if (!result) return 'No result';
  
  if (result.success && result.txHash) {
    return `✅ Success: https://sepolia.etherscan.io/tx/${result.txHash}`;
  } else if (result.error) {
    return `❌ Error: ${result.error.message || result.error}`;
  } else {
    return `⚠️ Unknown result: ${JSON.stringify(result)}`;
  }
}

/**
 * Format a price comparison result
 */
export function formatPriceComparison(buyPrice: number, sellPrice: number, buyDex: string, sellDex: string): string {
  const diffPercent = ((sellPrice - buyPrice) / buyPrice) * 100;
  
  if (diffPercent <= 0) {
    return `No profitable opportunity found (${diffPercent.toFixed(2)}%)`;
  }
  
  return `✅ ${diffPercent.toFixed(2)}% opportunity - Buy on ${buyDex} (${buyPrice.toFixed(6)}), sell on ${sellDex} (${sellPrice.toFixed(6)})`;
}

/**
 * Sleep function for waiting between operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Example usage of executeFlashLoanArbitrage
const flashResult = await executeFlashLoanArbitrage(
  opp.tokenInSymbol,
  opp.tokenOutSymbol,
  opp.amountInFormatted,
  opp.buyDex,
  opp.sellDex
);

// Example usage of executeDirectArbitrage
const directResult = await executeDirectArbitrage(
  opp.tokenInSymbol,
  opp.amountInFormatted
);