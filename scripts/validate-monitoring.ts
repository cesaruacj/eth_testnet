import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TOKENS, DEX_ROUTERS, FACTORIES, POOLS, DEPLOYED_CONTRACTS, FEE_TIERS, AAVE_TOKENS } from "./sepoliaAddresses";
import { analyzeArbitragePairs } from "../src/strategies/analyzer";
import { findTriangularArbitrageOpportunities } from "../src/strategies/triangular";
import { getOptimizedGasFees } from "../src/utils/gas";
dotenv.config();

// Constantes para las pruebas
const WETH = TOKENS.WETH;
const USDC = TOKENS.USDC;
const LINK = TOKENS.LINK;
const DAI = TOKENS.DAI;
const UNI = TOKENS.UNI;
const YBTC = TOKENS.YBTC;
const MON = TOKENS.MON;
const QRT = TOKENS.QRT;
const YU = TOKENS.YU;
const USDT = TOKENS.USDT;
const COW = TOKENS.COW;

// Montos de prueba para cada token
const amountInUSDC = ethers.utils.parseUnits("500", 6);      // 500 USDC (6 decimales)
const amountInWETH = ethers.utils.parseUnits("0.5", 18);     // 0.5 WETH (18 decimales)
const amountInLINK = ethers.utils.parseUnits("5", 18);       // 5 LINK (18 decimales)
const amountInDAI = ethers.utils.parseUnits("500", 18);      // 500 DAI (18 decimales)
const amountInUNI = ethers.utils.parseUnits("5", 18);
const amountInYBTC = ethers.utils.parseUnits("0.025", 8);
const amountInMON = ethers.utils.parseUnits("0.5", 18);
const amountInQRT = ethers.utils.parseUnits("10", 18);
const amountInYU = ethers.utils.parseUnits("10", 18);
const amountInUSDT = ethers.utils.parseUnits("500", 6);
const amountInCOW = ethers.utils.parseUnits("10", 18);

// ABIs mínimos
const routerV2ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)"
];

const quoterV3ABI = [
  "function quoteExactInputSingle(address tokenIn, uint256 amountIn, address tokenOut, uint24 fee, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
];

// Inicialización del proveedor
const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

// Inicializar contratos de DEXes
const sushiRouter = new ethers.Contract(DEX_ROUTERS.SUSHI_V2, routerV2ABI, provider);
const uniV2Router = new ethers.Contract(DEX_ROUTERS.UNISWAP_V2, routerV2ABI, provider);
const uniV3Quoter = new ethers.Contract(DEX_ROUTERS.UNISWAP_V3_QUOTER, quoterV3ABI, provider);

/**
 * Carga los datos de liquidez del snapshot
 */
function loadLiquiditySnapshot() {
  try {
    const dataPath = path.join(__dirname, "../data/liquidity-snapshot.json");
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`✅ Datos de liquidez cargados de ${dataPath}`);
    return data;
  } catch (error) {
    console.error(`❌ Error cargando datos de liquidez: ${error.message}`);
    return {};
  }
}

/**
 * Consulta un par específico en todos los DEXes
 */
