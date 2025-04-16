/**
 * Configuration settings for the arbitrage bot
 */

// Test amounts used for price checks
export const TOKEN_AMOUNTS = {
  USDC: "1000",   // 1000 USDC
  WETH: "1",      // 1 WETH
  YBTC: "0.05",   // 0.05 YBTC
  METH: "1",      // 1 METH
  UNI: "10",      // 10 UNI
  LINK: "5",      // 5 LINK
  DAI: "1000",    // 1000 DAI
  USDT: "1000",   // 1000 USDT
  YU: "100",      // 100 YU
  QRT: "100",     // 100 QRT
  MON: "10",      // 10 MON
  COW: "100"      // 100 COW
};

// Token decimal places
export const TOKEN_DECIMALS = {
  USDC: 6,
  USDC_V3: 6,
  WETH: 18,
  DAI: 18,
  USDT: 6,
  UNI: 18,
  LINK: 18,
  YBTC: 8,
  MON: 18,
  YU: 18,
  QRT: 18,
  COW: 18
};

// Arbitrage execution settings
export const ARBITRAGE_SETTINGS = {
  MIN_PROFIT_PERCENT: 0.1,       // Minimum profit percentage to execute arbitrage
  MAX_SLIPPAGE_PERCENT: 5,       // Maximum allowed slippage
  IS_EXECUTION_ENABLED: true,    // Set to false to monitor only
  MAX_CONSECUTIVE_FAILURES: 5,   // Pause execution after this many failures
  DESTINATION_WALLET: "0x5E2b76CFFD530e837b8316910A651058FC1496CA" // Where to send profits
};

// Gas optimization settings
export const GAS_SETTINGS = {
  DEFAULT_MULTIPLIER: 1.1,      // Default: 10% extra
  FAST_MULTIPLIER: 1.2,         // Fast: 20% extra
  FASTEST_MULTIPLIER: 1.5,      // Fastest: 50% extra
  DEFAULT_GAS_LIMIT: 4000000    // Default gas limit
};

// DEX configuration
export const DEX_SETTINGS = {
  // Maps human-readable names to DEX identifiers in the price results
  DEX_NAME_MAP: {
    "Uniswap V2": "uniV2",
    "SushiSwap V2": "sushi",
    "Uniswap V3 (0.01%)": "uniV3_100",
    "Uniswap V3 (0.05%)": "uniV3_500",
    "Uniswap V3 (0.3%)": "uniV3_3000",
    "Uniswap V3 (1%)": "uniV3_10000"
  },
  
  // Maps DEX identifiers to human-readable names
  DEX_DISPLAY_NAMES: {
    "uniV2": "Uniswap V2",
    "sushi": "SushiSwap V2",
    "uniV3_100": "Uniswap V3 (0.01%)",
    "uniV3_500": "Uniswap V3 (0.05%)",
    "uniV3_3000": "Uniswap V3 (0.3%)",
    "uniV3_10000": "Uniswap V3 (1%)"
  }
};