import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { AaveSepoliaAddresses } from "./aaveAddresses";
dotenv.config();

// ================================
// Configuration
// ================================
const MIN_PROFIT_PERCENT = 20;       // 20% to account for slippage
const MAX_SLIPPAGE_PERCENT = 5;      // Lower to prevent massive slippage
const IS_EXECUTION_ENABLED = true;     // Set to false to monitor only or true to execute arbitrage

// ================================
// Configuración de contratos desplegados
// ================================
// Actualiza estas direcciones después de desplegar
const ARBITRAGE_LOGIC_ADDRESS = "0x418f6389008B51E5f658D9Ef4BC73d819904A709"; // ArbitrageLogic.sol contract
const FLASH_LOAN_CONTRACT_ADDRESS = "0xc012A4f2586d36A80F7d589119c15AAF4A9c8C98"; // FlashLoanSepolia.sol contract

// ABI mínimo para interactuar con tu FlashLoanSepolia
const flashLoanABI = [
  "function executeFlashLoan(address asset, uint256 amount) external"
];

// ================================
// Configuración de tokens en Sepolia (direcciones validadas)
// ================================
// Principales tokens base
const USDC = "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8"; // USDC testnet (6 decimales)
const WETH = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14"; // WETH testnet (18 decimales)
const WBTC = "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"; // Wrapped BTC (8 decimales)

// Tokens adicionales con alta liquidez en Sepolia (top de GeckoTerminal)
const METH = "0x42f8393922062fe7b07929b77c68eb7344375fa8"; // METH testnet (18 decimales)
const UNI = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"; // Uniswap token (18 decimales)
const LINK = "0x779877a7b0d9e8603169ddbd7836e478b4624789"; // Chainlink token (18 decimales)
const DAI = "0x73967c6a0904aa032c103b4104747e88c566b1a2"; // DAI Stablecoin (18 decimales)

// ================================
// Inicialización del proveedor
// ================================
if (!process.env.SEPOLIA_RPC_URL) {
  throw new Error("SEPOLIA_RPC_URL no está definida en el archivo .env");
}
const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

// ================================
// Wallet Configuration
// ================================
const DESTINATION_WALLET = "0x5E2b76CFFD530e837b8316910A651058FC1496CA";  // Where to send profits
const PRIVATE_KEY = process.env.PRIVATE_KEY;  // Your private key from .env
if (!PRIVATE_KEY) {
  console.warn("⚠️ No PRIVATE_KEY found in .env - will monitor only, no execution");
}
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;  // Now provider exists

// ================================
// Configuración de DEXes en Sepolia
// ================================
const SUSHI_V2_ROUTER = "0xeabce3e74ef41fb40024a21cc2ee2f5ddc615791";
const UNISWAP_V2_ROUTER = "0xee567fe1712faf6149d80da1e6934e354124cfe3";
const UNISWAP_V3_QUOTER = "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3";

// ================================
// Pools específicos con alta liquidez (Top de GeckoTerminal)
// ================================
// Uniswap V3 - Top Pools
const UNIV3_WETH_USDC_POOL = "0x84f491dd1e1bb2b251bea2cab9ac6849e94bfbc5";
const UNIV3_WETH_WBTC_POOL = "0x5efaa00432c51aa1c51d3eb66b8f8e9e704d6bb3";
const UNIV3_WETH_DAI_POOL = "0xe05b4b02a202cfa6b6805c5e1716e4f45c3b8c48";
const UNIV3_WETH_UNI_POOL = "0xbcf67b1fe93d540774a73ef88189e3a37dede17c";
const UNIV3_WETH_LINK_POOL = "0x9b7e29ad4387a89261cba7919861d42ab204627b";

// Uniswap V2 - Top Pools
const UNIV2_WETH_USDC_POOL = "0x2fb2d3eb1f38621b6b04ab10d82481acd6386d6f";
const UNIV2_WETH_UNI_POOL = "0x02ccba622d7af52a44df11d268ce67e6cb326dcf";
const UNIV2_WETH_DAI_POOL = "0x56c0fa47107bf25aa0d5c20452ed0339fae75ed4";

