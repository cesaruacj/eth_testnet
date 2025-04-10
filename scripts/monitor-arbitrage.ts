import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import * as fs from 'fs';
import * as path from 'path';

console.log(`Ejecutando en red: Ethereum Sepolia`);

// Importar ABIs de manera dinámica
function loadAbi(dexName: string, contractType: string = 'router'): any {
  // Primero intentamos cargar desde la carpeta específica de sepolia
  const networkPath = path.join(__dirname, '..', 'external', 'abis', 'sepolia', dexName, `${contractType.toLowerCase()}.json`);
  
  if (fs.existsSync(networkPath)) {
    return JSON.parse(fs.readFileSync(networkPath, 'utf8'));
  }
  
  // Si no existe, usamos el fallback a la ruta antigua por compatibilidad
  const legacyPath = path.join(__dirname, '..', 'external', 'abis', dexName, `${contractType.toLowerCase()}.json`);
  
  if (fs.existsSync(legacyPath)) {
    console.log(`⚠️ Usando ABI legacy para ${dexName} ${contractType}`);
    return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  }
  
  throw new Error(`ABI no encontrada para ${dexName} ${contractType}`);
}

// Tokens en Ethereum Sepolia
const TOKENS = {
  UNI:  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI Sepolia (18 decimals)
  YU:   "0xe0232d625ea3b94698f0a7dff702931b704083c9", // Yala stable coin Sepolia (6 decimals)
  MON:  "0x810a3b22c91002155d305c4ce032978e3a97f8c4", // MON Sepolia (18 decimals)
  YBTC: "0xbbd3edd4d3b519c0d14965d9311185cfac8c3220", // YBTC Sepolia (8 decimals)
  WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14"  // WETH Sepolia (18 decimals)
};

// Routers en Sepolia - Solo mantenemos SushiSwapV2, BalancerV2, UniswapV3 y UniswapV4
const DEX_ROUTERS = {
  SushiSwapV2: "0xeaBcE3E74EF41FB40024a21Cc2ee2F5dDc615791",
  UniswapV3: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  UniswapV4: "0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b",
  BalancerV2: "0x5e315f96389C1aaF9324D97d3512ae1e0Bf3C21a"
};

// Cargar pares descubiertos dinámicamente
let DISCOVERED_PAIRS = [];
try {
  const pairsPath = path.join(__dirname, '..', 'data', 'pairs-sepolia.json');
  if (fs.existsSync(pairsPath)) {
    DISCOVERED_PAIRS = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
    console.log(`Cargados ${DISCOVERED_PAIRS.length} pares desde ${pairsPath}`);
  }
} catch (error) {
  console.warn("⚠️ No se encontraron pares descubiertos. Usando pares predefinidos.");
}

// Pares a monitorear (corregido para eliminar METH que no existe)
const PAIRS_TO_MONITOR = [
  {
    tokenA: TOKENS.UNI,
    tokenB: TOKENS.WETH,  // Cambiado de METH a WETH
    amountIn: ethers.utils.parseUnits("1000", 18),
    decimalsA: 18,
    decimalsB: 18
  },
  {
    tokenA: TOKENS.YU,
    tokenB: TOKENS.WETH,  // Cambiado de METH a WETH
    amountIn: ethers.utils.parseUnits("1000", 6),
    decimalsA: 6,
    decimalsB: 18
  },
  {
    tokenA: TOKENS.UNI,
    tokenB: TOKENS.YU,
    amountIn: ethers.utils.parseUnits("1000", 18),
    decimalsA: 18,
    decimalsB: 6
  },
  {
    tokenA: TOKENS.UNI,
    tokenB: TOKENS.MON,
    amountIn: ethers.utils.parseUnits("1000", 18),
    decimalsA: 18,
    decimalsB: 18
  },
  {
    tokenA: TOKENS.MON,
    tokenB: TOKENS.WETH,
    amountIn: ethers.utils.parseUnits("1000", 18),
    decimalsA: 18,
    decimalsB: 18
  },
  {
    tokenA: TOKENS.MON,
    tokenB: TOKENS.YBTC,
    amountIn: ethers.utils.parseUnits("1000", 18),
    decimalsA: 18,
    decimalsB: 8
  },
  {
    tokenA: TOKENS.YBTC,
    tokenB: TOKENS.WETH,
    amountIn: ethers.utils.parseUnits("1000", 8),
    decimalsA: 8,
    decimalsB: 18
  },
  {
    tokenA: TOKENS.WETH,
    tokenB: TOKENS.YBTC,
    amountIn: ethers.utils.parseUnits("1000", 18),
    decimalsA: 18,
    decimalsB: 8
  }
];

