/**
 * Network configuration for Sepolia
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

let provider: ethers.providers.JsonRpcProvider;
let wallet: ethers.Wallet | null = null;

/**
 * Get the network provider instance
 */
export function getProvider(): ethers.providers.JsonRpcProvider {
  if (!provider) {
    if (!process.env.SEPOLIA_RPC_URL) {
      throw new Error("SEPOLIA_RPC_URL not defined in .env file");
    }
    provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  }
  return provider;
}

/**
 * Get the wallet instance (creates if doesn't exist)
 */
export function getWallet(): ethers.Wallet | null {
  if (!wallet) {
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!PRIVATE_KEY) {
      console.warn("⚠️ No PRIVATE_KEY found in .env - will monitor only, no execution");
      return null;
    }
    wallet = new ethers.Wallet(PRIVATE_KEY, getProvider());
  }
  return wallet;
}

/**
 * Check if wallet is configured and ready
 */
export function isWalletConfigured(): boolean {
  return wallet !== null;
}

/**
 * Get current network information
 */
export async function getNetworkInfo() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  return {
    chainId: network.chainId,
    name: network.name,
    blockNumber: await provider.getBlockNumber()
  };
}