// ================================
// ABIs mínimos para funciones de cotización
// ================================
const routerV2ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)"
];

const quoterV3ABI = [
  "function quoteExactInputSingle(address tokenIn, uint256 amountIn, address tokenOut, uint24 fee, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
];

const pairABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

const factoryV3ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

const poolV3ABI = [
  "function fee() external view returns (uint24)"
];

// ================================
// Inicialización del proveedor y contratos
// ================================
const sushiRouter = new ethers.Contract(SUSHI_V2_ROUTER, routerV2ABI, provider);
const uniV2Router = new ethers.Contract(UNISWAP_V2_ROUTER, routerV2ABI, provider); 
const uniV3Quoter = new ethers.Contract(UNISWAP_V3_QUOTER, quoterV3ABI, provider);

// ================================
// Montos de prueba para cada token
// ================================
// Montos estándar para cotizaciones (ajustados según los decimales de cada token)
const amountInUSDC = ethers.utils.parseUnits("1000", 6);    // 1000 USDC (6 decimales)
const amountInWETH = ethers.utils.parseUnits("1", 18);       // 1 WETH (18 decimales)
const amountInWBTC = ethers.utils.parseUnits("0.05", 8);     // 0.05 WBTC (8 decimales)
const amountInMETH = ethers.utils.parseUnits("1", 18);       // 1 METH (18 decimales)
const amountInUNI = ethers.utils.parseUnits("10", 18);       // 10 UNI (18 decimales)
const amountInLINK = ethers.utils.parseUnits("10", 18);      // 10 LINK (18 decimales)
const amountInDAI = ethers.utils.parseUnits("1000", 18);     // 1000 DAI (18 decimales)

// Definir fee tiers para Uniswap V3
const FEE_LOW = 500;       // 0.05% 
const FEE_MEDIUM = 3000;   // 0.3% - Este tier tiene más liquidez en Sepolia
const FEE_HIGH = 10000;    // 1%

// Variable global para almacenar los fee tiers descubiertos
let discoveredFeeTiers = {};

