import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TOKENS, DEX_ROUTERS, FACTORIES, POOLS, DEPLOYED_CONTRACTS, FEE_TIERS, AAVE_TOKENS } from "./sepoliaAddresses";
dotenv.config();

// Variables globales
const USDC = TOKENS.USDC;
const WETH = TOKENS.WETH;
const DAI = TOKENS.DAI;
const METH = TOKENS.MON;  // Estás usando MON como equivalente a METH
// Add these missing token references
const YBTC = TOKENS.YBTC;
const UNI = TOKENS.UNI;
const LINK = TOKENS.LINK;
const YU = TOKENS.YU;
const QRT = TOKENS.QRT;
const COW = TOKENS.COW;
const USDT = TOKENS.USDT;

// Add this near the top of your file with other variable declarations
let consecutiveFailures = 0;

// Carga los datos de liquidez del archivo JSON
let liquidityData = {};
try {
  const dataPath = path.join(__dirname, "../data/liquidity-snapshot.json");
  liquidityData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`✅ Datos de liquidez cargados de ${dataPath}`);
} catch (error) {
  console.error(`❌ Error cargando datos de liquidez: ${error.message}`);
}

// Add a list of tokens with known good Aave liquidity on Sepolia
const TOKENS_WITH_AAVE_LIQUIDITY = ["DAI", "USDC", "WETH"]; // Based on testing

// ================================
// Configuration
// ================================
const MIN_PROFIT_PERCENT = 0.1;  // Execute any trade with >0.1% profit
const MAX_SLIPPAGE_PERCENT = 3;      // Lower to prevent massive slippage
let IS_EXECUTION_ENABLED = true;     // Set to false to monitor only or true to execute arbitrage

// ================================
// Configuración de contratos desplegados
// ================================
// Actualiza estas direcciones después de desplegar
const ARBITRAGE_LOGIC_ADDRESS = DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC; // ArbitrageLogic.sol contract
const FLASH_LOAN_CONTRACT_ADDRESS = DEPLOYED_CONTRACTS.FLASH_LOAN; // FlashLoanSepolia.sol contract

// ABI mínimo para interactuar con tu FlashLoanSepolia
const flashLoanABI = [
  "function executeFlashLoan(address asset, uint256 amount) external"
];

// ================================
// Configuración de tokens en Sepolia (direcciones validadas)
// ================================
// Principales tokens base con separación por versión
const TOKENS_V2 = {
  USDC: TOKENS.USDC,        // 0xbe72e441bf55620febc26715db68d3494213d8cb
  WETH: TOKENS.WETH,        // 0xfff9976782d46cc05630d1f6ebab18b2324d6b14
  DAI: TOKENS.DAI,          // 0xb4f1737af37711e9a5890d9510c9bb60e170cb0d
  USDT: TOKENS.USDT,        // 0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0
  COW: TOKENS.COW           // 0x0625afb445c3b6b7b929342a04a22599fd5dbb59
};

const TOKENS_V3 = {
  USDC: TOKENS.USDC_V3,     // 0x1c7d4b196cb0c7b01d743fbc6116a902379c7238
  WETH: TOKENS.WETH,        // 0xfff9976782d46cc05630d1f6ebab18b2324d6b14 <- Cambiado a WETH normal
  UNI: TOKENS.UNI,          // 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984
  LINK: TOKENS.LINK,        // 0x779877a7b0d9e8603169ddbd7836e478b4624789
  USDT: TOKENS.USDT,        // 0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0
  YU: TOKENS.YU,            // 0xe0232d625ea3b94698f0a7dff702931b704083c9
  YBTC: TOKENS.YBTC,        // 0xbbd3edd4d3b519c0d14965d9311185cfac8c3220
  MON: TOKENS.MON,          // 0x810a3b22c91002155d305c4ce032978e3a97f8c4
  QRT: TOKENS.QRT           // 0xbca260191a7a39512de6488c7ee5ad8dff8a766b
};

// Pool address and fee mapping for V3
const V3_POOL_FEES = {
  [POOLS.UNIV3_METH_WETH]: 3000,    // 0.3%
  [POOLS.UNIV3_YU_YBTC]: 3000,      // 0.3%
  [POOLS.UNIV3_USDC_WETH]: 500,     // 0.05%
  [POOLS.UNIV3_MON_WETH]: 10000,    // 1%
  [POOLS.UNIV3_UNI_WETH]: 3000,     // 0.3%
  [POOLS.UNIV3_USDT_WETH]: 10000,   // 1%
  [POOLS.UNIV3_USDC_UNI]: 100,      // 0.01%
  [POOLS.UNIV3_LINK_WETH]: 10000,   // 1%
  [POOLS.UNIV3_QRT_WETH]: 3000,     // 0.3%
  [POOLS.UNIV3_YU_WETH]: 10000      // 1%
};

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
const SUSHI_V2_ROUTER = DEX_ROUTERS.SUSHI_V2;
const UNISWAP_V2_ROUTER = DEX_ROUTERS.UNISWAP_V2;
const UNISWAP_V3_QUOTER = DEX_ROUTERS.UNISWAP_V3_QUOTER;

// ================================
// Pools específicos con alta liquidez (Top de GeckoTerminal)
// ================================
// Uniswap V3 - Pools
const UNIV3_WETH_USDC_POOL = POOLS.UNIV3_USDC_WETH;
const UNIV3_WETH_DAI_POOL = null; // Not available in your config
const UNIV3_WETH_UNI_POOL = POOLS.UNIV3_UNI_WETH;
const UNIV3_WETH_LINK_POOL = POOLS.UNIV3_LINK_WETH;
const UNIV3_WETH_METH_POOL = POOLS.UNIV3_METH_WETH;
const UNIV3_WETH_YU_POOL = POOLS.UNIV3_YU_WETH;
const UNIV3_WETH_QRT_POOL = POOLS.UNIV3_QRT_WETH;

// Uniswap V2 - Pools
const UNIV2_WETH_USDC_POOL = POOLS.UNIV2_USDC_WETH;
const UNIV2_WETH_UNI_POOL = null; // Not available in your config 
const UNIV2_WETH_DAI_POOL = POOLS.UNIV2_DAI_WETH;
const UNIV2_WETH_COW_POOL = POOLS.UNIV2_COW_WETH;
const UNIV2_WETH_USDT_POOL = POOLS.UNIV2_USDT_WETH;

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
const amountInUSDC = ethers.utils.parseUnits("500", 6);    // 500 USDC (6 decimales)
const amountInWETH = ethers.utils.parseUnits("0.5", 18);       // 0.5 WETH (18 decimales)
const amountInYBTC = ethers.utils.parseUnits("0.025", 8);     // 0.025 YBTC (8 decimales)
const amountInMETH = ethers.utils.parseUnits("0.5", 18);       // 0.5 METH (18 decimales)
const amountInUNI = ethers.utils.parseUnits("5", 18);       // 5 UNI (18 decimales)
const amountInLINK = ethers.utils.parseUnits("5", 18);      // 5 LINK (18 decimales)
const amountInDAI = ethers.utils.parseUnits("500", 18);     // 500 DAI (18 decimales)

