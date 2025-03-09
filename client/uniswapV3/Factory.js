const { ethers } = require("ethers");

const provider = new ethers.providers.JsonRpcProvider(
  "https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F"
);

const addressFactory = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";

const abi = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

const contractFactory = new ethers.Contract(addressFactory, abi, provider);

const addressWETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const addressUSDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const getPool = async () => {
  const addressPool = await contractFactory.getPool(
    addressWETH,
    addressUSDC,
    3000 // el valor "3000" es el fee tier (0.3%)
  );
  console.log(addressPool);
};

getPool();