async function queryTokenPair(tokenIn, tokenOut, amountIn, symbolIn, symbolOut, decimalsOut) {
  console.log(`\n----- PAR ${symbolOut}/${symbolIn} (${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn} → ${symbolOut}) -----`);
  
  const results = {
    sushi: NaN,
    uniV2: NaN,
    uniV3_3000: NaN,
    uniV3_500: NaN
  };
  
  // 1) SushiSwap V2
  try {
    const path = [tokenIn, tokenOut];
    const amountsOut = await sushiRouter.getAmountsOut(amountIn, path);
    results.sushi = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`SushiSwap V2: ${results.sushi} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`SushiSwap V2 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  // 2) Uniswap V2
  try {
    const path = [tokenIn, tokenOut];
    const amountsOut = await uniV2Router.getAmountsOut(amountIn, path);
    results.uniV2 = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`Uniswap V2: ${results.uniV2} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`Uniswap V2 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  // 3) Uniswap V3 con fee tiers específicos
  const feeTiers = [500, 3000];
  
  for (const fee of feeTiers) {
    try {
      const outToken = await uniV3Quoter.callStatic.quoteExactInputSingle(
        tokenIn, amountIn, tokenOut, fee, 0
      );
      
      const feeTierKey = `uniV3_${fee}`;
      results[feeTierKey] = parseFloat(ethers.utils.formatUnits(outToken, decimalsOut));
      console.log(`Uniswap V3 (${fee/10000}%): ${results[feeTierKey]} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
    } catch (error) {
      console.log(`Uniswap V3 (${fee/10000}%) pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
    }
  }
  
  return results;
}

/**
 * Helper para obtener decimales
 */
function getDecimals(symbol) {
  switch(symbol) {
    case 'USDC': return 6;
    case 'LINK': return 18;
    case 'DAI': return 18;
    default: return 18;
  }
}

/**
 * Helper para obtener el monto predeterminado por token
 */
function getDefaultAmount(symbol: string): string {
    switch(symbol) {
        case 'USDC':
        case 'USDT':
            return "500";  // 500 USDC/USDT
        case 'WETH':
            return "0.5";  // 0.5 WETH
        case 'LINK':
            return "5";    // 5 LINK
        case 'DAI':
            return "500";  // 500 DAI
        case 'UNI':
            return "5";    // 5 UNI
        case 'YBTC':
            return "0.025"; // 0.025 YBTC
        case 'MON':
            return "0.5";  // 0.5 MON
        case 'QRT':
        case 'YU':
        case 'COW':
            return "10";   // 10 tokens
        default:
            return "1";    // 1 token por defecto
    }
}

/**
 * Monitorea precios en diferentes DEXes
 */
async function monitorPrices() {
  console.log("=================== CONSULTANDO PRECIOS ===================");
  
  // Objeto para almacenar todos los resultados
  const results = {};
  
  // ===== PAR WETH/USDC =====
  const wethForUsdc = await queryTokenPair(USDC, WETH, amountInUSDC, "USDC", "WETH", 18);
  results.usdc_weth = wethForUsdc;
  
  // ===== PAR WETH/LINK =====
  const wethForLink = await queryTokenPair(LINK, WETH, amountInLINK, "LINK", "WETH", 18);
  results.link_weth = wethForLink;
  
  // ===== PAR WETH/DAI =====
  const wethForDai = await queryTokenPair(DAI, WETH, amountInDAI, "DAI", "WETH", 18);
  results.dai_weth = wethForDai;

  // ===== PAR WETH/UNI =====
  results.uni_weth = await queryTokenPair(UNI, WETH, amountInUNI, "UNI", "WETH", 18);

  // ===== PAR WETH/YBTC =====
  results.ybtc_weth = await queryTokenPair(YBTC, WETH, amountInYBTC, "YBTC", "WETH", 18);

  // ===== PAR WETH/MON =====
  results.mon_weth = await queryTokenPair(MON, WETH, amountInMON, "MON", "WETH", 18);

  // ===== PAR WETH/QRT =====
  results.qrt_weth = await queryTokenPair(QRT, WETH, amountInQRT, "QRT", "WETH", 18);

  // ===== PAR WETH/YU =====
  results.yu_weth = await queryTokenPair(YU, WETH, amountInYU, "YU", "WETH", 18);

  // ===== PAR WETH/USDT =====
  results.usdt_weth = await queryTokenPair(USDT, WETH, amountInUSDT, "USDT", "WETH", 18);

  // ===== PAR WETH/COW =====
  results.cow_weth = await queryTokenPair(COW, WETH, amountInCOW, "COW", "WETH", 18);
  
  return results;
}

/**
 * Encuentra oportunidades de arbitraje basado en los precios
 */
function findArbitrageOpportunities(priceResults) {
  console.log("\n=================== ANÁLISIS DE ARBITRAJE ===================");
  
  const opportunities = analyzeArbitragePairs(priceResults, 0.05); // Umbral mínimo de 0.05% para detectar oportunidades
  
  if (opportunities.length > 0) {
    console.log(`\n✅ Se encontraron ${opportunities.length} oportunidades potenciales`);
    opportunities.slice(0, 3).forEach((opp, i) => {
      console.log(`\n${i+1}. ${opp.tokenInSymbol} → ${opp.tokenOutSymbol}`);
      console.log(`   Comprar en: ${opp.buyDex} a ${opp.buyPrice}`);
      console.log(`   Vender en: ${opp.sellDex} a ${opp.sellPrice}`);
      console.log(`   Ganancia teórica: ${opp.profitPercent.toFixed(2)}% (${opp.estimatedProfit})`);
    });
  } else {
    console.log("❌ No se encontraron oportunidades que superen el umbral mínimo");
  }
  
  return opportunities;
}

/**
 * Simula arbitraje sin ejecutarlo
 */
async function simulateArbitrage(opp) {
  console.log(`\n🔍 Simulando arbitraje para ${opp.tokenInSymbol}/${opp.tokenOutSymbol}...`);
  
  // 1. Estimar gas
  const gasSettings = await getOptimizedGasFees('default');
  const gasCost = ethers.utils.parseUnits("0.0004", "ether"); // ~200,000 gas * 2 gwei
  
  // 2. Calcular costo de gas en USD (asumiendo ETH = $3000)
  const ethPrice = 3000;
  const gasCostUSD = parseFloat(ethers.utils.formatEther(gasCost)) * ethPrice;
  
  // 3. Convertir ganancia estimada a USD
  const tokenPrice = opp.sellPrice; // Precio del token de salida en términos del token de entrada
  const profitInToken = parseFloat(opp.estimatedProfit.split(' ')[0]);
  const profitUSD = profitInToken * tokenPrice * (opp.tokenOutSymbol === "WETH" ? ethPrice : 1);
  
  // 4. Calcular ganancia neta
  const netProfitUSD = profitUSD - gasCostUSD;
  const isRentable = netProfitUSD > 0;
  
  console.log(`   Ganancia bruta: $${profitUSD.toFixed(2)}`);
  console.log(`   Costo de gas: $${gasCostUSD.toFixed(2)}`);
  console.log(`   Ganancia neta: $${netProfitUSD.toFixed(2)}`);
  console.log(`   Veredicto: ${isRentable ? '✅ RENTABLE' : '❌ NO RENTABLE'}`);
  
  return {
    profitPercentage: opp.profitPercent,
    profitUSD,
    gasCostUSD,
    netProfitUSD,
    isRentable,
    pair: `${opp.tokenInSymbol}/${opp.tokenOutSymbol}`
  };
}

/**
 * Genera todas las combinaciones posibles de pares de tokens
 */
function getAllTokenPairs(tokens: Record<string, string>) {
  const symbols = Object.keys(tokens);
  const pairs = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = 0; j < symbols.length; j++) {
      if (i !== j) {
        pairs.push({ tokenIn: symbols[i], tokenOut: symbols[j] });
      }
    }
  }
  return pairs;
}

/**
 * Genera todas las rutas triangulares posibles de tokens
 */
function getAllTriangularRoutes(tokens: Record<string, string>) {
  const symbols = Object.keys(tokens);
  const routes = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = 0; j < symbols.length; j++) {
      for (let k = 0; k < symbols.length; k++) {
        if (i !== j && j !== k && i !== k) {
          routes.push([symbols[i], symbols[j], symbols[k], symbols[i]]);
        }
      }
    }
  }
  return routes;
}

