// basels/client/alienbase/AbiList.js

// ABI simplificada del Router de AlienBase (similar a Uniswap V2)
const routerABI = [
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)"
  ];
  
  // ABI simplificada del Factory de AlienBase para consultar pools
  const factoryABI = [
    "function getPool(address tokenA, address tokenB) external view returns (address pool)"
  ];
  
  // Si tienes un Price Oracle propio, puedes definir su ABI también (este es un ejemplo genérico)
  const oracleABI = [
    "function latestAnswer() external view returns (int256)"
  ];
  
  module.exports = {
    routerABI,
    factoryABI,
    oracleABI,
  };
  