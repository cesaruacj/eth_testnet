import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { POOLS, TOKENS, AAVE_TOKENS, AAVE_V3 } from "./sepoliaAddresses";
dotenv.config();

const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

// ABI para pools de UniswapV2/SushiSwapV2
const pairV2ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

// ABI para pools de UniswapV3
const poolV3ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function liquidity() external view returns (uint128)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function fee() external view returns (uint24)"
];

// ABI para Aave V3 Pool
const aavePoolABI = [
  "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
  "function getReservesList() external view returns (address[])"
];

// ABI para el PoolAddressesProvider de Aave
const poolAddressProviderABI = [
  "function getPool() external view returns (address)"
];

// Helper to get symbol by address
function getSymbolByAddress(address: string): string {
  for (const [symbol, addr] of Object.entries(TOKENS)) {
    if (addr.toLowerCase() === address.toLowerCase()) return symbol;
  }
  
  // Also check in AAVE_TOKENS
  for (const [symbol, addr] of Object.entries(AAVE_TOKENS)) {
    if (addr.toLowerCase() === address.toLowerCase()) return symbol + "_AAVE";
  }
  
  return address;
}

// Determinar si un pool es V2 o V3 basado en su nombre
function isV3Pool(poolName: string): boolean {
  return poolName.startsWith("UNIV3_");
}

async function scanAllPools() {
  const results: Record<string, any> = {};
  const timestamp = Math.floor(Date.now() / 1000);

  // 1. Primero escanea todos los pools DEX
  for (const [poolName, poolAddress] of Object.entries(POOLS)) {
    try {
      // For DEX pools (Uniswap/Sushiswap)
      const isV3 = isV3Pool(poolName);
      const abi = isV3 ? poolV3ABI : pairV2ABI;
      
      console.log(`Scanning ${isV3 ? 'V3' : 'V2'} pool: ${poolName}`);
      const contract = new ethers.Contract(poolAddress, abi, provider);
      
      // Common for both V2 and V3
      const token0 = await contract.token0();
      const token1 = await contract.token1();
      const symbol0 = getSymbolByAddress(token0);
      const symbol1 = getSymbolByAddress(token1);
      
      // Pool-specific data
      if (isV3) {
        // UniswapV3 pool
        const liquidity = await contract.liquidity();
        const slot0 = await contract.slot0();
        const fee = await contract.fee();
        
        results[poolName] = {
          address: poolAddress,
          type: "V3",
          token0: { address: token0, symbol: symbol0 },
          token1: { address: token1, symbol: symbol1 },
          liquidity: liquidity.toString(),
          sqrtPriceX96: slot0.sqrtPriceX96.toString(),
          tick: slot0.tick,
          fee: fee,
          timestamp
        };
        
        console.log(`${poolName}: ${symbol0}/${symbol1}, Liquidity=${liquidity.toString()}, Tick=${slot0.tick}, Fee=${fee}`);
      } else {
        // UniswapV2/SushiSwapV2 pool
        const reserves = await contract.getReserves();
        
        results[poolName] = {
          address: poolAddress,
          type: "V2",
          token0: { address: token0, symbol: symbol0, reserve: reserves[0].toString() },
          token1: { address: token1, symbol: symbol1, reserve: reserves[1].toString() },
          timestamp
        };
        
        console.log(`${poolName}: ${symbol0}=${reserves[0].toString()}, ${symbol1}=${reserves[1].toString()}`);
      }
    } catch (err) {
      results[poolName] = { 
        error: err instanceof Error ? err.message : String(err), 
        address: poolAddress,
        timestamp 
      };
      console.log(`${poolName}: Error - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Ahora escanea las reservas de Aave V3 (separado de los pools DEX)
  try {
    console.log(`Scanning Aave V3 reserves using PoolAddressesProvider`);
    
    // Obtener la dirección del Pool dinámicamente a través del Provider
    const providerContract = new ethers.Contract(AAVE_V3.POOL_ADDRESSES_PROVIDER, poolAddressProviderABI, provider);
    const poolAddress = await providerContract.getPool();
    const aavePool = new ethers.Contract(poolAddress, aavePoolABI, provider);
    
    // Get all reserves (supported tokens) in the Aave pool
    const reservesList = await aavePool.getReservesList();
    const aaveResults: Record<string, any> = {};
    
    // For each reserve, get its data
    for (const assetAddress of reservesList) {
      try {
        const reserveData = await aavePool.getReserveData(assetAddress);
        const symbol = getSymbolByAddress(assetAddress);
        
        aaveResults[symbol] = {
          address: assetAddress,
          liquidityIndex: reserveData.liquidityIndex.toString(),
          currentLiquidityRate: reserveData.currentLiquidityRate.toString(),
          variableBorrowRate: reserveData.currentVariableBorrowRate.toString(),
          stableBorrowRate: reserveData.currentStableBorrowRate.toString(),
          aTokenAddress: reserveData.aTokenAddress,
          lastUpdateTimestamp: reserveData.lastUpdateTimestamp.toString()
        };
        
        console.log(`AAVE Reserve ${symbol}: liquidity rate=${ethers.utils.formatUnits(reserveData.currentLiquidityRate, 27)}%`);
      } catch (assetErr) {
        console.log(`Error scanning Aave asset ${assetAddress}: ${assetErr instanceof Error ? assetErr.message : String(assetErr)}`);
      }
    }
    
    // Guardar toda la información de Aave V3 en el resultado final
    results["AAVE_V3"] = {
      poolAddress: poolAddress,
      poolAddressProvider: AAVE_V3.POOL_ADDRESSES_PROVIDER,
      type: "AAVE_V3",
      reserves: aaveResults,
      timestamp
    };
    
    console.log(`Successfully scanned ${Object.keys(aaveResults).length} Aave V3 reserves`);
    
  } catch (err) {
    results["AAVE_V3"] = { 
      error: err instanceof Error ? err.message : String(err),
      poolAddressProvider: AAVE_V3.POOL_ADDRESSES_PROVIDER,
      timestamp 
    };
    console.log(`Error scanning Aave V3: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Ensure data directory exists
  const dataDir = path.join(__dirname, "../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created directory: ${dataDir}`);
  }

  // Save to file in the data folder
  const filePath = path.join(dataDir, "liquidity-snapshot.json");
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`✅ Liquidity snapshot saved to ${filePath}`);
}

scanAllPools();