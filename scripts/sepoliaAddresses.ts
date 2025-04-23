/**
 * Sepolia Testnet Addresses Configuration - VERIFIED ADDRESSES ONLY
 */

//--------------------------------------------
// DEX ROUTER ADDRESSES
// -------------------------------------------
export const DEX_ROUTERS = {
  SUSHI_V2: "0xeabce3e74ef41fb40024a21cc2ee2f5ddc615791",
  UNISWAP_V2: "0xee567fe1712faf6149d80da1e6934e354124cfe3",
  UNISWAP_V3: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  UNISWAP_V3_QUOTER: "0xed1f6473345f45b75f8179591dd5ba1888cf2fb3"
}

// Token Addresses - VERIFIED SEPOLIA ADDRESSES
export const TOKENS = {
  // Uniswap V2 Tokens
  DAI: "0xb4f1737af37711e9a5890d9510c9bb60e170cb0d",
  COW: "0x0625afb445c3b6b7b929342a04a22599fd5dbb59",
  USDC: "0xbe72e441bf55620febc26715db68d3494213d8cb", // V2 USDC
  USDT: "0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0",
  WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", // Original WETH
  
  // Uniswap V3 Tokens
  YU: "0xe0232d625ea3b94698f0a7dff702931b704083c9",
  MON: "0x810a3b22c91002155d305c4ce032978e3a97f8c4",
  UNI: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", 
  YBTC: "0xbbd3edd4d3b519c0d14965d9311185cfac8c3220",
  LINK: "0x779877a7b0d9e8603169ddbd7836e478b4624789",
  QRT: "0xbca260191a7a39512de6488c7ee5ad8dff8a766b",
  
  // Different USDC for V3
  USDC_V3: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  // Alternative WETH (if needed)
  METH: "0x4f7a67464b5976d7547c860109e4432d50afb38e"
}

//----------------------------------------------
// PROTOCOL FACTORY ADDRESSES
// ---------------------------------------------
export const FACTORIES = {
  UNISWAP_V3: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c", // UniswapV3 Sepolia Factory
  UNISWAP_V2: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // UniswapV2 SepoliaFactory
  SUSHISWAP_V2: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"  // SushiSwap Sepolia Factory
}

//--------------------------------------------
// Pool Addresses - VERIFIED SEPOLIA ADDRESSES
//--------------------------------------------
export const POOLS = {
  // Uniswap V3 Pools
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
  
  // Uniswap V2 Pools
  UNIV2_DAI_WETH: "0x2fb2d3eb1f38621b6b04ab10d82481acd6386d6f",
  UNIV2_COW_WETH: "0x7f12d41b598025f1ed99bc7c0d1255a319342855",
  UNIV2_USDC_WETH: "0x92b8274aba7ab667bee7eb776ec1de32438d90bf",
  UNIV2_USDT_WETH: "0x2bff913fc4c78969bbe0ecd368e893ff23c2ed3c"
}

// Fee tiers for Uniswap V3
export const FEE_TIERS = {
  LOWEST: 100,  // 0.01%
  LOW: 500,     // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000   // 1%
}

// Deployed Contracts
export const DEPLOYED_CONTRACTS = {
  // Automatically updated by deploy script
  ARBITRAGE_LOGIC: "0x53662EEB97231f918363010d9Bf919b3fF77AD6d",
  FLASH_LOAN: "0x26b380791899b3f6a11c52E20A9C857d63664C1D"
}

// Add Aave V3 supported tokens
export const AAVE_TOKENS = {
  DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
  LINK: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5",
  WBTC: "0x29f2D40B0605204364af54EC677bD022dA425d03",
  USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  WETH: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
  USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
  AAVE: "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a",
  GHO: "0xc4bF5CbDaBE595361438F8c6a187bDc330539c60"
}

// Aave V3 System Contracts - Separados de los pools DEX
export const AAVE_V3 = {
  // Registro de contratos que permite obtener dinámicamente el Pool y otros componentes
  POOL_ADDRESSES_PROVIDER: "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A",
  // Dirección hardcodeada del Pool (opcional, mejor usar el provider para obtenerla)
  POOL: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"
}