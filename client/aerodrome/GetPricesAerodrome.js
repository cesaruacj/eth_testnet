// basels/client/aerodrome/GetPricesAerodrome.js

const { ethers } = require("ethers");
const { addressRouter, addressFactory, addressPriceOracle } = require("./AddressList");
const { routerABI, factoryABI, oracleABI } = require("./AbiList");

// Usa un proveedor para conectarte a Base Chain; asegúrate de reemplazar YOUR_API_KEY por tu clave.
const provider = new ethers.providers.JsonRpcProvider("https://base-mainnet.g.alchemy.com/v2/WtCCG_ntdXg_-l_oeA8VzgPxfvBbJC7F");

// Instancia del contrato Factory para obtener pools
const factoryContract = new ethers.Contract(addressFactory, factoryABI, provider);

// Instancia del contrato Router para ejecutar swaps
const routerContract = new ethers.Contract(addressRouter, routerABI, provider);

// Instancia del contrato Price Oracle (opcional)
const oracleContract = new ethers.Contract(addressPriceOracle, oracleABI, provider);

// Ejemplo: obtener la dirección del pool de dos tokens
async function getPoolAddress(tokenA, tokenB) {
  try {
    const poolAddress = await factoryContract.getPool(tokenA, tokenB);
    console.log("Pool address:", poolAddress);
    return poolAddress;
  } catch (error) {
    console.error("Error al obtener el pool:", error);
  }
}

// Ejemplo: obtener el precio desde el Oracle
async function getPriceFromOracle() {
  try {
    const price = await oracleContract.latestAnswer();
    console.log("Latest price:", price.toString());
    return price;
  } catch (error) {
    console.error("Error al obtener el precio:", error);
  }
}

// Función principal para probar las conexiones
async function main() {
  // Ejemplo de tokens; reemplaza estos valores por direcciones reales en Base Chain
  const tokenA = "0xTokenAddressA"; // Por ejemplo, WETH
  const tokenB = "0xTokenAddressB"; // Otro token
  
  await getPoolAddress(tokenA, tokenB);
  await getPriceFromOracle();
}

main().catch(console.error);