// Agregar pares descubiertos (opcional: limitar a un máximo)
const MAX_PAIRS = 20; // Máximo de pares a monitorear
if (DISCOVERED_PAIRS.length > 0) {
  for (const pair of DISCOVERED_PAIRS.slice(0, MAX_PAIRS)) {
    // Filtrar pares que ya existen
    const exists = PAIRS_TO_MONITOR.some(p => 
      (p.tokenA === pair.token0.address && p.tokenB === pair.token1.address) || 
      (p.tokenA === pair.token1.address && p.tokenB === pair.token0.address)
    );
    
    if (!exists) {
      // Determinar el amount in basado en decimales
      const amountIn = ethers.utils.parseUnits("1000", pair.token0.decimals);
      
      PAIRS_TO_MONITOR.push({
        tokenA: pair.token0.address,
        tokenB: pair.token1.address,
        amountIn,
        decimalsA: pair.token0.decimals,
        decimalsB: pair.token1.decimals
      });
    }
  }
}

console.log(`Total de pares a monitorear: ${PAIRS_TO_MONITOR.length}`);

// Configuración de la aplicación
const CONFIG = {
  flashLoanFee: 0.0009,          // 0.09%
  expectedSlippage: 0.01,        // 1% de slippage esperado
  minProfitUsd: 3,               // Beneficio mínimo en USD
  estimatedGasCostEth: 0.002,    // 0.002 ETH (ajustado para Sepolia)
  ethPriceUsd: 3000,
  tokenPriceUsd: {
    [TOKENS.WETH]: 3000,
    [TOKENS.YU]: 1    // Asumimos YU como stablecoin
  },
  maxRetries: 3,
  pollingInterval: 5000, // ms
  flashLoanContractAddress: "0x012B50B13Be3cEfe9B2Bd51b1685A81e4eCE16D5" // dirección del contrato FlashLoan
};

/**
 * Función para intentar operaciones con reintentos
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 0): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries < CONFIG.maxRetries) {
      console.log(`Reintentando operación... (${retries + 1}/${CONFIG.maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, retries)));
      return fetchWithRetry(fn, retries + 1);
    }
    throw error;
  }
}

/**
 * Estima la ganancia potencial de una operación de arbitraje
 */
function estimateProfit(
  amountIn: BigNumber, 
  bestOutput: BigNumber, 
  worstOutput: BigNumber, 
  tokenAddress: string,
  tokenDecimals: number
): { profitInToken: BigNumber; profitUsd: number; isRentable: boolean } {
  // Calcular la comisión del préstamo flash
  const flashLoanFee = amountIn.mul(Math.floor(CONFIG.flashLoanFee * 10000)).div(10000);
  
  // Calcular el costo del gas en wei
  const gasCostWei = ethers.utils.parseEther(CONFIG.estimatedGasCostEth.toString());
  
  // Convertir el costo del gas a tokens
  const tokenPrice = CONFIG.tokenPriceUsd[tokenAddress] || 1;
  const tokenPriceEth = tokenPrice / CONFIG.ethPriceUsd;
  
  let gasCostInToken: BigNumber;
  try {
    // Intenta el cálculo original
    gasCostInToken = gasCostWei.mul(ethers.utils.parseUnits("1", tokenDecimals))
      .div(ethers.utils.parseEther(tokenPriceEth.toString()));
  } catch (error) {
    // Usa un enfoque alternativo con menos precisión pero que no falla
    const gasInTokenRaw = CONFIG.estimatedGasCostEth * CONFIG.ethPriceUsd / tokenPrice;
    gasCostInToken = ethers.utils.parseUnits(gasInTokenRaw.toFixed(6), tokenDecimals);
  }
  
  // Slippage estimado (1% por defecto)
  const slippageAmount = bestOutput.mul(Math.floor(CONFIG.expectedSlippage * 10000)).div(10000);
  
  // Calcular beneficio neto considerando todos los costos
  const profitInToken = bestOutput
    .sub(worstOutput)             // Diferencia entre precios
    .sub(flashLoanFee)            // Menos comisión del flash loan
    .sub(gasCostInToken)          // Menos costo del gas
    .sub(slippageAmount);         // Menos impacto del slippage
  
  const profitUsd = parseFloat(ethers.utils.formatUnits(profitInToken, tokenDecimals)) * tokenPrice;
  
  // Determinar si es rentable (beneficio > umbral mínimo)
  const isRentable = profitInToken.gt(BigNumber.from(0)) && profitUsd > CONFIG.minProfitUsd;
  
  return { profitInToken, profitUsd, isRentable };
}

