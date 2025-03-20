import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import * as fs from 'fs';
import * as path from 'path';

console.log(`Ejecutando en red: Base Mainnet`);

// Importar ABIs de manera dinámica
function loadAbi(dexName: string, contractType: string = 'router'): any {
  // Primero intentamos cargar desde la carpeta específica de mainnet
  const networkPath = path.join(__dirname, '..', 'external', 'abis', 'mainnet', dexName, `${contractType.toLowerCase()}.json`);
  
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

// Definir direcciones de tokens en Base Mainnet
const TOKENS = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"
};

// Routers en Base Mainnet
const DEX_ROUTERS = {
  AerodromeSS: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
  Aerodrome: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  Alienbase: "0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7",
  BaseSwap: "0x1B8eea9315bE495187D873DA7773a874545D9D48",
  SwapBased: "0x756C6BbDd915202adac7beBB1c6C89aC0886503f",
  UniswapV2: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  UniswapV3: "0x2626664c2603336E57B271c5C0b26F421741e481",
  UniswapV4: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  PancakeSwap: "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb",
  SushiSwapV2: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891"
};

// Cargar pares descubiertos dinámicamente
let DISCOVERED_PAIRS = [];
try {
  const pairsPath = path.join(__dirname, '..', 'data', 'pairs-mainnet.json');
  if (fs.existsSync(pairsPath)) {
    DISCOVERED_PAIRS = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
    console.log(`Cargados ${DISCOVERED_PAIRS.length} pares desde ${pairsPath}`);
  }
} catch (error) {
  console.warn("⚠️ No se encontraron pares descubiertos. Usando pares predefinidos.");
}

// Pares a monitorear (combina predefinidos y descubiertos)
const PAIRS_TO_MONITOR = [
  { tokenA: TOKENS.USDC, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 6), decimalsA: 6, decimalsB: 18 },
  { tokenA: TOKENS.DAI, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 18 },
  { tokenA: TOKENS.USDC, tokenB: TOKENS.DAI, amountIn: ethers.utils.parseUnits("1000", 6), decimalsA: 6, decimalsB: 18 }
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
  flashLoanFee: 0.0009, // 0.09%
  minProfitUsd: 10,
  estimatedGasCostEth: 0.005,
  ethPriceUsd: 3000,
  tokenPriceUsd: {
    [TOKENS.WETH]: 3000,
    [TOKENS.USDC]: 1,
    [TOKENS.DAI]: 1
  },
  maxRetries: 3,
  pollingInterval: 5000, // ms
  flashLoanContractAddress: "0xCc0801A1f1E0D5eAe68d1d4dF7D82881D36c4fdb"
};

// Añadir al monitor-arbitrage-mainnet.ts (similar a testnet)
// Crear un registro de pares que han mostrado diferencias de precio significativas
const pairPerformance = {};
let cycleCount = 0;

// Intentar cargar el historial de rendimiento si existe
const performancePath = path.join(__dirname, '..', 'data', 'performance-mainnet.json');
try {
  if (fs.existsSync(performancePath)) {
    Object.assign(pairPerformance, JSON.parse(fs.readFileSync(performancePath, 'utf8')));
    console.log(`Cargado historial de rendimiento para ${Object.keys(pairPerformance).length} pares`);
  }
} catch (error) {
  console.warn("⚠️ No se pudo cargar el historial de rendimiento");
}

// Configuración de procesamiento por lotes
const BATCH_SIZE = 20; // Más grande para mainnet por tener más pares
const BATCH_DELAY = 1000;

/**
 * Función para intentar operaciones con reintentos
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 0): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries < CONFIG.maxRetries) {
      console.log(`Reintentando operación... (${retries + 1}/${CONFIG.maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
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
): { profitInToken: BigNumber; profitUsd: number } {
  // Calcular la comisión del préstamo flash
  const flashLoanFee = amountIn.mul(Math.floor(CONFIG.flashLoanFee * 10000)).div(10000);
  
  // Calcular el costo del gas en wei
  const gasCostWei = ethers.utils.parseEther(CONFIG.estimatedGasCostEth.toString());
  
  // Convertir el costo del gas a tokens
  const tokenPrice = CONFIG.tokenPriceUsd[tokenAddress] || 1;
  const tokenPriceEth = tokenPrice / CONFIG.ethPriceUsd;
  const gasCostInToken = gasCostWei.mul(ethers.utils.parseUnits("1", tokenDecimals))
    .div(ethers.utils.parseEther(tokenPriceEth.toString()));
  
  // Calcular beneficio neto
  const profitInToken = bestOutput.sub(worstOutput).sub(flashLoanFee).sub(gasCostInToken);
  const profitUsd = parseFloat(ethers.utils.formatUnits(profitInToken, tokenDecimals)) * tokenPrice;
  
  return { profitInToken, profitUsd };
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

/**
 * Función principal de monitoreo
 */