// Definir fee tiers para Uniswap V3
const FEE_LOW = FEE_TIERS.LOW;       // 0.05% 
const FEE_MEDIUM = FEE_TIERS.MEDIUM;   // 0.3% - Este tier tiene más liquidez en Sepolia
const FEE_HIGH = FEE_TIERS.HIGH;    // 1%

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
    uniV3_10000: NaN,
    uniV3_100: NaN
  };
  
  // 1) SushiSwap V2 - Usar tokens V2
  try {
    // Para SushiSwap, usamos siempre las direcciones de tokens V2
    const path = [TOKENS_V2[symbolIn] || tokenIn, TOKENS_V2[symbolOut] || tokenOut];
    const amountsOut = await sushiRouter.getAmountsOut(amountIn, path);
    results.sushi = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`SushiSwap V2: ${results.sushi} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`SushiSwap V2 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  // 2) Uniswap V2 - Usar tokens V2
  try {
    // Para Uniswap V2, usamos siempre las direcciones de tokens V2
    const path = [TOKENS_V2[symbolIn] || tokenIn, TOKENS_V2[symbolOut] || tokenOut];
    const amountsOut = await uniV2Router.getAmountsOut(amountIn, path);
    results.uniV2 = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`Uniswap V2: ${results.uniV2} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`Uniswap V2 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  // 3) Uniswap V3 con fee tiers específicos - Usar tokens V3
  const v3TokenIn = TOKENS_V3[symbolIn] || tokenIn;
  const v3TokenOut = TOKENS_V3[symbolOut] || tokenOut;
  const pairKey = `${v3TokenIn}_${v3TokenOut}`;
  
  // Intentar con cada fee tier conocido para este par
  const feeTiers = [100, 500, 3000, 10000];
  
  for (const fee of feeTiers) {
    try {
      // Verificar si este par específico tiene este fee tier
      if (discoveredFeeTiers[pairKey] && discoveredFeeTiers[pairKey] !== fee) {
        continue; // Saltar este fee tier si no coincide con el conocido
      }
      
      const outToken = await uniV3Quoter.callStatic.quoteExactInputSingle(
        v3TokenIn, amountIn, v3TokenOut, fee, 0
      );
      
      const feeTierKey = `uniV3_${fee}`;
      results[feeTierKey] = parseFloat(ethers.utils.formatUnits(outToken, decimalsOut));
      console.log(`Uniswap V3 (${fee/10000}%): ${results[feeTierKey]} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
    } catch (error) {
      // Solo mostrar error para el fee tier que sabemos que debería existir
      if (discoveredFeeTiers[pairKey] === fee) {
        console.log(`Uniswap V3 (${fee/10000}%) pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
      }
    }
  }
  
  return results;
}

// Helper function to get decimals based on token symbol
function getDecimals(symbol) {
  switch(symbol) {
    case 'USDC': return 6;
    case 'YBTC': return 8;
    default: return 18;  // Most tokens use 18 decimals
  }
}

// ================================
// Consultar reservas de un pool V2 usando datos del snapshot
// ================================
function checkPoolReservesFromSnapshot(poolAddress, symbol0, symbol1, decimals0, decimals1, amountToSwap, swapSymbol) {
  try {
    // Obtener información del pool desde el archivo de liquidez
    const poolData = liquidityData[getPoolKeyByAddress(poolAddress)];
    
    if (!poolData || poolData.type !== "V2") {
      console.log(`Pool V2 ${poolAddress} no encontrado en snapshot o no es tipo V2`);
      return null;
    }
    
    // Extraer reservas del snapshot
    const reserve0 = parseFloat(ethers.utils.formatUnits(poolData.token0.reserve, decimals0));
    const reserve1 = parseFloat(ethers.utils.formatUnits(poolData.token1.reserve, decimals1));
    
    console.log(`Pool V2 ${symbol0}/${symbol1} Reserves (from snapshot): ${reserve0} ${symbol0}, ${reserve1} ${symbol1}`);
    
    // Calcular proporción de precios implícita
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
    
    return { 
      token0: poolData.token0.address, 
      token1: poolData.token1.address, 
      reserve0, 
      reserve1, 
      price01, 
      price10 
    };
  } catch (error) {
    console.log(`Error checking pool reserves from snapshot for ${poolAddress}: ${error.message}`);
    return null;
  }
}

// Helper para encontrar la key del pool por su dirección
function getPoolKeyByAddress(address) {
  for (const [key, value] of Object.entries(POOLS)) {
    if (value.toLowerCase() === address.toLowerCase()) {
      return key;
    }
  }
  return null;
}

// ================================
// Consultar liquidez de un pool V3 usando datos del snapshot
// ================================
function checkPoolLiquidityFromSnapshot(poolAddress) {
  try {
    // Obtener información del pool desde el archivo de liquidez
    const poolKey = getPoolKeyByAddress(poolAddress);
    const poolData = liquidityData[poolKey];
    
    if (!poolData || poolData.type !== "V3") {
      console.log(`Pool V3 ${poolAddress} no encontrado en snapshot o no es tipo V3`);
      return null;
    }
    
    const symbol0 = poolData.token0.symbol;
    const symbol1 = poolData.token1.symbol;
    const liquidity = poolData.liquidity;
    const fee = poolData.fee;
    const tick = poolData.tick;
    
    console.log(`Pool V3 ${symbol0}/${symbol1} (fee: ${fee/10000}%)`);
    console.log(`  Liquidity: ${ethers.utils.formatEther(liquidity)} units`);
    console.log(`  Current tick: ${tick}`);
    
    return {
      token0: poolData.token0.address,
      token1: poolData.token1.address,
      liquidity,
      fee,
      tick,
      sqrtPriceX96: poolData.sqrtPriceX96
    };
  } catch (error) {
    console.log(`Error checking pool liquidity from snapshot for ${poolAddress}: ${error.message}`);
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
    targetRatio = 1700; // Esperamos ~1700 USDC por 1 ETH
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
  
  // ===== PAR WETH/YBTC =====
  const wethForYBTC = await queryTokenPair(YBTC, WETH, amountInYBTC, "YBTC", "WETH", 18);
  results.YBTC_weth = wethForYBTC;
  
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
  
  // ===== Check pool reserves for major pools usando snapshot =====
  console.log("\n===== VERIFICANDO RESERVES DE POOLS PRINCIPALES (DESDE SNAPSHOT) =====");
  
  // Verificar pools V2
  checkPoolReservesFromSnapshot(UNIV2_WETH_USDC_POOL, "USDC", "WETH", 6, 18, amountInUSDC, "USDC");
  checkPoolReservesFromSnapshot(UNIV2_WETH_DAI_POOL, "DAI", "WETH", 18, 18, amountInDAI, "DAI"); 
  checkPoolReservesFromSnapshot(UNIV2_WETH_COW_POOL, "COW", "WETH", 18, 18, ethers.utils.parseUnits("10", 18), "COW");
  
  // Verificar pools V3
  console.log("\n===== VERIFICANDO LIQUIDEZ DE POOLS V3 (DESDE SNAPSHOT) =====");
  checkPoolLiquidityFromSnapshot(UNIV3_WETH_USDC_POOL);
  checkPoolLiquidityFromSnapshot(UNIV3_WETH_UNI_POOL);
  checkPoolLiquidityFromSnapshot(UNIV3_WETH_LINK_POOL);
  
  return results;
}

// ================================
// Función para descubrir fee tiers de UniswapV3 desde el snapshot
// ================================
function getV3PoolFeeTiersFromSnapshot() {
  console.log("\n🔍 Cargando fee tiers de UniswapV3 desde snapshot...");
  
  const discoveredFeeTiers = {};
  
  // Iterar por todos los pools en el snapshot
  for (const [poolKey, poolData] of Object.entries(liquidityData)) {
    // Solo procesar pools V3
    if (poolData.type === "V3") {
      const token0Address = poolData.token0.address.toLowerCase();
      const token1Address = poolData.token1.address.toLowerCase();
      const fee = poolData.fee;
      
      // Guardar fee tier para ambos sentidos del par
      discoveredFeeTiers[`${token0Address}_${token1Address}`] = fee;
      discoveredFeeTiers[`${token1Address}_${token0Address}`] = fee;
      
      console.log(`  Pool ${poolData.token0.symbol}/${poolData.token1.symbol}: fee ${fee/10000}%`);
    }
  }
  
  console.log(`✅ Cargados ${Object.keys(discoveredFeeTiers).length/2} pares de tokens con sus fee tiers`);
  
  return discoveredFeeTiers;
}

// ================================
// Verificar liquidez Aave desde snapshot
// ================================
function checkAaveLiquidityFromSnapshot(tokenAddress, requiredAmount) {
  try {
    // Verificar si tenemos datos de Aave en el snapshot
    if (!liquidityData.AAVE_V3 || !liquidityData.AAVE_V3.reserves) {
      console.log("❌ Datos de reservas Aave no encontrados en el snapshot");
      return { hasLiquidity: false };
    }
    
    // Normalizar la dirección
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Buscar el token en las reservas de Aave
    let reserveData = null;
    let tokenSymbol = "";
    
    // Buscar por dirección
    for (const [symbol, data] of Object.entries(liquidityData.AAVE_V3.reserves)) {
      if (data.address.toLowerCase() === normalizedAddress) {
        reserveData = data;
        tokenSymbol = symbol;
        break;
      }
    }
    
    if (!reserveData) {
      console.log(`⚠️ Token ${normalizedAddress} no encontrado en las reservas de Aave`);
      return { hasLiquidity: false };
    }
    
    // En el snapshot no tenemos balance directo, pero podemos usar el índice de liquidez
    // como indicador aproximado
    const liquidityIndex = ethers.BigNumber.from(reserveData.liquidityIndex);
    const currentLiquidityRate = ethers.BigNumber.from(reserveData.currentLiquidityRate);
    
    // Una tasa de liquidez positiva y un índice de liquidez alto generalmente indican liquidez disponible
    const hasLiquidity = currentLiquidityRate.gt(0) && liquidityIndex.gt(ethers.utils.parseUnits("1", 18));
    
    if (hasLiquidity) {
      console.log(`✅ Reserva Aave para ${tokenSymbol} parece tener liquidez suficiente`);
      console.log(`   Tasa de liquidez: ${ethers.utils.formatUnits(currentLiquidityRate, 27)}%`);
    } else {
      console.log(`⚠️ Posible liquidez insuficiente para ${tokenSymbol} en Aave`);
      console.log(`   Tasa de liquidez: ${ethers.utils.formatUnits(currentLiquidityRate, 27)}%`);
    }
    
    return {
      hasLiquidity,
      reserveData
    };
  } catch (error) {
    console.error(`❌ Error verificando liquidez en Aave desde snapshot: ${error.message}`);
    return { hasLiquidity: false, error: error.message };
  }
}

// ================================
// Función para verificar viabilidad del flash loan antes de ejecutarlo
// ================================
async function verifyFlashLoanSafety(tokenAddress, amount, decimals) {
  try {
    console.log(`Verificando token: ${tokenAddress}`);
    
    // Lista de todos los tokens permitidos (combinando V2 y V3)
    const allowedTokens = [
      ...Object.values(TOKENS_V2),
      ...Object.values(TOKENS_V3),
      ...Object.values(AAVE_TOKENS)
    ];
    
    // Compara con normalización de direcciones
    const normalizedAddress = tokenAddress.toLowerCase();
    if (allowedTokens.some(addr => addr.toLowerCase() === normalizedAddress)) {
      console.log(`✅ Token aprobado para flash loan: ${normalizedAddress}`);
      
      // Verificar liquidez desde el snapshot
      const liquidityCheck = checkAaveLiquidityFromSnapshot(tokenAddress, amount);
      if (!liquidityCheck.hasLiquidity) {
        console.log(`⚠️ Aave podría no tener suficiente liquidez para este token`);
      }
      
      return true;
    }
    
    console.log(`❌ Token no reconocido - No se considera seguro para flash loan`);
    return false;
  } catch (error) {
    console.error(`Error verificando seguridad: ${error.message}`);
    return false;
  }
}

// Add this function to dynamically adjust flash loan amount based on available liquidity
async function getOptimalFlashLoanAmount(tokenAddress, requestedAmount, decimals) {
  try {
    // Verificar liquidez desde el snapshot
    const liquidityCheck = checkAaveLiquidityFromSnapshot(tokenAddress, requestedAmount);
    
    if (liquidityCheck.hasLiquidity) {
      return {
        amount: requestedAmount,
        adjusted: false
      };
    }
    
    // Si no hay suficiente liquidez, usar un monto conservador
    const safeAmount = requestedAmount.div(10); // 10% del monto solicitado
    
    // Format for display
    const formattedSafeAmount = ethers.utils.formatUnits(safeAmount, decimals);
    console.log(`🔄 Ajustando monto de flash loan a ${formattedSafeAmount} por posible limitación de liquidez`);
    
    return {
      amount: safeAmount,
      formatted: formattedSafeAmount,
      adjusted: true
    };
  } catch (error) {
    console.error(`Error ajustando monto: ${error.message}`);
    // Return a conservative default amount
    return {
      amount: ethers.utils.parseUnits("0.1", decimals),
      formatted: "0.1",
      adjusted: true
    };
  }
}

// ================================
// Añadir esta función para consultar la liquidez disponible en Aave para un token
// ================================
async function getAaveAvailableLiquidity(tokenAddress) {
  try {
    console.log(`📊 Consultando liquidez disponible en Aave para ${tokenAddress}...`);
    
    // Obtener la Pool de Aave desde el Provider
    const providerContract = new ethers.Contract(
      AAVE_TOKENS.POOL_ADDRESSES_PROVIDER, 
      ["function getPool() external view returns (address)"], 
      provider
    );
    const poolAddress = await providerContract.getPool();
    
    // Verificar datos de la reserva en la Pool
    const poolContract = new ethers.Contract(
      poolAddress, 
      ["function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
       "function getReservesList() external view returns (address[])"],
      provider
    );
    
    // Obtener datos de la reserva
    const reserveData = await poolContract.getReserveData(tokenAddress);
    
    // Consultar el balance del aToken que representa la liquidez disponible
    const aTokenContract = new ethers.Contract(
      reserveData.aTokenAddress,
      ["function balanceOf(address) view returns (uint256)","function decimals() view returns (uint8)"],
      provider
    );
    
    const aTokenDecimals = await aTokenContract.decimals();
    const liquidityInAToken = await aTokenContract.balanceOf(poolAddress);
    const formattedLiquidity = ethers.utils.formatUnits(liquidityInAToken, aTokenDecimals);
    
    console.log(`✅ Liquidez disponible en Aave: ${formattedLiquidity}`);
    
    // Determinar un monto seguro: 1% de la liquidez disponible
    const safeLoanAmount = liquidityInAToken.mul(1).div(100); // 1% de la liquidez
    const formattedSafeLoan = ethers.utils.formatUnits(safeLoanAmount, aTokenDecimals);
    console.log(`💡 Monto seguro recomendado para flash loan (1%): ${formattedSafeLoan}`);
    
    return { 
      available: !liquidityInAToken.isZero(), 
      liquidity: liquidityInAToken,
      formattedLiquidity,
      safeLoanAmount,
      formattedSafeLoan,
      decimals: aTokenDecimals
    };
  } catch (error) {
    console.log(`❌ Error al consultar liquidez en Aave: ${error.message}`);
    return { 
      available: false, 
      liquidity: ethers.BigNumber.from(0),
      formattedLiquidity: "0",
      safeLoanAmount: ethers.BigNumber.from(0),
      formattedSafeLoan: "0",
      decimals: 18
    };
  }
}

// ================================
// Función para obtener gas settings óptimos
// ================================
async function getOptimizedGasFees(speed = 'fast', operationType = 'default') {
  try {
    const feeData = await provider.getFeeData();
    
    // Ajustar multiplicador basado en la velocidad
    let multiplier;
    switch (speed) {
      case 'economic':   // Nuevo modo económico
        multiplier = 1.05;
        break;
      case 'standard':   // Renombrado de 'default' a 'standard'
        multiplier = 1.1;
        break;
      case 'fast':
        multiplier = 1.2;
        break;
      case 'fastest':
        multiplier = 1.35; // Reducido de 1.5 a 1.35 para mejor balance
        break;
      default:
        multiplier = 1.1;
    }
    
    // Ajustar priority fee basado en operación 
    let priorityMultiplier;
    switch (operationType) {
      case 'flashloan':
        priorityMultiplier = 1.1;  // Prioridad ligeramente superior
        break;
      case 'arbitrage':
        priorityMultiplier = 1.2;  // Alta prioridad para arbitraje
        break;
      default:
        priorityMultiplier = 1.0;
    }
    
    // Gas limit optimizado por tipo de operación
    let gasLimit;
    switch (operationType) {
      case 'approval':
        gasLimit = 100000;  // Las aprobaciones necesitan menos gas
        break;
      case 'direct_swap':
        gasLimit = 300000;  // Swaps directos
        break;
      case 'flashloan':
        gasLimit = 1000000; // Flash loans necesitan más gas pero no tanto como antes
        break;
      case 'arbitrage':
        gasLimit = 1500000; // Las operaciones de arbitraje completas necesitan bastante gas
        break;
      default:
        gasLimit = 500000;  // Reducido del valor fijo anterior de 4,000,000
    }
    
    // Calcular gas fees optimizados
    const maxFeePerGas = feeData.maxFeePerGas.mul(Math.floor(multiplier * 100)).div(100);
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      .mul(Math.floor(multiplier * priorityMultiplier * 100)).div(100);
    
    // Añadir esta validación para que maxPriorityFeePerGas nunca exceda maxFeePerGas
    if (maxPriorityFeePerGas.gt(maxFeePerGas)) {
      maxPriorityFeePerGas = maxFeePerGas;
    }
    
    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit
    };
  } catch (error) {
    console.warn("Error getting optimized gas fees:", error.message);
    // Valores de fallback más eficientes por tipo
    const fallbackGasLimits = {
      'approval': 100000,
      'direct_swap': 300000,
      'flashloan': 1000000,
      'arbitrage': 1500000,
      'default': 500000
    };
    
    return {
      gasPrice: ethers.utils.parseUnits("3", "gwei"), // Reducido de 5 gwei
      gasLimit: fallbackGasLimits[operationType] || 500000
    };
  }
}

// ================================
// Función para ejecutar arbitraje utilizando flash loans
// ================================
async function executeArbitrage(tokenInSymbol, tokenOutSymbol, amountInFormatted, buyDexName, sellDex// filepath: c:\Users\ccane\OneDrive\Escritorio\Maestria UACJ\4to Semestre\Seminario IV\eth_testnet\scripts\validate-monitoring.ts
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TOKENS, DEX_ROUTERS, FACTORIES, POOLS, DEPLOYED_CONTRACTS, FEE_TIERS, AAVE_TOKENS } from "./sepoliaAddresses";
dotenv.config();

// Variables globales
const USDC = TOKENS.USDC;
const WETH = TOKENS.WETH;
const DAI = TOKENS.DAI;
const METH = TOKENS.MON;  // Estás usando MON como equivalente a METH
// Add these missing token references
const YBTC = TOKENS.YBTC;
const UNI = TOKENS.UNI;
const LINK = TOKENS.LINK;
const YU = TOKENS.YU;
const QRT = TOKENS.QRT;
const COW = TOKENS.COW;
const USDT = TOKENS.USDT;

// Add this near the top of your file with other variable declarations
let consecutiveFailures = 0;

// Carga los datos de liquidez del archivo JSON
let liquidityData = {};
try {
  const dataPath = path.join(__dirname, "../data/liquidity-snapshot.json");
  liquidityData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`✅ Datos de liquidez cargados de ${dataPath}`);
} catch (error) {
  console.error(`❌ Error cargando datos de liquidez: ${error.message}`);
}

