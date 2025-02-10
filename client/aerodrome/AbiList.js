// basels/client/aerodrome/AbiList.js

// ABI del Router: define las funciones que usarás, por ejemplo, para ejecutar swaps.
const routerABI = [
    // Ejemplo de función de swap. Reemplaza o amplía según la documentación de Aerodrome.
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
  ];
  
  // ABI del Factory: por ejemplo, para obtener la dirección de un pool dado un par de tokens.
  const factoryABI = [
    "function getPool(address tokenA, address tokenB) external view returns (address pool)"
  ];
  
  // ABI del Price Oracle (si lo usarás para obtener precios on-chain).
  const oracleABI = [
    "function latestAnswer() external view returns (int256)"
  ];
  
  module.exports = {
    routerABI,
    factoryABI,
    oracleABI
  };
  