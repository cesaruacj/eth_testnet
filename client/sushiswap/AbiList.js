// client/sushiswap/AbiList.js

// ABI mínima para interactuar con tokens ERC20
const erc20ABI = [
    "function decimals() external view returns (uint8)"
  ];
  
  // ABI del Factory de SushiSwap v3 (función getPool)
  const factoryABI = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
  ];
  
  // ABI del Router de SushiSwap v3 (ejemplo: función swapExactTokensForTokens)
  const routerABI = [
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
  ];
  
  module.exports = { erc20ABI, factoryABI, routerABI };
  