// ================================
// Función para consultar un par específico en todos los DEXes
// ================================
async function queryTokenPair(tokenIn, tokenOut, amountIn, symbolIn, symbolOut, decimalsOut) {
  console.log(`\n----- PAR ${symbolOut}/${symbolIn} (${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn} → ${symbolOut}) -----`);
  const results = {
    sushi: NaN,
    uniV2: NaN,
    uniV3_3000: NaN,
    uniV3_500: NaN,
    uniV3_10000: NaN
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

  // 3) Uniswap V3 con fee tier correcto
  try {
    // Buscar el fee tier específico para este par
    const pairKey = `${tokenIn}_${tokenOut}`;
    
    // Usar el fee tier descubierto o el default (3000)
    const feeTier = discoveredFeeTiers[pairKey] || FEE_MEDIUM;
    
    const outToken = await uniV3Quoter.callStatic.quoteExactInputSingle(
      tokenIn, amountIn, tokenOut, feeTier, 0
    );
    const feeTierKey = `uniV3_${feeTier}`;
    results[feeTierKey] = parseFloat(ethers.utils.formatUnits(outToken, decimalsOut));
    console.log(`Uniswap V3 (${feeTier/10000}%): ${results[feeTierKey]} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`Uniswap V3 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  return results;
}

// Helper function to get decimals based on token symbol
function getDecimals(symbol) {
  switch(symbol) {
    case 'USDC': return 6;
    case 'WBTC': return 8;
    default: return 18;  // Most tokens use 18 decimals
  }
}

// ================================
// Consultar reservas de un pool V2 específico
// ================================
async function checkPoolReserves(poolAddress, symbol0, symbol1, decimals0, decimals1, amountToSwap, swapSymbol) {
  try {
    const pairContract = new ethers.Contract(poolAddress, pairABI, provider);
    
    // Obtener tokens del pool para verificar el orden
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();
    
    // Obtener reservas
    const reserves = await pairContract.getReserves();
    console.log(`Pool V2 ${symbol0}/${symbol1} Reserves: ${ethers.utils.formatUnits(reserves[0], decimals0)} ${symbol0}, ${ethers.utils.formatUnits(reserves[1], decimals1)} ${symbol1}`);
    
    // Calcular proporción de precios implícita
    const reserve0 = parseFloat(ethers.utils.formatUnits(reserves[0], decimals0));
    const reserve1 = parseFloat(ethers.utils.formatUnits(reserves[1], decimals1));
    
    // Calcular precio basado en reservas
    const price01 = reserve1 / reserve0; // Price of token0 in terms of token1
    const price10 = reserve0 / reserve1; // Price of token1 in terms of token0
    
    console.log(`Implied price: 1 ${symbol0} = ${price01.toFixed(6)} ${symbol1}`);
    console.log(`Implied price: 1 ${symbol1} = ${price10.toFixed(6)} ${symbol0}`);
    
    // Calcular slippage esperado
    if (swapSymbol === symbol0) {
      const swapAmount = parseFloat(ethers.utils.formatUnits(amountToSwap, decimals0));
      const expectedSlippage = (swapAmount / reserve0) * 100;
      console.log(`Expected slippage for ${swapAmount} ${symbol0} swap: ~${expectedSlippage.toFixed(2)}%`);
    } else if (swapSymbol === symbol1) {
      const swapAmount = parseFloat(ethers.utils.formatUnits(amountToSwap, decimals1));
      const expectedSlippage = (swapAmount / reserve1) * 100;
      console.log(`Expected slippage for ${swapAmount} ${symbol1} swap: ~${expectedSlippage.toFixed(2)}%`);
    }
    
    return { token0, token1, reserve0, reserve1, price01, price10 };
  } catch (error) {
    console.log(`Error checking pool reserves for ${poolAddress}: ${error.message}`);
    return null;
  }
}

// ================================
// Función para verificar balance de pools
// ================================
function isPoolBalanced(reserve0, reserve1, decimals0, decimals1) {
  // Convertir a valores normalizados
  const normalizedReserve0 = reserve0 / (10 ** decimals0);
  const normalizedReserve1 = reserve1 / (10 ** decimals1);
  
  // Calcular ratio de valor (asumiendo precios aproximados)
  // Por ejemplo, si ETH vale ~3000 USDC
  let targetRatio;
  if (decimals0 === 6 && decimals1 === 18) { // USDC/ETH
    targetRatio = 3000; // Esperamos ~3000 USDC por ETH
  } else {
    targetRatio = 1; // Por defecto
  }
  
  // Calcular qué tan desbalanceado está
  const currentRatio = normalizedReserve0 / normalizedReserve1;
  const imbalanceRatio = Math.abs(currentRatio / targetRatio);
  
  // Si está desbalanceado por más de 10x, rechazar
  return imbalanceRatio < 10;
}

// ================================
// Función principal para consultar precios de todos los pares
// ================================
async function getPrices() {
  console.log("=================== CONSULTANDO PRECIOS ===================");
  
  // Objeto para almacenar todos los resultados
  const results = {};
  
  // ===== PAR WETH/USDC =====
  const wethForUsdc = await queryTokenPair(USDC, WETH, amountInUSDC, "USDC", "WETH", 18);
  results.usdc_weth = wethForUsdc;
  
  // ===== PAR WETH/WBTC =====
  const wethForWbtc = await queryTokenPair(WBTC, WETH, amountInWBTC, "WBTC", "WETH", 18);
  results.wbtc_weth = wethForWbtc;
  
  // ===== PAR WETH/METH =====
  const wethForMeth = await queryTokenPair(METH, WETH, amountInMETH, "METH", "WETH", 18);
  results.meth_weth = wethForMeth;
  
  // ===== PAR WETH/UNI =====
  const wethForUni = await queryTokenPair(UNI, WETH, amountInUNI, "UNI", "WETH", 18);
  results.uni_weth = wethForUni;
  
  // ===== PAR WETH/LINK =====
  const wethForLink = await queryTokenPair(LINK, WETH, amountInLINK, "LINK", "WETH", 18);
  results.link_weth = wethForLink;
  
  // ===== PAR WETH/DAI =====
  const wethForDai = await queryTokenPair(DAI, WETH, amountInDAI, "DAI", "WETH", 18);
  results.dai_weth = wethForDai;
  
  // ===== Check pool reserves for major pools =====
  console.log("\n===== VERIFICANDO RESERVES DE POOLS PRINCIPALES =====");
  await checkPoolReserves(UNIV2_WETH_USDC_POOL, "USDC", "WETH", 6, 18, amountInUSDC, "USDC");
  
  return results;
}

// ================================
// Análisis de arbitraje por pair
// ================================
function analyzeArbitrage(entries, tokenInSymbol, tokenOutSymbol, amountInFormatted, poolInfo = null) {
  if (entries.length < 2) {
    console.log(`No hay suficientes DEXes con liquidez para ${tokenInSymbol}/${tokenOutSymbol} para comparar precios`);
    return null;
  }
  
  const validPrices = entries.map(([_, price]) => price);
  const maxPrice = Math.max(...validPrices);
  const minPrice = Math.min(...validPrices);
  const diffPercent = ((maxPrice - minPrice) / minPrice) * 100;

  const getDexName = (key) => {
    if (key.includes("sushi")) return "SushiSwap V2";
    if (key.includes("uniV2")) return "Uniswap V2";
    if (key.includes("uniV3_3000")) return "Uniswap V3 (0.3%)";
    if (key.includes("uniV3_500")) return "Uniswap V3 (0.05%)";
    if (key.includes("uniV3_10000")) return "Uniswap V3 (1%)";
    return key;
  };
  
  const buyDex = entries.find(([_, price]) => price === minPrice)?.[0];
  const sellDex = entries.find(([_, price]) => price === maxPrice)?.[0];
  
  if (diffPercent > 0.5) {
    console.log(`✅ Oportunidad detectada: Comprar ${amountInFormatted} ${tokenInSymbol} por ${minPrice.toFixed(6)} ${tokenOutSymbol} en ${getDexName(buyDex)} y vender en ${getDexName(sellDex)} por ${maxPrice.toFixed(6)} ${tokenOutSymbol} (+${diffPercent.toFixed(2)}%).`);
    
    // Si tenemos info del pool, calcular slippage
    if (poolInfo && poolInfo.reserve0 && poolInfo.reserve1) {
      const swapAmount = parseFloat(amountInFormatted);
      let reserveIn;
      
      // Determinar qué reserva es la del token de entrada
      if (tokenInSymbol === "USDC") {
        reserveIn = poolInfo.reserve0; // Asumiendo que USDC es token0
      } else {
        reserveIn = poolInfo.reserve1; // Si no es USDC, probablemente es token1
      }
      
      const slippagePercent = (swapAmount / reserveIn) * 100;
      
      if (slippagePercent < MAX_SLIPPAGE_PERCENT && diffPercent > MIN_PROFIT_PERCENT && IS_EXECUTION_ENABLED) {
        executeArbitrage(tokenInSymbol, tokenOutSymbol, amountInFormatted, getDexName(buyDex), getDexName(sellDex));
      } else if (slippagePercent >= MAX_SLIPPAGE_PERCENT) {
        console.log("❌ No se ejecuta automáticamente debido al alto slippage");
      } else if (!IS_EXECUTION_ENABLED) {
        console.log("ℹ️ Ejecución deshabilitada (modo monitoreo)");
      }
    }
    
    return {
      buyDex: getDexName(buyDex),
      sellDex: getDexName(sellDex),
      minPrice,
      maxPrice,
      diffPercent,
      profitable: true
    };
  } else {
    console.log(`No hay arbitraje rentable para ${tokenInSymbol}/${tokenOutSymbol}. Spread = ${diffPercent.toFixed(2)}%`);
    return {
      diffPercent,
      profitable: false
    };
  }
}

// ================================
// Buscar oportunidades de flash loan multi-hop
// ================================
function findMultiHopOpportunities(results) {
  console.log("\n🔍 BUSCANDO OPORTUNIDADES DE MULTI-HOP CON FLASH LOAN...");
  
  // Filtrar pares con precios válidos en al menos un DEX
  const validPairs = {};
  Object.entries(results).forEach(([pairKey, pairResults]) => {
    const dexesWithLiquidity = Object.entries(pairResults).filter(([_, price]) => !isNaN(price));
    if (dexesWithLiquidity.length > 0) {
      validPairs[pairKey] = dexesWithLiquidity;
    }
  });
  
  // Buscar ciclos: USDC → WETH → token → USDC
  const flashLoanOpportunities = [];
  
  // Verificar si hay liquidez para USDC/WETH (primer salto)
  if (validPairs.usdc_weth && validPairs.usdc_weth.length > 0) {
    // Best rate for USDC → WETH
    const bestUsdcToWeth = validPairs.usdc_weth.reduce((best, current) => 
      (!best || current[1] > best[1]) ? current : best, null);
    
    // For each valid token with WETH pair (second hop)
    const otherTokens = Object.keys(validPairs).filter(key => 
      key !== 'usdc_weth' && key.includes('weth'));
    
    otherTokens.forEach(tokenKey => {
      const tokenSymbol = tokenKey.split('_')[0].toUpperCase();
      
      // Best rate for WETH → token
      const bestWethToToken = validPairs[tokenKey].reduce((best, current) => 
        (!best || current[1] > best[1]) ? current : best, null);
      
      // Check if token → USDC exists (completing the cycle)
      // This is hypothetical since we don't explicitly query these pairs
      // In a complete implementation, we would need to query tokenX → USDC for each token
      
      // For demonstration purposes, we'll assume a hypothetical rate
      // In reality, you would query this rate from the DEXes
      const hypotheticalTokenToUsdc = 1000; // hypothetical USDC amount received
      
      // Calculate potential profit
      const initialUsdc = 1000; // 1000 USDC flash loan
      const estimatedWeth = initialUsdc * bestUsdcToWeth[1];
      const estimatedToken = estimatedWeth * bestWethToToken[1];
      const finalUsdc = hypotheticalTokenToUsdc; // In real implementation, this would be a real quote
      
      const profitPercent = ((finalUsdc - initialUsdc) / initialUsdc) * 100;
      
      if (profitPercent > 0.5) {
        flashLoanOpportunities.push({
          path: [`USDC→WETH (${bestUsdcToWeth[0]})`, `WETH→${tokenSymbol} (${bestWethToToken[0]})`, `${tokenSymbol}→USDC (hypothetical)`],
          profitPercent,
          initialAmount: `${initialUsdc} USDC`,
          finalAmount: `${finalUsdc} USDC`,
          profit: `${(finalUsdc - initialUsdc).toFixed(2)} USDC (+${profitPercent.toFixed(2)}%)`
        });
      }
    });
  }
  
  // Display multi-hop opportunities
  if (flashLoanOpportunities.length > 0) {
    console.log("🔥 Oportunidades de arbitraje multi-hop encontradas:");
    flashLoanOpportunities.forEach((opp, index) => {
      console.log(`\nOportunidad #${index + 1}:`);
      console.log(`Ruta: ${opp.path.join(' → ')}`);
      console.log(`Flash loan inicial: ${opp.initialAmount}`);
      console.log(`Monto final: ${opp.finalAmount}`);
      console.log(`Ganancia estimada: ${opp.profit}`);
    });
  } else {
    console.log("No se encontraron oportunidades de arbitraje multi-hop rentables.");
  }
}

// ================================
// Función para descubrir fee tiers de UniswapV3
// ================================
async function discoverV3PoolFeeTiers() {
  console.log("\n🔍 Descubriendo fee tiers de pools UniswapV3...");
  
  const V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const factory = new ethers.Contract(V3_FACTORY, factoryV3ABI, provider);
  const feeTiers = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%
  
  // Mapeo para almacenar los fee tiers descubiertos
  const discoveredFeeTiers = {};
  
  // Pares de tokens principales
  const tokenPairs = [
    { tokens: [USDC, WETH], name: "USDC/WETH" },
    { tokens: [WBTC, WETH], name: "WBTC/WETH" },
    { tokens: [METH, WETH], name: "METH/WETH" },
    { tokens: [DAI, WETH], name: "DAI/WETH" },
    { tokens: [UNI, WETH], name: "UNI/WETH" }
  ];
  
  for (const pair of tokenPairs) {
    console.log(`\nBuscando pools para ${pair.name}:`);
    const [token0, token1] = pair.tokens;
    
    for (const fee of feeTiers) {
      try {
        const pool = await factory.getPool(token0, token1, fee);
        if (pool !== ethers.constants.AddressZero) {
          console.log(`✅ Pool encontrado con fee ${fee/10000}%: ${pool}`);
          
          // Verificar si coincide con alguno de nuestros pools conocidos
          const poolAddresses = [
            UNIV3_WETH_USDC_POOL,
            UNIV3_WETH_WBTC_POOL,
            UNIV3_WETH_DAI_POOL,
            UNIV3_WETH_UNI_POOL,
            UNIV3_WETH_LINK_POOL
          ];
          
          if (poolAddresses.some(addr => addr.toLowerCase() === pool.toLowerCase())) {
            console.log(`   Este es uno de nuestros pools conocidos!`);
          }
          
          // Guardar el fee tier para este par
          const pairKey = `${token0}_${token1}`;
          discoveredFeeTiers[pairKey] = fee;
        }
      } catch (error) {
        console.log(`Error buscando pool para ${pair.name} con fee ${fee/10000}%`);
      }
    }
  }
  
  return discoveredFeeTiers;
}

// ================================
// Función para verificar viabilidad del flash loan antes de ejecutarlo
// ================================
// ❌ Esta función hace bypass completo de seguridad - intencional para pruebas
async function verifyFlashLoanSafety(tokenAddress, amount, decimals) {
  console.log("⚠️ MODO BYPASS: Omitiendo todas las verificaciones de seguridad");
  return true;
}

// ================================
// Función para ejecutar arbitraje utilizando flash loans
// ================================
async function executeArbitrage(tokenInSymbol, tokenOutSymbol, amountInFormatted, buyDexName, sellDexName) {
  console.log(`\n🚀 EJECUTANDO ARBITRAJE CON FLASH LOAN: ${tokenInSymbol} → ${tokenOutSymbol} → ${tokenInSymbol}`);
  
  if (!wallet) {
    console.log("❌ No hay wallet configurado. Agrega PRIVATE_KEY en tu archivo .env");
    return;
  }
  
  // Mapeo de símbolos a direcciones
  const tokenMap = {
    "USDC": USDC,
    "WETH": WETH,
    "WBTC": WBTC,
    "METH": METH,
    "UNI": UNI,
    "LINK": LINK,
    "DAI": DAI
  };
  
  // Obtener la dirección del token correspondiente
  const tokenInAddress = tokenMap[tokenInSymbol];
  if (!tokenInAddress) {
    console.log(`❌ No se pudo encontrar dirección para ${tokenInSymbol}`);
    return;
  }
  
  try {
    console.log(`💰 Iniciando flash loan para ${amountInFormatted} ${tokenInSymbol}...`);
    
    // Conectar al contrato FlashLoanSepolia
    const flashLoanContract = new ethers.Contract(
      FLASH_LOAN_CONTRACT_ADDRESS,
      flashLoanABI,
      wallet.connect(provider)
    );
    
    // Determinar decimales del token
    const tokenContract = new ethers.Contract(
      tokenInAddress,
      ["function decimals() view returns (uint8)"],
      provider
    );
    const decimals = await tokenContract.decimals();
    
    // Calcular monto con decimales
    const amountIn = ethers.utils.parseUnits(amountInFormatted, decimals);
    
    // Verificar que es seguro ejecutar el flash loan
    const isSafe = await verifyFlashLoanSafety(tokenInAddress, amountInFormatted, decimals);
    if (!isSafe) {
      console.log(`❌ No es seguro ejecutar este flash loan. Abortando operación.`);
      return {
        success: false,
        error: "Flash loan safety check failed"
      };
    }
    
    // Ejecutar flash loan - esto disparará todo el flujo de arbitraje en los smart contracts
    const tx = await flashLoanContract.executeFlashLoan(
      tokenInAddress,
      amountIn,
      { 
        gasLimit: 3000000,
        maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei")
      }
    );
    
    console.log(`✅ Flash loan iniciado! Tx hash: ${tx.hash}`);
    console.log(`📊 Ver detalles en: https://sepolia.etherscan.io/tx/${tx.hash}`);
    
    // Esperar a que la transacción se confirme
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ Flash loan exitoso! Gas usado: ${receipt.gasUsed.toString()}`);
      return {
        success: true,
        txHash: tx.hash
      };
    } else {
      console.log(`❌ Flash loan falló en la blockchain`);
      return {
        success: false,
        error: "Transaction reverted on-chain"
      };
    }
    
  } catch (error) {
    console.error(`❌ Error ejecutando flash loan: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// ================================
// Función para ejecutar arbitraje directo
// ================================
async function executeDirectArbitrage(tokenInSymbol, amountInFormatted) {
  console.log(`🚀 Ejecutando arbitraje directo con ${amountInFormatted} ${tokenInSymbol}...`);
  
  const arbLogicContract = new ethers.Contract(
    ARBITRAGE_LOGIC_ADDRESS,
    ["function executeDirectArbitrage(address token, uint256 amount)"],
    wallet
  );
  
  // Approve the ArbitrageLogic contract to spend your tokens
  const tokenContract = new ethers.Contract(
    tokenMap[tokenInSymbol],
    ["function approve(address spender, uint256 amount) returns (bool)"],
    wallet
  );
  
  const amountIn = ethers.utils.parseUnits(amountInFormatted, getDecimals(tokenInSymbol));
  await tokenContract.approve(ARBITRAGE_LOGIC_ADDRESS, amountIn);
  await arbLogicContract.executeDirectArbitrage(tokenMap[tokenInSymbol], amountIn);
}

// ================================
// Función principal de monitoreo
// ================================
let isExecuting = false;

async function monitor() {
  // Descubrir fee tiers primero (solo una vez)
  discoveredFeeTiers = await discoverV3PoolFeeTiers();
  
  while (true) {
    try {
      if (!isExecuting) {
        // All your existing code
        const results = await getPrices();

        console.log("\n=================== ANÁLISIS DE ARBITRAJE ===================");
        
        // Analizar par USDC/WETH
        console.log("\n📊 ANÁLISIS PAR USDC/WETH:");
        const usdcEntries = Object.entries(results.usdc_weth).filter(([_, price]) => !isNaN(price));
        const poolInfo = await checkPoolReserves(UNIV2_WETH_USDC_POOL, "USDC", "WETH", 6, 18, amountInUSDC, "USDC");
        analyzeArbitrage(usdcEntries, "USDC", "WETH", "1000", poolInfo);
        
        // Analizar par WBTC/WETH
        console.log("\n📊 ANÁLISIS PAR WBTC/WETH:");
        const wbtcEntries = Object.entries(results.wbtc_weth).filter(([_, price]) => !isNaN(price));
        analyzeArbitrage(wbtcEntries, "WBTC", "WETH", "0.05");
        
        // Analizar par METH/WETH
        console.log("\n📊 ANÁLISIS PAR METH/WETH:");
        const methEntries = Object.entries(results.meth_weth).filter(([_, price]) => !isNaN(price));
        analyzeArbitrage(methEntries, "METH", "WETH", "1");
        
        // Analizar par UNI/WETH
        console.log("\n📊 ANÁLISIS PAR UNI/WETH:");
        const uniEntries = Object.entries(results.uni_weth).filter(([_, price]) => !isNaN(price));
        analyzeArbitrage(uniEntries, "UNI", "WETH", "10");
        
        // Analizar otros pares...
        // ... Puedes agregar más análisis para los otros pares
        
        // Buscar oportunidades de multi-hop
        findMultiHopOpportunities(results);
        
        // ❌ Código problemático en la función monitor()
        isExecuting = true;
        // The executeArbitrage function is already called by analyzeArbitrage when opportunities are found
        isExecuting = false;
      } else {
        console.log("⏳ Ya hay una ejecución en progreso, esperando...");
      }
    } catch (err) {
      console.error("Error obteniendo precios:", err);
    }
    
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
  }
}

// Iniciar monitoreo
console.log("🚀 Iniciando monitoreo de arbitraje en Sepolia Testnet...");
monitor();