/**
 * Funciones mejoradas de análisis
 */
async function analyzeAllPairs(priceResults: Record<string, any>) {
  console.log("\n=================== ANÁLISIS DE ARBITRAJE ===================");
  
  // Usar analyzeArbitragePairs de manera más eficiente
  const tokenPairs = Object.entries(priceResults).map(([pairKey, results]) => {
    const [tokenIn, tokenOut] = pairKey.split('_');
    return {
      results,
      tokenIn,
      tokenOut,
      amount: getDefaultAmount(tokenIn) // Función helper para montos
    };
  });

  return analyzeArbitragePairs(tokenPairs);
}

/**
 * Simulación mejorada con todos los costos
 */
async function simulateArbitrageFull(opp) {
  const gasSettings = await getOptimizedGasFees('default');
  const gasCost = ethers.utils.parseUnits("0.0004", "ether");
  
  // Corregido a 0.05%
  const flashLoanPremium = opp.amountIn * 0.0005;
  
  // Incluir slippage estimado
  const expectedSlippage = calculateExpectedSlippage(opp.amountIn, opp.poolLiquidity);
  
  const profitAfterCosts = opp.estimatedProfit - flashLoanPremium - expectedSlippage;
  
  return {
    isRentable: profitAfterCosts > 0,
    profitUSD: profitAfterCosts,
    costs: {
      gas: gasCost,
      premium: flashLoanPremium,
      slippage: expectedSlippage
    }
  };
}

/**
 * Añadir monitoreo de rutas triangulares mejorado
 */
async function analyzeTriangularRoutes(priceResults: Record<string, any>) {
  // Usar la función existente pero con más pares
  const triangularOpps = await findTriangularArbitrageOpportunities(
    priceResults,
    0.5 // Umbral mínimo de ganancia
  );

  // Simular cada oportunidad triangular
  for (const opp of triangularOpps) {
    const simulation = await simulateArbitrageFull(opp);
    if (simulation.isRentable) {
      console.log(`✅ Ruta triangular rentable: ${opp.route}`);
      console.log(`   Ganancia neta: $${simulation.profitUSD.toFixed(2)}`);
    }
  }
}

/**
 * Función principal
 */
async function main() {
  console.log("🔍 Iniciando validación de monitoreo...");
  
  // 1. Cargar datos de liquidez
  const liquidityData = loadLiquiditySnapshot();
  
  // 2. Monitorear todos los pares posibles
  const priceResults = await monitorPrices();
  
  // 3. Analizar oportunidades directas con costos reales
  const opportunities = await analyzeAllPairs(priceResults);
  
  // 4. Analizar rutas triangulares
  await analyzeTriangularRoutes(priceResults);
  
  // 5. Simular las mejores oportunidades
  console.log("\n=================== SIMULACIÓN DE RENTABILIDAD ===================");
  for (const opp of opportunities) {
    const simulation = await simulateArbitrageFull(opp);
    if (simulation.isRentable) {
      console.log(`💰 Oportunidad rentable encontrada:`);
      console.log(`   Par: ${opp.tokenIn}/${opp.tokenOut}`);
      console.log(`   Ganancia neta: $${simulation.profitUSD.toFixed(2)}`);
    }
  }
}

// Ejecutar script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("❌ Error en la validación:", error);
    process.exit(1);
  });