/**
 * Devuelve el nombre del DEX a partir de su dirección
 */
function getDexNameByAddress(address: string): string {
  for (const [name, routerAddress] of Object.entries(DEX_ROUTERS)) {
    if (routerAddress.toLowerCase() === address.toLowerCase()) {
      return name;
    }
  }
  return "Unknown";
}

// Función para consultar precio según tipo de DEX
async function getTokenPrice(
  dexName: string, 
  router: Contract, 
  pair: any, 
  deployer: any,
  provider: ethers.providers.Provider
): Promise<BigNumber | null> {
  try {
    // 1. SushiSwapV2 (compatible con UniswapV2)
    if (dexName === 'SushiSwapV2') {
      if (router.interface.functions['getAmountsOut(uint256,address[])']) {
        const path = [pair.tokenA, pair.tokenB];
        const amounts = await fetchWithRetry(() => router.getAmountsOut(pair.amountIn, path));
        return amounts[1];
      }
    }
    
    // 2. BalancerV2
    if (dexName === 'BalancerV2') {
      if (router.interface.functions['getAmountOut(address,address,uint256)']) {
        return await router.getAmountOut(pair.tokenA, pair.tokenB, pair.amountIn);
      }
    }
    
    // 3. UniswapV3
    if (dexName === 'UniswapV3') {
      const quoterAddress = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3"; // Quoter en Sepolia
      try {
        // Crear instancia del contrato quoter
        const quoterAbi = loadAbi("UniswapV3", "quoter");
        const quoter = new ethers.Contract(quoterAddress, quoterAbi, provider);
        
        try {
          // Intentar con quoteExactInputSingle(tuple)
          const params = {
            tokenIn: pair.tokenA,
            tokenOut: pair.tokenB,
            fee: 3000,
            amountIn: pair.amountIn,
            sqrtPriceLimitX96: 0
          };
          return await quoter.callStatic.quoteExactInputSingle(params);
        } catch (innerError) {
          // Si falla, intentar con parámetros individuales
          return await quoter.callStatic.quoteExactInputSingle(
            pair.tokenA,
            pair.tokenB,
            3000,
            pair.amountIn,
            0
          );
        }
      } catch (error) {
        console.log(`UniswapV3: Error con el quoter: ${error.message}`);
        return null;
      }
    }
    
    // 4. UniswapV4
    if (dexName === 'UniswapV4') {
      const quoterAddress = "0x61b3f2011a92d183c7dbadbda940a7555ccf9227"; // Quoter para UniswapV4 en Sepolia
      try {
        const quoterAbi = loadAbi("UniswapV4", "quoter");
        const quoter = new ethers.Contract(quoterAddress, quoterAbi, provider);
        
        return await quoter.callStatic.quoteExactInputSingle(
          pair.tokenA,
          pair.tokenB,
          3000, // Usar fee tier 0.3%
          pair.amountIn,
          0 // Sin limite de precio
        );
      } catch (error) {
        console.log(`UniswapV4: Error con el quoter: ${error.message}`);
        return null;
      }
    }
    
    // 5. Fallback general - intentar con quote directo si existe
    if (router.interface.functions['quote(uint256,address,address)']) {
      return await router.quote(pair.amountIn, pair.tokenA, pair.tokenB);
    }
    
    return null;
  } catch (error) {
    console.log(`${dexName}: Error consultando precio: ${error.message}`);
    return null;
  }
}

/**
 * New function to quickly check liquidity across DEXes
 */
