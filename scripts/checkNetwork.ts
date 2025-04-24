import { ethers } from "hardhat";
import { TOKENS, AAVE_TOKENS } from "./sepoliaAddresses";

// Simple ERC20 ABI for balance checking
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

async function getTokenBalance(tokenAddress: string, walletAddress: string) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, ethers.provider);
    const balance = await tokenContract.balanceOf(walletAddress);
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    return {
      balance: ethers.utils.formatUnits(balance, decimals),
      symbol
    };
  } catch (error) {
    return { balance: "Error", symbol: "Unknown" };
  }
}

async function main() {
  // Obtener el primer firmante conectado (deployer)
  const [deployer] = await ethers.getSigners();

  // Mostrar la dirección del deployer
  console.log("Conectado con la cuenta:", deployer.address);

  // Obtener y formatear el balance de ETH
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance de SepoliaETH:", ethers.utils.formatEther(balance), "ETH");
  
  console.log("\n--- Balances de Tokens ---");
  for (const [name, address] of Object.entries(TOKENS)) {
    const { balance, symbol } = await getTokenBalance(address, deployer.address);
    console.log(`Balance de ${name}: ${balance} ${symbol}`);
  }
  
  console.log("\n--- Balances de Tokens en red AAVE Sepolia ---");
  for (const [name, address] of Object.entries(AAVE_TOKENS)) {
    const { balance, symbol } = await getTokenBalance(address, deployer.address);
    console.log(`Balance de ${name}: ${balance} ${symbol}`);
  }
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al verificar la red:", error);
  process.exitCode = 1;
});
