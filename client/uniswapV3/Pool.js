const { ethers } = require("ethers");
const { Pool } = require("@uniswap/v3-sdk");
const { Token } = require("@uniswap/sdk-core");
const {
  abi: IUniswapV3PoolABI,
} = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");

// Conexión al RPC de BaseChain (chainId: 8453)
const provider = new ethers.providers.JsonRpcProvider(
  "https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F"
);

// Parámetros del par a consultar
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // 6 decimales
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // 18 decimales
const feeTier = 3000; // 0.3%

// Factory de Uniswap V3 en BaseChain
const factoryAddress = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";

// ABI mínima para getPool
const factoryAbi = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, provider);

// Función para obtener dinámicamente la dirección del pool
async function getPoolAddress() {
  const poolAddr = await factoryContract.getPool(USDC_ADDRESS, WETH_ADDRESS, feeTier);
  return poolAddr;
}

// Funciones para obtener datos del pool
async function getPoolImmutables(poolContract) {
  const [factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick] =
    await Promise.all([
      poolContract.factory(),
      poolContract.token0(),
      poolContract.token1(),
      poolContract.fee(),
      poolContract.tickSpacing(),
      poolContract.maxLiquidityPerTick(),
    ]);

  return { factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick };
}

async function getPoolState(poolContract) {
  const [liquidity, slot] = await Promise.all([
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  return {
    liquidity,
    sqrtPriceX96: slot[0],
    tick: slot[1],
    observationIndex: slot[2],
    observationCardinality: slot[3],
    observationCardinalityNext: slot[4],
    feeProtocol: slot[5],
    unlocked: slot[6],
  };
}

async function main() {
  // 1. Obtener la dirección del pool dinámicamente
  const poolAddress = await getPoolAddress();
  if (poolAddress === ethers.constants.AddressZero) {
    console.error("No existe un pool para USDC/WETH con fee tier", feeTier);
    return;
  }
  console.log("Pool address obtenido:", poolAddress);

  // 2. Instanciar el contrato del pool usando la ABI de Uniswap V3 Pool
  const poolContract = new ethers.Contract(poolAddress, IUniswapV3PoolABI, provider);

  // 3. Obtener datos inmutables y el estado actual del pool
  const [immutables, state] = await Promise.all([
    getPoolImmutables(poolContract),
    getPoolState(poolContract),
  ]);

  // 4. Validar dinámicamente el orden de tokens
  // Uniswap V3 asigna token0/token1 basándose en el orden lexicográfico.
  // Si immutables.token0 coincide con USDC_ADDRESS, asumimos ese orden; de lo contrario, invertimos.
  let TokenUSDC, TokenWETH;
  if (immutables.token0.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
    TokenUSDC = new Token(8453, immutables.token0, 6, "USDC", "USD Coin");
    TokenWETH = new Token(8453, immutables.token1, 18, "WETH", "Wrapped Ether");
  } else {
    TokenUSDC = new Token(8453, immutables.token1, 6, "USDC", "USD Coin");
    TokenWETH = new Token(8453, immutables.token0, 18, "WETH", "Wrapped Ether");
  }

  // 5. Crear el objeto Pool de Uniswap V3 usando los datos obtenidos
  const poolExample = new Pool(
    TokenUSDC,
    TokenWETH,
    immutables.fee,
    state.sqrtPriceX96.toString(),
    state.liquidity.toString(),
    state.tick
  );
  console.log("Pool object:", poolExample);
}

main();