// Add a list of tokens with known good Aave liquidity on Sepolia
const TOKENS_WITH_AAVE_LIQUIDITY = ["DAI", "USDC", "WETH"]; // Based on testing

// ================================
// Configuration
// ================================
const MIN_PROFIT_PERCENT = 0.1;  // Execute any trade with >0.1% profit
const MAX_SLIPPAGE_PERCENT = 3;      // Lower to prevent massive slippage
let IS_EXECUTION_ENABLED = true;     // Set to false to monitor only or true to execute arbitrage

// ================================
// Configuración de contratos desplegados
// ================================
// Actualiza estas direcciones después de desplegar
const ARBITRAGE_LOGIC_ADDRESS = DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC; // ArbitrageLogic.sol contract
const FLASH_LOAN_CONTRACT_ADDRESS = DEPLOYED_CONTRACTS.FLASH_LOAN; // FlashLoanSepolia.sol contract

// ABI mínimo para interactuar con tu FlashLoanSepolia
const flashLoanABI = [
  "function executeFlashLoan(address asset, uint256 amount) external"
];

// ================================
// Configuración de tokens en Sepolia (direcciones validadas)
// ================================
// Principales tokens base con separación por versión
const TOKENS_V2 = {
  USDC: TOKENS.USDC,        // 0xbe72e441bf55620febc26715db68d3494213d8cb
  WETH: TOKENS.WETH,        // 0xfff9976782d46cc05630d1f6ebab18b2324d6b14
  DAI: TOKENS.DAI,          // 0xb4f1737af37711e9a5890d9510c9bb60e170cb0d
  USDT: TOKENS.USDT,        // 0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0
  COW: TOKENS.COW           // 0x0625afb445c3b6b7b929342a04a22599fd5dbb59
};

