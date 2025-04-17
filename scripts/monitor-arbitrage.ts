import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TOKENS, DEX_ROUTERS, FACTORIES, POOLS, DEPLOYED_CONTRACTS, FEE_TIERS, AAVE_TOKENS } from "./sepoliaAddresses";
dotenv.config();

// Add these lines near the top of your file
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
    
    // Determinar decimales del token
    const tokenContract = new ethers.Contract(
      tokenInAddress,
      ["function decimals() view returns (uint8)", "function allowance(address owner, address spender) view returns (uint256)", "function approve(address spender, uint256 amount) returns (bool)"],
      wallet
    );
    const decimals = await tokenContract.decimals();
    
    // Calcular monto con decimales
    const amountIn = ethers.utils.parseUnits(amountInFormatted, decimals);
    
    // Verificar liquidez en Aave usando el snapshot
    const liquidityCheck = checkAaveLiquidityFromSnapshot(tokenInAddress, amountIn);
    if (!liquidityCheck.hasLiquidity) {
      console.log(`⚠️ Cambiando a arbitraje directo debido a posible insuficiencia de liquidez en Aave`);
      return executeDirectArbitrage(tokenInSymbol, amountInFormatted);
    }
    
    console.log(`💰 Iniciando flash loan para ${amountInFormatted} ${tokenInSymbol}...`);
    
    // Connect to the flash loan contract
    const flashLoanContract = new ethers.Contract(
      FLASH_LOAN_CONTRACT_ADDRESS,
      flashLoanABI,
      wallet
    );
    
    // Get optimal gas settings for fast
    const gasSettings = await getOptimizedGasFees('fastest');
    
    // Execute the flash loan
    const tx = await flashLoanContract.executeFlashLoan(
      tokenInAddress,
      amountIn,
      { ...gasSettings }  // Pass gas settings as transaction overrides
    );

    console.log(`✅ Flash loan initiated! Tx hash: ${tx.hash}`);
    console.log(`📊 View details at: https://sepolia.etherscan.io/tx/${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error(`Error ejecutando flash loan: ${error}`);
    return { success: false, error };
  }
}

// ================================
// Función para ejecutar arbitraje directo (sin flash loan)
// ================================
async function executeDirectArbitrage(tokenInSymbol, amountInFormatted) {
  try {
    console.log(`🚀 Ejecutando arbitraje directo con ${amountInFormatted} ${tokenInSymbol}...`);
    
    // Mapeo de símbolos a direcciones (usando tokens normales, no Aave)
    const tokenMap = {
      "USDC": TOKENS.USDC,
      "WETH": TOKENS.WETH,
      "LINK": TOKENS.LINK,
      "DAI": TOKENS.DAI,
      "USDT": TOKENS.USDT
    };
    
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
    const gasSettings = await getOptimizedGasFees('fastest');
    
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
    console.error(`Error ejecutando arbitraje directo: ${error}`);
    return { success: false, error };
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
    await analyzeArbitragePair(priceResults.link_weth, "LINK", "WETH", "5");
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
    
    if (diffPercent > MIN_PROFIT_PERCENT && IS_EXECUTION_ENABLED) {
      executeArbitrage(tokenInSymbol, tokenOutSymbol, amountInFormatted, buyDex, sellDex);
    }
  }
}

// ================================
// Función para obtener gas settings óptimos
// ================================
async function getOptimizedGasFees(speed = 'fast') {
  try {
    const feeData = await provider.getFeeData();
    
    // Adjust based on speed
    let multiplier = 1.1; // Default: 10% extra
    if (speed === 'fast') multiplier = 1.2;
    if (speed === 'fastest') multiplier = 1.5;
    
    return {
      maxFeePerGas: feeData.maxFeePerGas.mul(Math.floor(multiplier * 100)).div(100),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(Math.floor(multiplier * 100)).div(100),
      gasLimit: 4000000
    };
  } catch (error) {
    console.warn("Error getting optimized gas fees:", error.message);
    // Default fallback values
    return {
      gasPrice: ethers.utils.parseUnits("5", "gwei"),
      gasLimit: 4000000
    };
  }
}

// Start monitoring
console.log("🚀 Iniciando monitoreo de arbitraje en Sepolia Testnet usando datos de liquidez precalculados...");
monitor();