async function main() {
  console.log("=== Iniciando monitoreo de oportunidades de arbitraje en Base Mainnet ===");
  console.log(`Fecha/Hora: ${new Date().toLocaleString()}`);

  const [deployer] = await ethers.getSigners();
  console.log(`Monitoreo usando la dirección: ${deployer.address}`);
  
  // Cargar la instancia del contrato FlashLoan
  const flashLoan = await ethers.getContractAt(
    "FlashLoanBaseSepolia",
    CONFIG.flashLoanContractAddress,
    deployer
  );

  // Crear instancias de todos los routers usando las ABIs descargadas
  const dexRouters: Record<string, Contract> = {};
  for (const [dexName, routerAddress] of Object.entries(DEX_ROUTERS)) {
    try {
      const abi = loadAbi(dexName);
      dexRouters[dexName] = new ethers.Contract(routerAddress, abi, deployer);
      console.log(`✅ Router cargado: ${dexName}`);
    } catch (error) {
      console.error(`❌ Error cargando router ${dexName}:`, error);
    }
  }
  
  console.log(`\nMonitoreando ${PAIRS_TO_MONITOR.length} pares de tokens...`);

  // Monitorización continua
  while (true) {
    for (const pair of PAIRS_TO_MONITOR) {
      try {
        // Obtener símbolo para log más legible
        const tokenSymbol = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenA)?.[0] || 'Unknown';
        const tokenBSymbol = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenB)?.[0] || 'Unknown';
        
        console.log(`\n----- Verificando par ${tokenSymbol}/${tokenBSymbol} -----`);
        
        // Preparar ruta para getAmountsOut
        const path = [pair.tokenA, pair.tokenB];
        
        // Resultados por DEX
        const results: {
          dexName: string;
          amountOut: BigNumber;
          formattedAmount: string;
        }[] = [];

        // Consultar cada DEX
        for (const [dexName, router] of Object.entries(dexRouters)) {
          try {
            // Para UniswapV2-like (y la mayoría de los forks)
            if (router.interface.getFunction('getAmountsOut')) {
              const amounts = await fetchWithRetry(() => 
                router.getAmountsOut(pair.amountIn, path)
              );
              const amountOut = amounts[1];
              const formattedAmount = ethers.utils.formatUnits(amountOut, pair.decimalsB);
              
              results.push({
                dexName,
                amountOut,
                formattedAmount
              });
              
              console.log(`${dexName}: ${formattedAmount} ${tokenBSymbol}`);
            }
            // Para UniswapV3
            else if (dexName === 'UniswapV3') {
              try {
                // Cargar ABI del Quoter
                const quoterAddress = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"; // Mainnet
                const quoterAbi = loadAbi('UniswapV3', 'quoter');
                const quoter = new ethers.Contract(quoterAddress, quoterAbi, deployer);
                const amountOut = await quoter.callStatic.quoteExactInputSingle(
                  pair.tokenA, pair.tokenB, 3000, pair.amountIn, 0
                );
                
                const formattedAmount = ethers.utils.formatUnits(amountOut, pair.decimalsB);
                results.push({
                  dexName,
                  amountOut,
                  formattedAmount
                });
                
                console.log(`${dexName}: ${formattedAmount} ${tokenBSymbol}`);
              } catch (error) {
                console.log(`${dexName}: Error al consultar precios: ${error.message}`);
              }
            }
            // Para Aerodrome y AerodromeSS (tienen una interfaz diferente)
            else if (dexName === 'Aerodrome' || dexName === 'AerodromeSS') {
              try {
                // Aerodrome usa una función diferente para quotes
                // Intentemos con quoteExactInputSingle si existe
                if (router.interface.getFunction('quoteExactInputSingle')) {
                  const amountOut = await router.callStatic.quoteExactInputSingle(
                    pair.tokenA,
                    pair.tokenB,
                    true, // stable (podría necesitar un valor diferente según el par)
                    pair.amountIn
                  );
                  
                  const formattedAmount = ethers.utils.formatUnits(amountOut, pair.decimalsB);
                  results.push({
                    dexName,
                    amountOut,
                    formattedAmount
                  });
                  
                  console.log(`${dexName}: ${formattedAmount} ${tokenBSymbol}`);
                }
                // Si no existe quoteExactInputSingle, intenta con quote
                else if (router.interface.getFunction('quote')) {
                  const amountOut = await router.callStatic.quote(
                    pair.amountIn, 
                    pair.tokenA, 
                    pair.tokenB
                  );
                  
                  const formattedAmount = ethers.utils.formatUnits(amountOut, pair.decimalsB);
                  results.push({
                    dexName,
                    amountOut,
                    formattedAmount
                  });
                  
                  console.log(`${dexName}: ${formattedAmount} ${tokenBSymbol}`);
                }
                else {
                  console.log(`${dexName}: No se encontró un método compatible para consultar precios`);
                }
              } catch (error) {
                console.log(`${dexName}: Error específico al consultar precios: ${error.message}`);
              }
            }
          } catch (error) {
            console.log(`${dexName}: Error al consultar precios. Posible incompatibilidad de interfaz.`);
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
          
          // Si el beneficio supera el umbral mínimo, ejecutar arbitraje
          if (profitData.profitUsd > CONFIG.minProfitUsd) {
            console.log(`\n🚀 OPORTUNIDAD DE ARBITRAJE DETECTADA!`);
            console.log(`Beneficio esperado: $${profitData.profitUsd.toFixed(2)}`);
            
            try {
              // Obtener direcciones de routers por nombre
              const bestDex = DEX_ROUTERS[best.dexName];
              const worstDex = DEX_ROUTERS[worst.dexName];
              
              console.log(`Ejecutando flash loan para arbitraje entre ${best.dexName} y ${worst.dexName}...`);
              
              // Implementar llamada al contrato de flashloan
              const tx = await flashLoan.requestFlashLoan(
                pair.tokenA,                // Token a pedir prestado
                pair.amountIn,              // Cantidad a pedir prestado
                bestDex,                    // DEX con mejor precio para vender
                worstDex,                   // DEX con peor precio para comprar
                ethers.constants.MaxUint256 // Slippage mínimo aceptable
              );
              
              console.log(`Transacción enviada: ${tx.hash}`);
              await tx.wait();
              console.log(`¡Arbitraje completado exitosamente!`);
            } catch (error) {
              console.error("❌ Error ejecutando arbitraje:", error);
            }
          }
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
  console.error("❌ Error fatal en el monitor de mainnet:", error);
  process.exit(1);
});