const TOKENS_V3 = {
  USDC: TOKENS.USDC_V3,     // 0x1c7d4b196cb0c7b01d743fbc6116a902379c7238
  WETH: TOKENS.WETH,        // 0xfff9976782d46cc05630d1f6ebab18b2324d6b14 <- Cambiado a WETH normal
  UNI: TOKENS.UNI,          // 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984
  LINK: TOKENS.LINK,        // 0x779877a7b0d9e8603169ddbd7836e478b4624789
  USDT: TOKENS.USDT,        // 0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0
  YU: TOKENS.YU,            // 0xe0232d625ea3b94698f0a7dff702931b704083c9
  YBTC: TOKENS.YBTC,        // 0xbbd3edd4d3b519c0d14965d9311185cfac8c3220
  MON: TOKENS.MON,          // 0x810a3b22c91002155d305c4ce032978e3a97f8c4
  QRT: TOKENS.QRT           // 0xbca260191a7a39512de6488c7ee5ad8dff8a766b
};

// Pool address and fee mapping for V3
const V3_POOL_FEES = {
  [POOLS.UNIV3_METH_WETH]: 3000,    // 0.3%
  [POOLS.UNIV3_YU_YBTC]: 3000,      // 0.3%
  [POOLS.UNIV3_USDC_WETH]: 500,     // 0.05%
  [POOLS.UNIV3_MON_WETH]: 10000,    // 1%
  [POOLS.UNIV3_UNI_WETH]: 3000,     // 0.3%
  [POOLS.UNIV3_USDT_WETH]: 10000,   // 1%
  [POOLS.UNIV3_USDC_UNI]: 100,      // 0.01%
  [POOLS.UNIV3_LINK_WETH]: 10000,   // 1%
  [POOLS.UNIV3_QRT_WETH]: 3000,     // 0.3%
  [POOLS.UNIV3_YU_WETH]: 10000      // 1%
};

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
const SUSHI_V2_ROUTER = DEX_ROUTERS.SUSHI_V2;
const UNISWAP_V2_ROUTER = DEX_ROUTERS.UNISWAP_V2;
const UNISWAP_V3_QUOTER = DEX_ROUTERS.UNISWAP_V3_QUOTER;

// ================================
// Pools específicos con alta liquidez (Top de GeckoTerminal)
// ================================
// Uniswap V3 - Pools
const UNIV3_WETH_USDC_POOL = POOLS.UNIV3_USDC_WETH;
const UNIV3_WETH_DAI_POOL = null; // Not available in your config
const UNIV3_WETH_UNI_POOL = POOLS.UNIV3_UNI_WETH;
const UNIV3_WETH_LINK_POOL = POOLS.UNIV3_LINK_WETH;
const UNIV3_WETH_METH_POOL = POOLS.UNIV3_METH_WETH;
const UNIV3_WETH_YU_POOL = POOLS.UNIV3_YU_WETH;
const UNIV3_WETH_QRT_POOL = POOLS.UNIV3_QRT_WETH;

// Uniswap V2 - Pools
const UNIV2_WETH_USDC_POOL = POOLS.UNIV2_USDC_WETH;
const UNIV2_WETH_UNI_POOL = null; // Not available in your config 
const UNIV2_WETH_DAI_POOL = POOLS.UNIV2_DAI_WETH;
const UNIV2_WETH_COW_POOL = POOLS.UNIV2_COW_WETH;
const UNIV2_WETH_USDT_POOL = POOLS.UNIV2_USDT_WETH;

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
const amountInUSDC = ethers.utils.parseUnits("500", 6);    // 500 USDC (6 decimales)
const amountInWETH = ethers.utils.parseUnits("0.5", 18);       // 0.5 WETH (18 decimales)
const amountInYBTC = ethers.utils.parseUnits("0.025", 8);     // 0.025 YBTC (8 decimales)
const amountInMETH = ethers.utils.parseUnits("0.5", 18);       // 0.5 METH (18 decimales)
const amountInUNI = ethers.utils.parseUnits("5", 18);       // 5 UNI (18 decimales)
const amountInLINK = ethers.utils.parseUnits("5", 18);      // 5 LINK (18 decimales)
const amountInDAI = ethers.utils.parseUnits("500", 18);     // 500 DAI (18 decimales)

