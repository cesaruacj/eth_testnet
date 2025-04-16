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
  try {
    const feeData = await provider.getFeeData();
    
    // Determine multiplier based on speed
    let multiplier: number;
    switch(speed) {
      case 'fastest':
        multiplier = GAS_SETTINGS.FASTEST_MULTIPLIER;
        break;
      case 'fast':
        multiplier = GAS_SETTINGS.FAST_MULTIPLIER;
        break;
      default:
        multiplier = GAS_SETTINGS.DEFAULT_MULTIPLIER;
    }
    
    // Apply multiplier to gas settings
    return {
      maxFeePerGas: feeData.maxFeePerGas?.mul(Math.floor(multiplier * 100)).div(100) || null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.mul(Math.floor(multiplier * 100)).div(100) || null,
      gasLimit: GAS_SETTINGS.DEFAULT_GAS_LIMIT
    };
  } catch (error) {
    console.warn(`Error getting optimized gas fees: ${error.message}`);
    
    // Default fallback values
    return {
      gasPrice: ethers.utils.parseUnits("5", "gwei"),
      gasLimit: GAS_SETTINGS.DEFAULT_GAS_LIMIT
    };
  }
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