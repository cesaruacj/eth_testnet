/**
 * Gas optimization utilities
 */
import { ethers } from "ethers";
import { getProvider } from "../providers/network";
import { GAS_SETTINGS } from "../../config/settings";

const provider = getProvider();

/**
 * Get optimized gas settings for transaction
 * @param speed - 'default', 'fast', or 'fastest'
 */
export async function getOptimizedGasFees(speed = 'default') {
  const feeData = await provider.getFeeData();
  
  return {
    gasLimit: 3000000,
    maxFeePerGas: feeData.maxFeePerGas.mul(11).div(10), // 10% buffer
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
  };
}

/**
 * Estimate gas for a transaction with safety buffer
 */
export async function estimateGasWithBuffer(txParams: any, buffer = 1.2): Promise<number> {
  try {
    const gasEstimate = await provider.estimateGas(txParams);
    return Math.floor(Number(gasEstimate) * buffer);
  } catch (error) {
    console.warn(`Error estimating gas: ${error.message}`);
    return GAS_SETTINGS.DEFAULT_GAS_LIMIT;
  }
}

/**
 * Convert a gas price to human readable format
 */
export function formatGasPrice(gasPrice: ethers.BigNumber): string {
  return `${parseFloat(ethers.utils.formatUnits(gasPrice, "gwei")).toFixed(2)} gwei`;
}