// Definir fee tiers para Uniswap V3
const FEE_LOW = FEE_TIERS.LOW;       // 0.05% 
const FEE_MEDIUM = FEE_TIERS.MEDIUM;   // 0.3% - Este tier tiene más liquidez en Sepolia
const FEE_HIGH = FEE_TIERS.HIGH;    // 1%

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
    uniV3_10000: NaN,
    uniV3_100: NaN
  };
  
  // 1) SushiSwap V2 - Usar tokens V2
  try {
    // Para SushiSwap, usamos siempre las direcciones de tokens V2
    const path = [TOKENS_V2[symbolIn] || tokenIn, TOKENS_V2[symbolOut] || tokenOut];
    const amountsOut = await sushiRouter.getAmountsOut(amountIn, path);
    results.sushi = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`SushiSwap V2: ${results.sushi} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`SushiSwap V2 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  // 2) Uniswap V2 - Usar tokens V2
  try {
    // Para Uniswap V2, usamos siempre las direcciones de tokens V2
    const path = [TOKENS_V2[symbolIn] || tokenIn, TOKENS_V2[symbolOut] || tokenOut];
    const amountsOut = await uniV2Router.getAmountsOut(amountIn, path);
    results.uniV2 = parseFloat(ethers.utils.formatUnits(amountsOut[1], decimalsOut));
    console.log(`Uniswap V2: ${results.uniV2} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
  } catch (error) {
    console.log(`Uniswap V2 pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
  }

  // 3) Uniswap V3 con fee tiers específicos - Usar tokens V3
  const v3TokenIn = TOKENS_V3[symbolIn] || tokenIn;
  const v3TokenOut = TOKENS_V3[symbolOut] || tokenOut;
  const pairKey = `${v3TokenIn}_${v3TokenOut}`;
  
  // Intentar con cada fee tier conocido para este par
  const feeTiers = [100, 500, 3000, 10000];
  
  for (const fee of feeTiers) {
    try {
      // Verificar si este par específico tiene este fee tier
      if (discoveredFeeTiers[pairKey] && discoveredFeeTiers[pairKey] !== fee) {
        continue; // Saltar este fee tier si no coincide con el conocido
      }
      
      const outToken = await uniV3Quoter.callStatic.quoteExactInputSingle(
        v3TokenIn, amountIn, v3TokenOut, fee, 0
      );
      
      const feeTierKey = `uniV3_${fee}`;
      results[feeTierKey] = parseFloat(ethers.utils.formatUnits(outToken, decimalsOut));
      console.log(`Uniswap V3 (${fee/10000}%): ${results[feeTierKey]} ${symbolOut} por ${ethers.utils.formatUnits(amountIn, getDecimals(symbolIn))} ${symbolIn}`);
    } catch (error) {
      // Solo mostrar error para el fee tier que sabemos que debería existir
      if (discoveredFeeTiers[pairKey] === fee) {
        console.log(`Uniswap V3 (${fee/10000}%) pool ${symbolIn}/${symbolOut} no existe o ocurrió un error`);
      }
    }
  }
  
  return results;
}

// Helper function to get decimals based on token symbol
function getDecimals(symbol) {
  switch(symbol) {
    case 'USDC': return 6;
    case 'YBTC': return 8;
    default: return 18;  // Most tokens use 18 decimals
  }
}

// ================================
// Consultar reservas de un pool V2 usando datos del snapshot
// ================================
function checkPoolReservesFromSnapshot(poolAddress, symbol0, symbol1, decimals0, decimals1, amountToSwap, swapSymbol) {
  try {
    // Obtener información del pool desde el archivo de liquidez
    const poolData = liquidityData[getPoolKeyByAddress(poolAddress)];
    
    if (!poolData || poolData.type !== "V2") {
      console.log(`Pool V2 ${poolAddress} no encontrado en snapshot o no es tipo V2`);
      return null;
    }
    
    // Extraer reservas del snapshot
    const reserve0 = parseFloat(ethers.utils.formatUnits(poolData.token0.reserve, decimals0));
    const reserve1 = parseFloat(ethers.utils.formatUnits(poolData.token1.reserve, decimals1));
    
    console.log(`Pool V2 ${symbol0}/${symbol1} Reserves (from snapshot): ${reserve0} ${symbol0}, ${reserve1} ${symbol1}`);
    
    // Calcular proporción de precios implícita
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
    
    return { 
      token0: poolData.token0.address, 
      token1: poolData.token1.address, 
      reserve0, 
      reserve1, 
      price01, 
      price10 
    };
  } catch (error) {
    console.log(`Error checking pool reserves from snapshot for ${poolAddress}: ${error.message}`);
    return null;
  }
}

// Helper para encontrar la key del pool por su dirección
function getPoolKeyByAddress(address) {
  for (const [key, value] of Object.entries(POOLS)) {
    if (value.toLowerCase() === address.toLowerCase()) {
      return key;
    }
  }
  return null;
}

// ================================
// Consultar liquidez de un pool V3 usando datos del snapshot
// ================================
function checkPoolLiquidityFromSnapshot(poolAddress) {
  try {
    // Obtener información del pool desde el archivo de liquidez
    const poolKey = getPoolKeyByAddress(poolAddress);
    const poolData = liquidityData[poolKey];
    
    if (!poolData || poolData.type !== "V3") {
      console.log(`Pool V3 ${poolAddress} no encontrado en snapshot o no es tipo V3`);
      return null;
    }
    
    const symbol0 = poolData.token0.symbol;
    const symbol1 = poolData.token1.symbol;
    const liquidity = poolData.liquidity;
    const fee = poolData.fee;
    const tick = poolData.tick;
    
    console.log(`Pool V3 ${symbol0}/${symbol1} (fee: ${fee/10000}%)`);
    console.log(`  Liquidity: ${ethers.utils.formatEther(liquidity)} units`);
    console.log(`  Current tick: ${tick}`);
    
    return {
      token0: poolData.token0.address,
      token1: poolData.token1.address,
      liquidity,
      fee,
      tick,
      sqrtPriceX96: poolData.sqrtPriceX96
    };
  } catch (error) {
    console.log(`Error checking pool liquidity from snapshot for ${poolAddress}: ${error.message}`);
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
    targetRatio = 1700; // Esperamos ~1700 USDC por 1 ETH
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
  
  // ===== PAR WETH/YBTC =====
  const wethForYBTC = await queryTokenPair(YBTC, WETH, amountInYBTC, "YBTC", "WETH", 18);
  results.YBTC_weth = wethForYBTC;
  
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
  
  // ===== Check pool reserves for major pools usando snapshot =====
  console.log("\n===== VERIFICANDO RESERVES DE POOLS PRINCIPALES (DESDE SNAPSHOT) =====");
  
  // Verificar pools V2
  checkPoolReservesFromSnapshot(UNIV2_WETH_USDC_POOL, "USDC", "WETH", 6, 18, amountInUSDC, "USDC");
  checkPoolReservesFromSnapshot(UNIV2_WETH_DAI_POOL, "DAI", "WETH", 18, 18, amountInDAI, "DAI"); 
  checkPoolReservesFromSnapshot(UNIV2_WETH_COW_POOL, "COW", "WETH", 18, 18, ethers.utils.parseUnits("10", 18), "COW");
  
  // Verificar pools V3
  console.log("\n===== VERIFICANDO LIQUIDEZ DE POOLS V3 (DESDE SNAPSHOT) =====");
  checkPoolLiquidityFromSnapshot(UNIV3_WETH_USDC_POOL);
  checkPoolLiquidityFromSnapshot(UNIV3_WETH_UNI_POOL);
  checkPoolLiquidityFromSnapshot(UNIV3_WETH_LINK_POOL);
  
  return results;
}

// ================================
// Función para descubrir fee tiers de UniswapV3 desde el snapshot
// ================================
function getV3PoolFeeTiersFromSnapshot() {
  console.log("\n🔍 Cargando fee tiers de UniswapV3 desde snapshot...");
  
  const discoveredFeeTiers = {};
  
  // Iterar por todos los pools en el snapshot
  for (const [poolKey, poolData] of Object.entries(liquidityData)) {
    // Solo procesar pools V3
    if (poolData.type === "V3") {
      const token0Address = poolData.token0.address.toLowerCase();
      const token1Address = poolData.token1.address.toLowerCase();
      const fee = poolData.fee;
      
      // Guardar fee tier para ambos sentidos del par
      discoveredFeeTiers[`${token0Address}_${token1Address}`] = fee;
      discoveredFeeTiers[`${token1Address}_${token0Address}`] = fee;
      
      console.log(`  Pool ${poolData.token0.symbol}/${poolData.token1.symbol}: fee ${fee/10000}%`);
    }
  }
  
  console.log(`✅ Cargados ${Object.keys(discoveredFeeTiers).length/2} pares de tokens con sus fee tiers`);
  
  return discoveredFeeTiers;
}

// ================================
// Verificar liquidez Aave desde snapshot
// ================================
function checkAaveLiquidityFromSnapshot(tokenAddress, requiredAmount) {
  try {
    // Verificar si tenemos datos de Aave en el snapshot
    if (!liquidityData.AAVE_V3 || !liquidityData.AAVE_V3.reserves) {
      console.log("❌ Datos de reservas Aave no encontrados en el snapshot");
      return { hasLiquidity: false };
    }
    
    // Normalizar la dirección
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Buscar el token en las reservas de Aave
    let reserveData = null;
    let tokenSymbol = "";
    
    // Buscar por dirección
    for (const [symbol, data] of Object.entries(liquidityData.AAVE_V3.reserves)) {
      if (data.address.toLowerCase() === normalizedAddress) {
        reserveData = data;
        tokenSymbol = symbol;
        break;
      }
    }
    
    if (!reserveData) {
      console.log(`⚠️ Token ${normalizedAddress} no encontrado en las reservas de Aave`);
      return { hasLiquidity: false };
    }
    
    // En el snapshot no tenemos balance directo, pero podemos usar el índice de liquidez
    // como indicador aproximado
    const liquidityIndex = ethers.BigNumber.from(reserveData.liquidityIndex);
    const currentLiquidityRate = ethers.BigNumber.from(reserveData.currentLiquidityRate);
    
    // Una tasa de liquidez positiva y un índice de liquidez alto generalmente indican liquidez disponible
    const hasLiquidity = currentLiquidityRate.gt(0) && liquidityIndex.gt(ethers.utils.parseUnits("1", 18));
    
    if (hasLiquidity) {
      console.log(`✅ Reserva Aave para ${tokenSymbol} parece tener liquidez suficiente`);
      console.log(`   Tasa de liquidez: ${ethers.utils.formatUnits(currentLiquidityRate, 27)}%`);
    } else {
      console.log(`⚠️ Posible liquidez insuficiente para ${tokenSymbol} en Aave`);
      console.log(`   Tasa de liquidez: ${ethers.utils.formatUnits(currentLiquidityRate, 27)}%`);
    }
    
    return {
      hasLiquidity,
      reserveData
    };
  } catch (error) {
    console.error(`❌ Error verificando liquidez en Aave desde snapshot: ${error.message}`);
    return { hasLiquidity: false, error: error.message };
  }
}

// ================================
// Función para verificar viabilidad del flash loan antes de ejecutarlo
// ================================
async function verifyFlashLoanSafety(tokenAddress, amount, decimals) {
  try {
    console.log(`Verificando token: ${tokenAddress}`);
    
    // Lista de todos los tokens permitidos (combinando V2 y V3)
    const allowedTokens = [
      ...Object.values(TOKENS_V2),
      ...Object.values(TOKENS_V3),
      ...Object.values(AAVE_TOKENS)
    ];
    
    // Compara con normalización de direcciones
    const normalizedAddress = tokenAddress.toLowerCase();
    if (allowedTokens.some(addr => addr.toLowerCase() === normalizedAddress)) {
      console.log(`✅ Token aprobado para flash loan: ${normalizedAddress}`);
      
      // Verificar liquidez desde el snapshot
      const liquidityCheck = checkAaveLiquidityFromSnapshot(tokenAddress, amount);
      if (!liquidityCheck.hasLiquidity) {
        console.log(`⚠️ Aave podría no tener suficiente liquidez para este token`);
      }
      
      return true;
    }
    
    console.log(`❌ Token no reconocido - No se considera seguro para flash loan`);
    return false;
  } catch (error) {
    console.error(`Error verificando seguridad: ${error.message}`);
    return false;
  }
}

// Add this function to dynamically adjust flash loan amount based on available liquidity
async function getOptimalFlashLoanAmount(tokenAddress, requestedAmount, decimals) {
  try {
    // Verificar liquidez desde el snapshot
    const liquidityCheck = checkAaveLiquidityFromSnapshot(tokenAddress, requestedAmount);
    
    if (liquidityCheck.hasLiquidity) {
      return {
        amount: requestedAmount,
        adjusted: false
      };
    }
    
    // Si no hay suficiente liquidez, usar un monto conservador
    const safeAmount = requestedAmount.div(10); // 10% del monto solicitado
    
    // Format for display
    const formattedSafeAmount = ethers.utils.formatUnits(safeAmount, decimals);
    console.log(`🔄 Ajustando monto de flash loan a ${formattedSafeAmount} por posible limitación de liquidez`);
    
    return {
      amount: safeAmount,
      formatted: formattedSafeAmount,
      adjusted: true
    };
  } catch (error) {
    console.error(`Error ajustando monto: ${error.message}`);
    // Return a conservative default amount
    return {
      amount: ethers.utils.parseUnits("0.1", decimals),
      formatted: "0.1",
      adjusted: true
    };
  }
}

// ================================
// Añadir esta función para consultar la liquidez disponible en Aave para un token
// ================================
async function getAaveAvailableLiquidity(tokenAddress) {
  try {
    console.log(`📊 Consultando liquidez disponible en Aave para ${tokenAddress}...`);
    
    // Obtener la Pool de Aave desde el Provider
    const providerContract = new ethers.Contract(
      AAVE_TOKENS.POOL_ADDRESSES_PROVIDER, 
      ["function getPool() external view returns (address)"], 
      provider
    );
    const poolAddress = await providerContract.getPool();
    
    // Verificar datos de la reserva en la Pool
    const poolContract = new ethers.Contract(
      poolAddress, 
      ["function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
       "function getReservesList() external view returns (address[])"],
      provider
    );
    
    // Obtener datos de la reserva
    const reserveData = await poolContract.getReserveData(tokenAddress);
    
    // Consultar el balance del aToken que representa la liquidez disponible
    const aTokenContract = new ethers.Contract(
      reserveData.aTokenAddress,
      ["function balanceOf(address) view returns (uint256)","function decimals() view returns (uint8)"],
      provider
    );
    
    const aTokenDecimals = await aTokenContract.decimals();
    const liquidityInAToken = await aTokenContract.balanceOf(poolAddress);
    const formattedLiquidity = ethers.utils.formatUnits(liquidityInAToken, aTokenDecimals);
    
    console.log(`✅ Liquidez disponible en Aave: ${formattedLiquidity}`);
    
    // Determinar un monto seguro: 1% de la liquidez disponible
    const safeLoanAmount = liquidityInAToken.mul(1).div(100); // 1% de la liquidez
    const formattedSafeLoan = ethers.utils.formatUnits(safeLoanAmount, aTokenDecimals);
    console.log(`💡 Monto seguro recomendado para flash loan (1%): ${formattedSafeLoan}`);
    
    return { 
      available: !liquidityInAToken.isZero(), 
      liquidity: liquidityInAToken,
      formattedLiquidity,
      safeLoanAmount,
      formattedSafeLoan,
      decimals: aTokenDecimals
    };
  } catch (error) {
    console.log(`❌ Error al consultar liquidez en Aave: ${error.message}`);
    return { 
      available: false, 
      liquidity: ethers.BigNumber.from(0),
      formattedLiquidity: "0",
      safeLoanAmount: ethers.BigNumber.from(0),
      formattedSafeLoan: "0",
      decimals: 18
    };
  }
}

// ================================
// Función para obtener gas settings óptimos
// ================================
async function getOptimizedGasFees(speed = 'fast', operationType = 'default') {
  try {
    const feeData = await provider.getFeeData();
    
    // Ajustar multiplicador basado en la velocidad
    let multiplier;
    switch (speed) {
      case 'economic':   // Nuevo modo económico
        multiplier = 1.05;
        break;
      case 'standard':   // Renombrado de 'default' a 'standard'
        multiplier = 1.1;
        break;
      case 'fast':
        multiplier = 1.2;
        break;
      case 'fastest':
        multiplier = 1.35; // Reducido de 1.5 a 1.35 para mejor balance
        break;
      default:
        multiplier = 1.1;
    }
    
    // Ajustar priority fee basado en operación 
    let priorityMultiplier;
    switch (operationType) {
      case 'flashloan':
        priorityMultiplier = 1.1;  // Prioridad ligeramente superior
        break;
      case 'arbitrage':
        priorityMultiplier = 1.2;  // Alta prioridad para arbitraje
        break;
      default:
        priorityMultiplier = 1.0;
    }
    
    // Gas limit optimizado por tipo de operación
    let gasLimit;
    switch (operationType) {
      case 'approval':
        gasLimit = 100000;  // Las aprobaciones necesitan menos gas
        break;
      case 'direct_swap':
        gasLimit = 300000;  // Swaps directos
        break;
      case 'flashloan':
        gasLimit = 1000000; // Flash loans necesitan más gas pero no tanto como antes
        break;
      case 'arbitrage':
        gasLimit = 1500000; // Las operaciones de arbitraje completas necesitan bastante gas
        break;
      default:
        gasLimit = 500000;  // Reducido del valor fijo anterior de 4,000,000
    }
    
    // Calcular gas fees optimizados
    const maxFeePerGas = feeData.maxFeePerGas.mul(Math.floor(multiplier * 100)).div(100);
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      .mul(Math.floor(multiplier * priorityMultiplier * 100)).div(100);
    
    // Añadir esta validación para que maxPriorityFeePerGas nunca exceda maxFeePerGas
    if (maxPriorityFeePerGas.gt(maxFeePerGas)) {
      maxPriorityFeePerGas = maxFeePerGas;
    }
    
    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gasLimit
    };
  } catch (error) {
    console.warn("Error getting optimized gas fees:", error.message);
    // Valores de fallback más eficientes por tipo
    const fallbackGasLimits = {
      'approval': 100000,
      'direct_swap': 300000,
      'flashloan': 1000000,
      'arbitrage': 1500000,
      'default': 500000
    };
    
    return {
      gasPrice: ethers.utils.parseUnits("3", "gwei"), // Reducido de 5 gwei
      gasLimit: fallbackGasLimits[operationType] || 500000
    };
  }
}

// ================================
// Función para ejecutar arbitraje utilizando flash loans
// ================================
async function executeArbitrage(tokenInSymbol, tokenOutSymbol, amountInFormatted, buyDexName, sellDexName) {
  try {
    console.log(`\n🚀 EJECUTANDO ARBITRAJE CON FLASH LOAN: ${tokenInSymbol} → ${tokenOutSymbol} → ${tokenInSymbol}`);
    
    if (!wallet) {
      console.log("❌ No hay wallet configurado. Agrega PRIVATE_KEY en tu archivo .env");
      return;
    }
    
    // Mapeo de símbolos a direcciones
    const tokenMap = {
      "USDC": AAVE_TOKENS.USDC, // Use Aave version
      "WETH": AAVE_TOKENS.WETH, // Use Aave version
      "LINK": AAVE_TOKENS.LINK, // Use Aave version
      "DAI": AAVE_TOKENS.DAI,   // Use Aave version
      "USDT": AAVE_TOKENS.USDT  // Use Aave version
    };
    
    // Obtener la dirección del token correspondiente
    const tokenInAddress = tokenMap[tokenInSymbol];
    if (!tokenInAddress) {
      console.log(`❌ No se pudo encontrar dirección para ${tokenInSymbol}`);
      return;
    }
    
    // Paso 1: Consultar liquidez en Aave para este token
    console.log(`\n📋 PASO 1: Verificando liquidez disponible en Aave para ${tokenInSymbol}...`);
    const liquidityInfo = await getAaveAvailableLiquidity(tokenInAddress);
    
    if (!liquidityInfo.available) {
      console.log(`❌ No hay liquidez disponible en Aave para ${tokenInSymbol}, abortando operación`);
      console.log(`⚠️ Cambiando a arbitraje directo debido a insuficiencia de liquidez en Aave`);
      return executeDirectArbitrage(tokenInSymbol, amountInFormatted);
    }
    
    // Paso 2: Comparar el monto solicitado con el monto seguro disponible
    console.log(`\n📋 PASO 2: Validando monto del flash loan...`);
    
    // Determinar decimales del token
    const tokenContract = new ethers.Contract(
      tokenInAddress,
      ["function decimals() view returns (uint8)", "function balanceOf(address owner) view returns (uint256)"],
      provider
    );
    const decimals = await tokenContract.decimals();
    
    // Calcular monto con decimales
    const requestedAmount = ethers.utils.parseUnits(amountInFormatted, decimals);
    
    // Si el monto solicitado es mayor que el monto seguro, usar el monto seguro
    let finalAmount;
    let finalAmountFormatted;
    
    if (requestedAmount.gt(liquidityInfo.safeLoanAmount)) {
      console.log(`⚠️ Monto solicitado (${amountInFormatted}) excede el monto seguro (${liquidityInfo.formattedSafeLoan})`);
      console.log(`✅ Ajustando a monto seguro: ${liquidityInfo.formattedSafeLoan} ${tokenInSymbol}`);
      finalAmount = liquidityInfo.safeLoanAmount;
      finalAmountFormatted = liquidityInfo.formattedSafeLoan;
    } else {
      console.log(`✅ Monto solicitado (${amountInFormatted}) está dentro de límites seguros`);
      finalAmount = requestedAmount;
      finalAmountFormatted = amountInFormatted;
    }
    
    // Verificar si el monto es demasiado pequeño (al menos 0.001 tokens)
    const minAmount = ethers.utils.parseUnits("0.001", decimals);
    if (finalAmount.lt(minAmount)) {
      console.log(`⚠️ Monto calculado demasiado pequeño, usando mínimo de 0.001 ${tokenInSymbol}`);
      finalAmount = minAmount;
      finalAmountFormatted = "0.001";
    }
    
    // Paso 3: Verificar que el contrato ArbitrageLogic esté configurado correctamente
    console.log(`\n📋 PASO 3: Verificando configuración del contrato ArbitrageLogic...`);
    const arbitrageContract = new ethers.Contract(
      ARBITRAGE_LOGIC_ADDRESS,
      ["function flashLoan() view returns (address)"],
      provider
    );
    
    try {
      const configuredFlashLoan = await arbitrageContract.flashLoan();
      console.log(`Dirección de FlashLoan configurada en ArbitrageLogic: ${configuredFlashLoan}`);
      if (configuredFlashLoan.toLowerCase() !== FLASH_LOAN_CONTRACT_ADDRESS.toLowerCase()) {
        console.log(`⚠️ ADVERTENCIA: La dirección configurada no coincide con la esperada: ${FLASH_LOAN_CONTRACT_ADDRESS}`);
      } else {
        console.log(`✅ Configuración correcta entre contratos`);
      }
    } catch (error) {
      console.log(`⚠️ No se pudo verificar la configuración: ${error.message}`);
    }
    
    // Paso 4: Ejecutar el flash loan con el monto seguro
    console.log(`\n📋 PASO 4: Ejecutando flash loan con ${finalAmountFormatted} ${tokenInSymbol}...`);
    
    // Verificar balance antes del flash loan
    const balanceBefore = await tokenContract.balanceOf(FLASH_LOAN_CONTRACT_ADDRESS);
    console.log(`Balance inicial del contrato FlashLoan: ${ethers.utils.formatUnits(balanceBefore, decimals)} ${tokenInSymbol}`);
    
    // Conectar al contrato flash loan
    const flashLoanContract = new ethers.Contract(
      FLASH_LOAN_CONTRACT_ADDRESS,
      flashLoanABI,
      wallet
    );
    
    // Optimizar gas settings
    const gasPrices = await getOptimizedGasFees('fast', 'flashloan');
    console.log(`🛢️ Gas: maxFeePerGas=${ethers.utils.formatUnits(gasPrices.maxFeePerGas, 'gwei')} gwei, maxPriorityFeePerGas=${ethers.utils.formatUnits(gasPrices.maxPriorityFeePerGas, 'gwei')} gwei`);
    
    // IMPORTANTE: Asegurarse que maxPriorityFeePerGas nunca sea mayor que maxFeePerGas
    if (gasPrices.maxPriorityFeePerGas && gasPrices.maxPriorityFeePerGas.gt(gasPrices.maxFeePerGas)) {
      console.log(`⚠️ Corrigiendo maxPriorityFeePerGas para que no exceda maxFeePerGas`);
      gasPrices.maxPriorityFeePerGas = gasPrices.maxFeePerGas;
    }
    
    // Ejecutar flash loan
    console.log(`📝 Enviando transacción...`);
    const tx = await flashLoanContract.executeFlashLoan(tokenInAddress, finalAmount, gasPrices);
    console.log(`⏳ Transacción enviada, hash: ${tx.hash}`);
    console.log(`   Monitorizar en: https://sepolia.etherscan.io/tx/${tx.hash}`);
    
    // Esperar confirmación
    console.log(`⌛ Esperando confirmación...`);
    const receipt = await tx.wait();
    
    // Verificar resultado
    if (receipt.status === 1) {
      console.log(`✅ Flash loan ejecutado exitosamente!`);
    } else {
      console.log(`❌ La transacción falló`);
    }
    
    // Verificar balance después del flash loan
    const balanceAfter = await tokenContract.balanceOf(FLASH_LOAN_CONTRACT_ADDRESS);
    console.log(`Balance final del contrato FlashLoan: ${ethers.utils.formatUnits(balanceAfter, decimals)} ${tokenInSymbol}`);
    
    const profit = balanceAfter.sub(balanceBefore);
    if (profit.gt(0)) {
      console.log(`💰 Ganancia: ${ethers.utils.formatUnits(profit, decimals)} ${tokenInSymbol}`);
    } else {
      console.log(`📉 Sin ganancia o pérdida: ${ethers.utils.formatUnits(profit, decimals)} ${tokenInSymbol}`);
    }
    
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error(`❌ Error ejecutando flash loan: ${error.message}`);
    
    // Verificar si es un error de gas
    if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      console.log(`💡 Este error suele significar que hay un revert en el contrato. Verificar que el ArbitrageLogic devuelva los tokens correctamente.`);
    }
    
    // Verificar si es un error de validación EIP-1559
    if (error.message && error.message.includes('max priority fee per gas higher than max fee per gas')) {
      console.log(`💡 Error de configuración de gas EIP-1559. Las tarifas de prioridad no pueden ser mayores que las tarifas máximas.`);
    }
    
    return { success: false, error: error.message };
  }
}

