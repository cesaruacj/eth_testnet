// client/alienbase/GetPricesAlienBase.js

import { ethers } from "ethers";
import { addressFactory, addressRouter, addressWETH, addressUSDC } from "./AddressList";
import { factoryABI, routerABI } from "./AbiList";

// Conecta al RPC de BaseChain
const provider = new ethers.providers.JsonRpcProvider("https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F");

// Instancia el contrato Factory
const factoryContract = new ethers.Contract(addressFactory, factoryABI, provider);

// Instancia el contrato Router
const routerContract = new ethers.Contract(addressRouter, routerABI, provider);

// Función para obtener la dirección del pool de dos tokens
async function getPoolAddress(tokenA, tokenB) {
  try {
    const poolAddress = await factoryContract.getPool(tokenA, tokenB);
    console.log("Pool address:", poolAddress);
    return poolAddress;
  } catch (error) {
    console.error("Error al obtener el pool:", error);
  }
}

// Función de ejemplo para ejecutar un swap (esto requiere una cuenta y tokens aprobados, etc.)
async function performSwap(amountIn, tokenA, tokenB, recipient) {
  try {
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutos de plazo
    const path = [tokenA, tokenB];
    const tx = await routerContract.swapExactTokensForTokens(amountIn, 1, path, recipient, deadline);
    console.log("Swap transaction:", tx.hash);
  } catch (error) {
    console.error("Error al ejecutar swap:", error);
  }
}

async function main() {
  // Ejemplo: usar WETH y USDC
  await getPoolAddress(addressWETH, addressUSDC);
  // Nota: para ejecutar un swap se requiere tener una cuenta y tokens, este es solo un ejemplo.
}

main().catch(console.error);
