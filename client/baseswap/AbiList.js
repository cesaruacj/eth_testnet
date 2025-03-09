// client/baseswap/AbiList.js

const erc20ABI = [
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)"
  ];
  
  // ABI del Factory: se usa para obtener la dirección del pool de un par de tokens.
  const factoryABI = [
    "function getPair(address tokenA, address tokenB) external view returns (address pool)"
  ];
  
  // ABI del Router: para ejecutar swaps y consultar precios.
  const routerABI = [
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)"
  ];
  
  module.exports = {
    erc20ABI,
    factoryABI,
    routerABI
  };
  