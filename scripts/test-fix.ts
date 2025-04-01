// test-fix.ts
import { ethers } from "hardhat";
import { BigNumber } from "ethers";

// Configuración simplificada para pruebas
const TOKENS = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
};

const CONFIG = {
  flashLoanFee: 0.0009,
  expectedSlippage: 0.01,
  estimatedGasCostEth: 0.005,
  ethPriceUsd: 3000,
  tokenPriceUsd: {
    [TOKENS.WETH]: 3000,
    [TOKENS.USDC]: 1,
  }
};

// SOLUCIÓN 1: Función estimateProfit corregida
function estimateProfit(
  amountIn: BigNumber, 
  bestOutput: BigNumber, 
  worstOutput: BigNumber, 
  tokenAddress: string,
  tokenDecimals: number
): { profitInToken: BigNumber; profitUsd: number; isRentable: boolean } {
  // IMPORTANTE: Declarar isRentable al inicio con valor por defecto
  let isRentable = false;
  
  const flashLoanFee = amountIn.mul(Math.floor(CONFIG.flashLoanFee * 10000)).div(10000);
  const gasCostWei = ethers.utils.parseEther(CONFIG.estimatedGasCostEth.toString());
  const tokenPrice = CONFIG.tokenPriceUsd[tokenAddress] || 1;
  const tokenPriceEth = tokenPrice / CONFIG.ethPriceUsd;
  
  let gasCostInToken: BigNumber;
  try {
    gasCostInToken = gasCostWei.mul(ethers.utils.parseUnits("1", tokenDecimals))
      .div(ethers.utils.parseEther(tokenPriceEth.toString()));
  } catch (error) {
    const gasInTokenRaw = CONFIG.estimatedGasCostEth * CONFIG.ethPriceUsd / tokenPrice;
    gasCostInToken = ethers.utils.parseUnits(gasInTokenRaw.toFixed(6), tokenDecimals);
  }
  
  const slippageAmount = bestOutput.mul(Math.floor(CONFIG.expectedSlippage * 10000)).div(10000);
  
  const profitInToken = bestOutput
    .sub(worstOutput)
    .sub(flashLoanFee)
    .sub(gasCostInToken)
    .sub(slippageAmount);
  
  let profitUsd = parseFloat(ethers.utils.formatUnits(profitInToken, tokenDecimals)) * tokenPrice;
  
  if (profitUsd > 1000000) {
    console.log(" Ganancia sospechosamente alta, posible error en datos de precio");
    profitUsd = 0;
  } else {
    // IMPORTANTE: Asignar valor a isRentable basado en el cálculo
    isRentable = profitInToken.gt(BigNumber.from(0)) && profitUsd > 3;
  }
  
  return { profitInToken, profitUsd, isRentable };
}

// SOLUCIÓN 2: Función getTokenPrice con provider correcto
async function getTokenPrice(dexName: string, router: any, pair: any, deployer: any, provider: any) {
  // Al inicio de getTokenPrice para UniswapV3
  if (dexName === 'UniswapV3') {
    const quoterAddress = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
    try {
      // IMPORTANTE: Usar provider pasado como parámetro
      const quoter = new ethers.Contract(
        quoterAddress, 
        [
          "function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256)"
        ], 
        provider
      );
      
      // Estructura correcta según la definición del contrato
      const params = {
        tokenIn: pair.tokenA,
        tokenOut: pair.tokenB,
        amountIn: pair.amountIn,
        fee: 3000,
        sqrtPriceLimitX96: 0
      };
      
      return await quoter.callStatic.quoteExactInputSingle(params);
    } catch (error) {
      console.log("Error de UniswapV3:", error.message);
      return null;
    }
  }
  
  return null; // Para la prueba simplificada
}

// Función principal de prueba
async function main() {
  console.log("=== Ejecutando prueba de soluciones ===");
  
  const provider = new ethers.providers.JsonRpcProvider("https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F");
  const [deployer] = await ethers.getSigners();
  
  // Test de estimateProfit
  const amountIn = ethers.utils.parseUnits("1000", 6); // 1000 USDC
  const bestOutput = ethers.utils.parseEther("0.4"); // 0.4 ETH
  const worstOutput = ethers.utils.parseEther("0.3"); // 0.3 ETH
  
  const profitInfo = estimateProfit(amountIn, bestOutput, worstOutput, TOKENS.USDC, 6);
  console.log("Test estimateProfit:", profitInfo);
  
  // Test de getTokenPrice
  const pair = {
    tokenA: TOKENS.USDC,
    tokenB: TOKENS.WETH,
    amountIn: ethers.utils.parseUnits("1000", 6)
  };
  
  try {
    const quote = await getTokenPrice("UniswapV3", null, pair, deployer, provider);
    console.log("Test getTokenPrice:", quote ? ethers.utils.formatEther(quote) : "null");
  } catch (error) {
    console.error("Error en prueba getTokenPrice:", error);
  }
  
  console.log("=== Prueba completada ===");
}

main().catch(error => console.error("Error:", error));
