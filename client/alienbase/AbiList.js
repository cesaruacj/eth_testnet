// client/alienbase/AbiList.js

// ABI mínima para tokens ERC20 (para obtener decimales, símbolo, etc.)
const erc20ABI = [
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// ABI del Factory de AlienBase: normalmente incluye una función para obtener la dirección de un pool dado dos tokens.
const factoryABI = [
  "function getPool(address tokenA, address tokenB) external view returns (address pool)"
];

// ABI del Router de AlienBase: incluye funciones para ejecutar swaps, por ejemplo, swapExactTokensForTokens.
// Revisa la documentación para ver si la función se llama exactamente así.
const routerABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];

module.exports = {
  erc20ABI,
  factoryABI,
  routerABI
};
