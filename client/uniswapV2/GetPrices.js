const ethers = require("ethers");

const {
  addressFactory,
  addressRouter,
  addressFrom,
  addressTo,
} = require("./AddressList");

const { erc20ABI, factoryABI, pairABI, routerABI } = require("./AbiList");

// Actualización: Se cambia el proveedor para conectar con BaseChain en lugar de Ethereum mainnet.
const provider = new ethers.providers.JsonRpcProvider(
  "https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F"
);

// Conectar al Factory de Uniswap V2 en Base
const contractFactory = new ethers.Contract(
  addressFactory,
  factoryABI,
  provider
);

// Conectar al Router de Uniswap V2 en Base
const contractRouter = new ethers.Contract(addressRouter, routerABI, provider);

// Función para consultar precios utilizando getAmountsOut del Router V2.
const getPrices = async (amountInHuman) => {
  // Convertir el monto de entrada usando los decimales del token "from"
  const contractToken = new ethers.Contract(addressFrom, erc20ABI, provider);
  const decimals = await contractToken.decimals();
  const amountIn = ethers.utils.parseUnits(amountInHuman, decimals).toString();

  // Obtener los montos de salida para la ruta [addressFrom, addressTo]
  const amountsOut = await contractRouter.getAmountsOut(amountIn, [
    addressFrom,
    addressTo,
  ]);

  // Convertir la salida a formato legible utilizando los decimales del token "to"
  const contractToken2 = new ethers.Contract(addressTo, erc20ABI, provider);
  const decimals2 = await contractToken2.decimals();
  const amountOutHuman = ethers.utils.formatUnits(amountsOut[1].toString(), decimals2);

  console.log("Precio de salida:", amountOutHuman);
};

const amountInHuman = "1";
getPrices(amountInHuman);