async function checkLiquidityQuickly(dexRouters: Record<string, Contract>, provider: ethers.providers.Provider) {
  console.log("🔍 Checking liquidity for all pairs across DEXes...");
  
  // Store liquidity information
  const liquidityMap: Record<string, string[]> = {};
  
  // Create batch of promises for parallel execution
  const liquidityChecks: Promise<void>[] = [];
  
  for (const pair of PAIRS_TO_MONITOR) {
    const pairKey = `${pair.tokenA}_${pair.tokenB}`;
    liquidityMap[pairKey] = [];
    
    for (const [dexName, router] of Object.entries(dexRouters)) {
      // Create a promise for each check but don't wait
      const check = async () => {
        try {
          const amountOut = await getTokenPrice(dexName, router, pair, null, provider);
          if (amountOut && !amountOut.isZero()) {
            liquidityMap[pairKey].push(dexName);
          }
        } catch (error) {
          // Silently fail - we're just checking quickly
        }
      };
      
      liquidityChecks.push(check());
    }
  }
  
  // Set timeout to limit how long we wait
  const timeoutPromise = new Promise<void>(resolve => setTimeout(() => resolve(), 5000));
  
  // Wait for all checks to complete or timeout
  await Promise.race([
    Promise.allSettled(liquidityChecks),
    timeoutPromise
  ]);
  
  // Display results
  console.log("\n===== LIQUIDITY SUMMARY =====");
  for (const [pairKey, dexes] of Object.entries(liquidityMap)) {
    const [tokenAAddr, tokenBAddr] = pairKey.split('_');
    const tokenA = Object.entries(TOKENS).find(([, addr]) => addr === tokenAAddr)?.[0] || 'Unknown';
    const tokenB = Object.entries(TOKENS).find(([, addr]) => addr === tokenBAddr)?.[0] || 'Unknown';
    
    if (dexes.length >= 2) {
      console.log(`✅ ${tokenA}/${tokenB}: Liquidity on ${dexes.length} DEXes (${dexes.join(', ')})`);
    } else if (dexes.length === 1) {
      console.log(`⚠️ ${tokenA}/${tokenB}: Liquidity on only 1 DEX (${dexes.join(', ')})`);
    } else {
      console.log(`❌ ${tokenA}/${tokenB}: No liquidity found`);
    }
  }
  console.log("============================\n");
  
  return liquidityMap;
}

/**
 * Función principal de monitoreo
 */
