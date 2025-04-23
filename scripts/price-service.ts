import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Direcciones de Price Feeds de Chainlink en Sepolia
const PRICE_FEEDS = {
  'WETH': '0x694AA1769357215DE4FAC081bf1f309aDC325306', // ETH/USD
  'LINK': '0xc59E3633BAAC79493d908e63626716e204A45EdF', // LINK/USD
  'USDC': '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E', // USDC/USD
  'DAI': '0x14866185B1962B63C3Ea9E03Bc1da838bab34C19',  // DAI/USD
  "LINKETH": "0x42585eD362B3f1BCa95c640FdFf35Ef899212734" // LINK/ETH
};

// ABI para Chainlink price feeds
const AGGREGATOR_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)"
];

/**
 * Obtiene el precio USD actual de un token usando Chainlink
 */
export async function getTokenPriceUSD(symbol: string): Promise<number> {
  console.log(`Consultando precio para ${symbol}...`);
  
  const feedAddress = PRICE_FEEDS[symbol];
  if (!feedAddress) {
    throw new Error(`No price feed available for ${symbol}`);
  }
  
  const [signer] = await ethers.getSigners();
  const priceFeed = new ethers.Contract(feedAddress, AGGREGATOR_ABI, signer);
  
  try {
    const [, answer] = await priceFeed.latestRoundData();
    const decimals = await priceFeed.decimals();
    
    // Chainlink devuelve precios con 8 decimales normalmente
    const price = parseFloat(ethers.utils.formatUnits(answer, decimals));
    
    console.log(`📊 Precio de ${symbol}: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    console.error(`Error obteniendo precio de ${symbol}:`, error);
    throw error;
  }
}

async function analyzeAllPairs(priceResults: Record<string, any>) {
  console.log("\n=================== ANÁLISIS DE ARBITRAJE ===================");
  
  // Usar analyzeArbitragePairs de manera más eficiente
  const tokenPairs = Object.entries(priceResults).map(([pairKey, results]) => {
    const [tokenIn, tokenOut] = pairKey.split('_');
    return {
      results,
      tokenIn,
      tokenOut,
      amount: getDefaultAmount(tokenIn)
    };
  });

  return analyzeArbitragePairs(tokenPairs);
}

async function main() {
  console.log("======== SERVICIO DE PRECIOS CHAINLINK ========");
  
  // Obtener precios de los tokens principales
  const ethPrice = await getTokenPriceUSD('WETH');
  const linkPrice = await getTokenPriceUSD('LINK');
  const usdcPrice = await getTokenPriceUSD('USDC');
  const linkethPrice = await getTokenPriceUSD('LINKETH');
  
  console.log("\n======== RESUMEN DE PRECIOS ========");
  console.log(`ETH: $${ethPrice.toFixed(2)}`);
  console.log(`LINK: $${linkPrice.toFixed(2)}`);
  console.log(`USDC: $${usdcPrice.toFixed(2)}`);
  console.log(`LINKETH: $${linkethPrice.toFixed(2)}`);
  
  // Guardar los precios en un archivo para referencia
  const priceData = {
    timestamp: Date.now(),
    prices: {
      ETH: ethPrice,
      LINK: linkPrice,
      USDC: usdcPrice,
      LINKETH: linkethPrice
    }
  };
  
  const dataPath = path.join(__dirname, "../data/prices.json");
  fs.writeFileSync(dataPath, JSON.stringify(priceData, null, 2));
  console.log(`✅ Precios guardados en ${dataPath}`);
}

// Ejecutar el script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("❌ Error:", error);
    process.exit(1);
  });