// ================================
// Función para ejecutar arbitraje directo (sin flash loan)
// ================================
async function executeDirectArbitrage(tokenInSymbol, amountInFormatted) {
  try {
    console.log(`🚀 Ejecutando arbitraje directo con ${amountInFormatted} ${tokenInSymbol}...`);
    
    // Mapeo de símbolos a direcciones (usando tokens normales, no Aave)
    const tokenInAddress = TOKENS[tokenInSymbol];
    if (!tokenInAddress) {
      console.log(`❌ No se pudo encontrar dirección para ${tokenInSymbol}`);
      return { success: false };
    }
    
    // Connect to ArbitrageLogic contract
    const arbLogicContract = new ethers.Contract(
      ARBITRAGE_LOGIC_ADDRESS,
      ["function executeDirectArbitrage(address token, uint256 amount)"],
      wallet
    );
    
    // Get token details
    const tokenContract = new ethers.Contract(
      tokenInAddress,
      ["function decimals() view returns (uint8)", "function approve(address spender, uint256 amount)"],
      wallet
    );
    const decimals = await tokenContract.decimals();
    
    // Parse amount with correct decimals
    const amountIn = ethers.utils.parseUnits(amountInFormatted, decimals);
    
    // Approve ArbitrageLogic to spend tokens
    const approveTx = await tokenContract.approve(ARBITRAGE_LOGIC_ADDRESS, amountIn);
    await approveTx.wait();
    console.log(`✅ Approved ${ARBITRAGE_LOGIC_ADDRESS} to spend ${amountInFormatted} ${tokenInSymbol}`);
    
    // Get optimal gas settings
    const gasSettings = await getOptimizedGasFees('fast', 'direct_swap');
    
    // Execute direct arbitrage
    const tx = await arbLogicContract.executeDirectArbitrage(
      tokenInAddress, 
      amountIn,
      { ...gasSettings }
    );
    
    console.log(`✅ Direct arbitrage initiated! Tx hash: ${tx.hash}`);
    console.log(`📊 View details at: https://sepolia.etherscan.io/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error(`Error ejecutando arbitraje directo: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ================================
// Simple triangular arbitrage function - placeholder for now
// ================================
async function findTriangularArbitrageOpportunities(priceResults) {
  console.log("Encontradas 0 posibles rutas triangulares");
  return; // Placeholder implementation
}

// ================================
// Función principal de monitoreo
// ================================
async function monitor() {
  try {
    // 1. Cargar fee tiers desde el snapshot
    discoveredFeeTiers = getV3PoolFeeTiersFromSnapshot();
    
    // 2. Query prices across DEXes
    const priceResults = await getPrices();
    
    // 3. Analyze for arbitrage opportunities
    console.log("\n=================== ANÁLISIS DE ARBITRAJE DIRECTO ===================");
    
    // Check each token pair
    await analyzeArbitragePair(priceResults.usdc_weth, "USDC", "WETH", "500");
    await analyzeArbitragePair(priceResults.YBTC_weth, "YBTC", "WETH", "0.025");
    await analyzeArbitragePair(priceResults.meth_weth, "METH", "WETH", "0.5");
    await analyzeArbitragePair(priceResults.uni_weth, "UNI", "WETH", "5");
    await analyzeArbitragePair(priceResults.link_weth, "LINK", "WETH", "0.5"); // Cambiado de 5 a 0.5 para LINK
    await analyzeArbitragePair(priceResults.dai_weth, "DAI", "WETH", "500");
    
    // 4. Look for triangular opportunities 
    console.log("\n=================== ANÁLISIS DE ARBITRAJE TRIANGULAR ===================");
    await findTriangularArbitrageOpportunities(priceResults);
  } catch (error) {
    console.error("Error en monitor:", error);
  }
}

// ================================
// Función para analizar oportunidades de arbitraje en un par
// ================================
async function analyzeArbitragePair(results, tokenInSymbol, tokenOutSymbol, amountInFormatted) {
  console.log(`\n📊 ANÁLISIS PAR ${tokenInSymbol}/${tokenOutSymbol}:`);
  
  // Filter valid prices (not NaN)
  const validPrices = {};
  Object.entries(results).forEach(([dex, price]) => {
    if (!isNaN(price)) validPrices[dex] = price;
  });
  
  if (Object.keys(validPrices).length < 2) {
    console.log(`No hay suficientes DEXes con liquidez para comparar precios`);
    return;
  }
  
  // Find best and worst prices
  let maxPrice = -Infinity, minPrice = Infinity;
  let buyDex = '', sellDex = '';
  
  Object.entries(validPrices).forEach(([dex, price]) => {
    if (price > maxPrice) { maxPrice = price; sellDex = dex; }
    if (price < minPrice) { minPrice = price; buyDex = dex; }
  });
  
  const diffPercent = ((maxPrice - minPrice) / minPrice) * 100;
  
  if (diffPercent > 0) {
    console.log(`${diffPercent.toFixed(2)}% oportunidad: Comprar en ${buyDex} y vender en ${sellDex}`);
    
    // Si el spread es mayor que el mínimo y la ejecución está habilitada
    if (diffPercent > MIN_PROFIT_PERCENT) {
      // Calculate optimal amount based on pool liquidity
      console.log(`🔍 Calculando monto óptimo para ${tokenInSymbol} basado en liquidez...`);
      
      // Try to get the optimal amount based on current liquidity
      const optimalAmount = calculateOptimalAmount(tokenInSymbol);
      const amountToUse = optimalAmount || amountInFormatted;
      
      if (optimalAmount) {
        console.log(`✅ Usando monto óptimo de ${optimalAmount} ${tokenInSymbol}`);
      } else {
        console.log(`No se pudo determinar liquidez para ${tokenInSymbol}, usando valor por defecto`);
      }
      
      if (IS_EXECUTION_ENABLED) {
        await executeArbitrage(tokenInSymbol, tokenOutSymbol, amountToUse, buyDex, sellDex);
      } else {
        console.log(`⚠️ Ejecución deshabilitada, solo monitoreando (IS_EXECUTION_ENABLED = false)`);
      }
    } else {
      console.log(`Diferencia insuficiente para arbitraje rentable (mínimo: ${MIN_PROFIT_PERCENT}%)`);
    }
  } else {
    console.log(`Sin oportunidad de arbitraje identificada para ${tokenInSymbol}/${tokenOutSymbol}`);
  }
}

// Function to calculate optimal amount based on liquidity
function calculateOptimalAmount(tokenSymbol) {
  try {
    // Get relevant pools for this token
    const relevantPools = getRelevantPoolsForToken(tokenSymbol);
    
    if (relevantPools.length === 0) {
      console.log(`No se encontraron pools para ${tokenSymbol}`);
      return null;
    }
    
    let minLiquidityPerc = 0.025; // Use at most 2.5% of pool liquidity
    let optimalAmount = null;
    
    // Check pools and find a safe amount
    for (const poolAddress of relevantPools) {
      const poolInfo = liquidityData[getPoolKeyByAddress(poolAddress)];
      
      if (!poolInfo) continue;
      
      let tokenInfo = null;
      let tokenDecimals = 18;
      
      // Find which side of the pool is our token
      if (poolInfo.token0.symbol === tokenSymbol) {
        tokenInfo = poolInfo.token0;
        tokenDecimals = getDecimals(tokenSymbol);
      } else if (poolInfo.token1.symbol === tokenSymbol) {
        tokenInfo = poolInfo.token1;
        tokenDecimals = getDecimals(tokenSymbol);
      }
      
      if (tokenInfo) {
        const reserve = ethers.BigNumber.from(tokenInfo.reserve);
        const safeAmount = reserve.mul(Math.floor(minLiquidityPerc * 100)).div(100);
        const formattedSafe = ethers.utils.formatUnits(safeAmount, tokenDecimals);
        
        console.log(`Pool ${poolInfo.token0.symbol}/${poolInfo.token1.symbol}: ${ethers.utils.formatUnits(reserve, tokenDecimals)} ${tokenSymbol} disponible`);
        console.log(`Monto seguro (${minLiquidityPerc * 100}%): ${formattedSafe} ${tokenSymbol}`);
        
        // Keep track of smallest safe amount across pools
        if (!optimalAmount || parseFloat(formattedSafe) < parseFloat(optimalAmount)) {
          optimalAmount = formattedSafe;
        }
      }
    }
    
    return optimalAmount;
  } catch (error) {
    console.error(`Error calculando monto óptimo: ${error.message}`);
    return getDefaultAmountForToken(tokenSymbol);
  }
}

// Function to get default amount for a token
function getDefaultAmountForToken(tokenSymbol) {
  const defaults = {
    "USDC": "500",
    "WETH": "0.5",
    "DAI": "500",
    "YBTC": "0.025",
    "METH": "0.5",
    "UNI": "5",
    "LINK": "0.5", // Cambiado de 5 a 0.5 para LINK
    "YU": "5",
    "QRT": "5",
    "USDT": "500",
    "COW": "10"
  };
  
  return defaults[tokenSymbol] || "1";
}

// Function to get relevant pools for a token
function getRelevantPoolsForToken(tokenSymbol) {
  const poolAddresses = [];
  
  // Check each pool in liquidityData to see if it contains the token
  for (const [poolKey, poolData] of Object.entries(liquidityData)) {
    if (poolData?.token0?.symbol === tokenSymbol || poolData?.token1?.symbol === tokenSymbol) {
      const poolAddress = POOLS[poolKey];
      if (poolAddress) poolAddresses.push(poolAddress);
    }
  }
  
  return poolAddresses;
}

// Iniciar monitoreo
console.log("🚀 Iniciando monitoreo de arbitraje en Sepolia Testnet usando datos de liquidez precalculados...");
monitor();