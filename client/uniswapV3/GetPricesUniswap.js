// https://docs.uniswap.org/protocol/reference/deployments
// https://docs.uniswap.org/sdk/guides/creating-a-trade

const { ethers } = require("ethers");

const {
  abi: QuoterABI,
} = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json");

const provider = new ethers.providers.JsonRpcProvider(
  "https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F"
);

async function getPrice(addressFrom, addressTo, amountInHuman) {
  const quoterAddress = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

  const quoterContract = new ethers.Contract(
    quoterAddress,
    QuoterABI,
    provider
  );

  // USDC tiene 6 decimales.
  const amountIn = ethers.utils.parseUnits(amountInHuman, 6);

  /* 
    **IMPORTANTE**: El Quoter V2 retorna un tuple:
      [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
    Se extrae el primer elemento (amountOut) que representa la cantidad de salida.
  */
  const quoteAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    addressFrom,
    addressTo,
    3000,
    amountIn.toString(),
    0
  );

  // Output the amount
  const amountOut = quote[0];

  return ethers.utils.formatUnits(amountOut, 18);
}

const main = async () => {
  const addressFrom = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC
  const addressTo = "0x4200000000000000000000000000000000000006"; // WETH en bsc
  const amountInHuman = "2803";

  const amountOut = await getPrice(addressFrom, addressTo, amountInHuman);
  console.log(amountOut);
};

main();
