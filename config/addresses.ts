/**
 * Token and contract addresses for Sepolia testnet
 */

// Token addresses
export const TOKENS = {
  // Regular tokens (V2)
  USDC: "0xbe72e441bf55620febc26715db68d3494213d8cb",
  USDC_V3: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  DAI: "0xb4f1737af37711e9a5890d9510c9bb60e170cb0d",
  USDT: "0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0",
  COW: "0x0625afb445c3b6b7b929342a04a22599fd5dbb59",
  UNI: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  LINK: "0x779877a7b0d9e8603169ddbd7836e478b4624789",
  YU: "0xe0232d625ea3b94698f0a7dff702931b704083c9",
  YBTC: "0xbbd3edd4d3b519c0d14965d9311185cfac8c3220",
  MON: "0x810a3b22c91002155d305c4ce032978e3a97f8c4",
  QRT: "0xbca260191a7a39512de6488c7ee5ad8dff8a766b"
};

// Add this export to map from your TOKENS object
export const TOKEN_ADDRESSES = TOKENS;

// Aave tokens 
export const AAVE_TOKENS = {
  DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
  LINK: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5",
  USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  WETH: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
  USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0"
};

// DEX router addresses
export const DEX_ROUTERS = {
  UNISWAP_V2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  SUSHI_V2: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  UNISWAP_V3_QUOTER: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  UNISWAP_V3_FACTORY: "0x1F98431c8aD98523631AE4a59f267346ea31F984"
};

// Factory addresses
export const FACTORIES = {
  UNISWAP_V2: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  SUSHI_V2: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"
};

// Pool addresses
export const POOLS = {
  // Uniswap V3 pools
  UNIV3_METH_WETH: "0x84f491dd1e1bb2b251bea2cab9ac6849e94bfbc5",
  UNIV3_YU_YBTC: "0xc0b6f0c5d4c33c59b4672000d490992b7097ba40",
  UNIV3_USDC_WETH: "0x3289680dd4d6c10bb19b899729cda5eef58aeff1",
  UNIV3_MON_WETH: "0xfac1138c5a426d26a6e350868eee6501788f1417",
  UNIV3_UNI_WETH: "0x287b0e934ed0439e2a7b1d5f0fc25ea2c24b64f7",
  UNIV3_USDT_WETH: "0x58d850667c47981a1b6e7ca0b8dc2eb937cd4119",
  UNIV3_USDC_UNI: "0x294a263412d5be965b45bd93121ca58813f68b07",
  UNIV3_LINK_WETH: "0xa470a353577901aa8cdcb828bb616ef41d58b88a",
  UNIV3_QRT_WETH: "0xf474cca17c97b7662724293edd19cfe4cdd32fab",
  UNIV3_YU_WETH: "0xfb01246458819bac2014eff039772ae6c4095817",

  // Uniswap V2 pools
  UNIV2_DAI_WETH: "0x2fb2d3eb1f38621b6b04ab10d82481acd6386d6f",
  UNIV2_COW_WETH: "0x7f12d41b598025f1ed99bc7c0d1255a319342855",
  UNIV2_USDC_WETH: "0x92b8274aba7ab667bee7eb776ec1de32438d90bf",
  UNIV2_USDT_WETH: "0x2bff913fc4c78969bbe0ecd368e893ff23c2ed3c"
};

// Fee tiers for Uniswap V3
export const FEE_TIERS = {
  LOWEST: 100,  // 0.01%
  LOW: 500,     // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000   // 1%
};

// Deployed contracts
export const DEPLOYED_CONTRACTS = {
  ARBITRAGE_LOGIC: "0x9CC3218027ce4D857b4CA1dc0cF1264fe86bcf69",
  FLASH_LOAN: "0x4b24824129C84b967dd27D80C7DF5e5846d85e05"
};

// Aave related addresses
export const AAVE = {
  POOL_ADDRESS: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  POOL_PROVIDER: "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A",
  DATA_PROVIDER: "0x3e9708d80f7B3e43118013075F7e95CE3AB31F31"
};

// Tokens with confirmed Aave liquidity on Sepolia
export const TOKENS_WITH_AAVE_LIQUIDITY = ["DAI", "USDC", "WETH"];

// Define ABIs
export const ABIS = {
  routerV2: [
    "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory)"
  ],
  quoterV3: [
    "function quoteExactInputSingle(address tokenIn, uint256 amountIn, address tokenOut, uint24 fee, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
  ],
  pair: [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
  ],
  factoryV3: [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
  ],
  poolV3: [
    "function fee() external view returns (uint24)"
  ],
  flashLoan: [
    "function executeFlashLoan(address asset, uint256 amount) external"
  ],
  erc20: [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)", 
    "function approve(address spender, uint256 amount) returns (bool)"
  ],
  arbitrageLogic: [
    "function executeDirectArbitrage(address token, uint256 amount)"
  ],
  aavePool: [
    "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id)",
    "function getReservesList() view returns (address[])",
    "function getReserveNormalizedIncome(address asset) view returns (uint256)"
  ]
};