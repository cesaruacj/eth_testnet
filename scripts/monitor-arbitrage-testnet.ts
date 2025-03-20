import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import * as fs from 'fs';
import * as path from 'path';

console.log(`Ejecutando en red: Base Sepolia (testnet)`);

// Importar ABIs de manera dinámica
function loadAbi(dexName: string, contractType: string = 'router'): any {
  // Primero intentamos cargar desde la carpeta específica de testnet
  const networkPath = path.join(__dirname, '..', 'external', 'abis', 'testnet', dexName, `${contractType.toLowerCase()}.json`);
  
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

// Definir direcciones de tokens en Base Sepolia
const TOKENS = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  DAI: "0x693ac4be0a2cad9aa38a8cc1d9fc0b9d8c54111f"
};

// Routers en Base Sepolia
const DEX_ROUTERS = {
  UniswapV3: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  UniswapV4: "0x492e6456d9528771018deb9e87ef7750ef184104"
};

// Cargar pares descubiertos dinámicamente
let DISCOVERED_PAIRS = [];
try {
  const pairsPath = path.join(__dirname, '..', 'data', 'pairs-testnet.json');
  if (fs.existsSync(pairsPath)) {
    DISCOVERED_PAIRS = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
  }
} catch (error) {
  console.warn("⚠️ No se encontraron pares descubiertos. Usando pares predefinidos.");
}

// Al cargar pares descubiertos, ordenarlos por liquidez/volumen
if (DISCOVERED_PAIRS.length > 0) {
  // Ordenar pares por liquidez (usando reserves como indicador)
  DISCOVERED_PAIRS.sort((a, b) => {
    const liquidityA = BigNumber.from(a.reserves[0]).add(BigNumber.from(a.reserves[1]));
    const liquidityB = BigNumber.from(b.reserves[0]).add(BigNumber.from(b.reserves[1]));
    return liquidityB.gt(liquidityA) ? 1 : -1;
  });
  
  console.log(`Pares ordenados por liquidez: ${DISCOVERED_PAIRS.length}`);
}

// Pares a monitorear (combina predefinidos y descubiertos)
const PAIRS_TO_MONITOR = [
  { tokenA: TOKENS.USDC, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 6), decimalsA: 6, decimalsB: 18 },
  { tokenA: TOKENS.DAI, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 18 },
  { tokenA: TOKENS.USDC, tokenB: TOKENS.DAI, amountIn: ethers.utils.parseUnits("1000", 6), decimalsA: 6, decimalsB: 18 }
];

// Agregar pares descubiertos (opcional: limitar a un máximo)
const MAX_PAIRS = Infinity; // O un valor muy alto como 1000
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

// Configuración de la aplicación (valores más bajos para testnet)
const CONFIG = {
  flashLoanFee: 0.0009, // 0.09%
  minProfitUsd: 1, // Umbral más bajo para testnet
  estimatedGasCostEth: 0.002,
  ethPriceUsd: 3000,
  tokenPriceUsd: {
    [TOKENS.WETH]: 3000,
    [TOKENS.USDC]: 1,
    [TOKENS.DAI]: 1
  },
  maxRetries: 3,
  pollingInterval: 10000, // ms (mayor para no sobrecargar los nodos de testnet)
  flashLoanContractAddress: "0xCc0801A1f1E0D5eAe68d1d4dF7D82881D36c4fdb" // Dirección del contrato FlashLoan en Sepolia
};

// Añadir después de las constantes CONFIG

// Crear un registro de pares que han mostrado diferencias de precio significativas
const pairPerformance = {};
let cycleCount = 0;

// Intentar cargar el historial de rendimiento si existe
const performancePath = path.join(__dirname, '..', 'data', 'performance-testnet.json');
try {
  if (fs.existsSync(performancePath)) {
    Object.assign(pairPerformance, JSON.parse(fs.readFileSync(performancePath, 'utf8')));
    console.log(`Cargado historial de rendimiento para ${Object.keys(pairPerformance).length} pares`);
  }
} catch (error) {
  console.warn("⚠️ No se pudo cargar el historial de rendimiento");
}

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

// configuración de procesamiento en lotes
const BATCH_SIZE = 10; // Número de pares a procesar en cada lote
const BATCH_DELAY = 1000; // Milisegundos entre lotes

/**
 * Función principal de monitoreo
 */
async function main() {
  console.log("=== Iniciando monitoreo de oportunidades de arbitraje en Base Sepolia ===");
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
    // Procesar en lotes de BATCH_SIZE
    for (let i = 0; i < PAIRS_TO_MONITOR.length; i += BATCH_SIZE) {
      const batch = PAIRS_TO_MONITOR.slice(i, i + BATCH_SIZE);
      console.log(`\nProcesando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(PAIRS_TO_MONITOR.length/BATCH_SIZE)}...`);
      
      // Procesar el lote actual en paralelo
      await Promise.all(batch.map(pair => processPair(pair)));
      
      // Esperar entre lotes para no sobrecargar la red
      if (i + BATCH_SIZE < PAIRS_TO_MONITOR.length) {
        console.log(`Esperando ${BATCH_DELAY}ms antes del siguiente lote...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    // Reorganizar pares periódicamente
    cycleCount++;
    if (cycleCount % 5 === 0) {
      console.log("\nReorganizando pares según rendimiento histórico...");
      
      // Priorizar pares que han mostrado beneficios o diferencias interesantes
      PAIRS_TO_MONITOR.sort((a, b) => {
        const keyA = `${a.tokenA}-${a.tokenB}`;
        const keyB = `${b.tokenA}-${b.tokenB}`;
        const perfA = pairPerformance[keyA]?.maxDiff || 0;
        const perfB = pairPerformance[keyB]?.maxDiff || 0;
        return perfB - perfA;
      });
      
      // Guardar historial de rendimiento cada cierto número de ciclos
      fs.writeFileSync(performancePath, JSON.stringify(pairPerformance, null, 2));
      console.log("Historial de rendimiento guardado");
    }
    
    // Espera antes del siguiente ciclo completo
    console.log(`\nEsperando ${CONFIG.pollingInterval / 1000} segundos para el siguiente ciclo...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.pollingInterval));
  }
}

// Función para procesar un par individual (extraer del bucle)
async function processPair(pair) {
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
        // Para UniswapV2-like
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
            // Cargar ABI del Quoter con la dirección de Sepolia
            const quoterAddress = "0xC5290058841028F1614F3A6F0F5816cAd0df5E27"; // Sepolia
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
      
      // Actualizar el rendimiento del par
      const pairKey = `${pair.tokenA}-${pair.tokenB}`;
      if (!pairPerformance[pairKey]) {
        pairPerformance[pairKey] = { 
          maxDiff: 0, 
          checks: 0,
          lastProfit: 0,
          lastCheck: Date.now() 
        };
      }
      
      pairPerformance[pairKey].maxDiff = Math.max(pairPerformance[pairKey].maxDiff, priceDiff);
      pairPerformance[pairKey].checks++;
      pairPerformance[pairKey].lastCheck = Date.now();
      pairPerformance[pairKey].lastProfit = profitData.profitUsd;
      
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

// Iniciar el monitoreo
main().catch((error) => {
  console.error("❌ Error fatal en el monitor de testnet:", error);
  process.exit(1);
});