async function main() {
  console.log("=== Iniciando monitoreo de oportunidades de arbitraje en Ethereum Sepolia ===");
  console.log(`Fecha/Hora: ${new Date().toLocaleString()}`);
  console.log("Usando conexión directa a Ethereum Sepolia para consultar precios");
  const provider = new ethers.providers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/JDR4rpYy7x_w4r0Z0P5QV9W-f_H7DqZ7");

  const [deployer] = await ethers.getSigners();
  console.log(`Monitoreo usando la dirección: ${deployer.address}`);
  
  // Cargar la instancia del contrato FlashLoan
  const flashLoan = await ethers.getContractAt(
    "FlashLoanSepolia",
    CONFIG.flashLoanContractAddress,
    deployer
  );

  // Crear instancias de todos los routers usando las ABIs descargadas
  const dexRouters: Record<string, Contract> = {};
  for (const [dexName, routerAddress] of Object.entries(DEX_ROUTERS)) {
    try {
      const abi = loadAbi(dexName);
      dexRouters[dexName] = new ethers.Contract(routerAddress, abi, provider);
      console.log(`✅ Router cargado: ${dexName}`);
    } catch (error) {
      console.error(`❌ Error cargando router ${dexName}:`, error);
    }
  }
  
  console.log(`\nMonitoreando ${PAIRS_TO_MONITOR.length} pares de tokens...`);

  // Quick liquidity check before starting monitoring
  const liquidityMap = await checkLiquidityQuickly(dexRouters, provider);
  
  // Optional: Filter pairs to only monitor those with sufficient liquidity
  const pairsWithLiquidity = PAIRS_TO_MONITOR.filter(pair => {
    const pairKey = `${pair.tokenA}_${pair.tokenB}`;
    return liquidityMap[pairKey] && liquidityMap[pairKey].length >= 2;
  });
  
  console.log(`Found ${pairsWithLiquidity.length} pairs with liquidity on at least 2 DEXes`);

  // Monitorización continua
  while (true) {
    for (const pair of pairsWithLiquidity) {
      try {
        // Obtener símbolo para log más legible
        const tokenSymbol = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenA)?.[0] || 'Unknown';
        const tokenBSymbol = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenB)?.[0] || 'Unknown';
        
        console.log(`\n----- Verificando par ${tokenSymbol}/${tokenBSymbol} -----`);
        
        // Resultados por DEX
        const results: {
          dexName: string;
          amountOut: BigNumber;
          formattedAmount: string;
        }[] = [];

        // Obtener precios de todos los DEXes
        for (const [dexName, router] of Object.entries(dexRouters)) {
          try {
            const amountOut = await getTokenPrice(dexName, router, pair, deployer, provider);
            
            if (amountOut) {
              const formattedAmount = ethers.utils.formatUnits(amountOut, pair.decimalsB);
              
              results.push({
                dexName,
                amountOut,
                formattedAmount
              });
              
              console.log(`${dexName}: ${formattedAmount} ${tokenBSymbol}`);
            }
          } catch (error) {
            console.log(`${dexName}: Error al consultar precios: ${error.message}`);
          }
        }
        
        // Si hay al menos dos resultados, podemos analizar arbitraje
        if (results.length >= 2) {
          // Ordenar por amountOut descendente
          results.sort((a, b) => b.amountOut.gt(a.amountOut) ? 1 : -1);
          
          const best = results[0];
          const worst = results[results.length - 1];
          
          // Calcular diferencia de precio
          const priceDiff = best.amountOut.sub(worst.amountOut)
            .mul(10000).div(worst.amountOut).toNumber() / 100;
            
          console.log(`\nDiferencia de precio: ${priceDiff.toFixed(2)}%`);
          console.log(`Mejor precio: ${best.dexName} (${best.formattedAmount} ${tokenBSymbol})`);
          console.log(`Peor precio: ${worst.dexName} (${worst.formattedAmount} ${tokenBSymbol})`);
          
          // Calcular beneficio potencial
          const profitData = estimateProfit(
            pair.amountIn,
            best.amountOut,
            worst.amountOut,
            pair.tokenA,
            pair.decimalsA
          );
          
          console.log(`Beneficio estimado: ${ethers.utils.formatUnits(profitData.profitInToken, pair.decimalsA)} ${tokenSymbol} ($${profitData.profitUsd.toFixed(2)})`);
          
          // Si el beneficio supera el umbral mínimo y es rentable, ejecutar arbitraje
          if (profitData.isRentable) {
            console.log(`\n🚀 OPORTUNIDAD DE ARBITRAJE RENTABLE DETECTADA!`);
            console.log(`Beneficio neto esperado: $${profitData.profitUsd.toFixed(2)} (después de todos los costos)`);
            console.log(`Beneficio positivo en tokens: ${ethers.utils.formatUnits(profitData.profitInToken, pair.decimalsA)} ${tokenSymbol}`);
            
            try {
              // Obtener direcciones de routers por nombre
              const bestDex = DEX_ROUTERS[best.dexName];
              const worstDex = DEX_ROUTERS[worst.dexName];
              
              console.log(`Ejecutando flash loan para arbitraje entre ${best.dexName} y ${worst.dexName}...`);
              
              // Implementar llamada al contrato de flashloan
              const tx = await flashLoan.executeFlashLoan(
                pair.tokenA,                // Token a pedir prestado
                pair.amountIn               // Cantidad a pedir prestado
              );
              
              console.log(`Transacción enviada: ${tx.hash}`);
              await tx.wait();
              console.log(`¡Arbitraje completado exitosamente!`);
            } catch (error) {
              console.error("❌ Error ejecutando arbitraje:", error);
            }
          } else if (profitData.profitUsd > 0) {
            console.log(`\n⚠️ OPORTUNIDAD DE ARBITRAJE DETECTADA PERO NO SUFICIENTEMENTE RENTABLE`);
            console.log(`Beneficio estimado: $${profitData.profitUsd.toFixed(2)} (menor que $${CONFIG.minProfitUsd} requerido)`);
          } else {
            console.log(`\n❌ NO RENTABLE: El beneficio neto es negativo después de considerar todos los costos.`);
          }
        } else {
          console.log(`No hay suficientes DEXes con liquidez para este par.`);
        }
      } catch (error) {
        console.error(`❌ Error verificando par ${pair.tokenA}/${pair.tokenB}:`, error);
      }
    }
    
    // Espera antes del siguiente ciclo
    console.log(`\nEsperando ${CONFIG.pollingInterval / 1000} segundos para el siguiente ciclo...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.pollingInterval));
  }
}

// Iniciar el monitoreo
main().catch((error) => {
  console.error("❌ Error fatal en el monitor de sepolia:", error);
  process.exit(1);
});
