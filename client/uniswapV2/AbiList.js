// ABI del ERC20 mínimo para obtener decimales
const erc20ABI = ["function decimals() external view returns (uint8)"];

// ABI de la Factory de Uniswap V2 (estándar)
const factoryABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

// ABI del contrato Pair de Uniswap V2 (estándar)
const pairABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)",
];

// ABI del Router de Uniswap V2 (estándar)
const routerABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
];

module.exports = { erc20ABI, factoryABI, pairABI, routerABI };