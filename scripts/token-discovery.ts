import { ethers } from "hardhat";
import * as fs from 'fs';
import * as path from 'path';

// Función para cargar ABIs específicas de cada DEX
function loadAbi(dexName: string, contractType: string = 'factory'): any {
  try {
    const abiPath = path.join(__dirname, '..', 'external', 'abis', 'sepolia', dexName, `${contractType.toLowerCase()}.json`);
    if (fs.existsSync(abiPath)) {
      return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    } else {
      console.log(`ABI específica no encontrada para ${dexName}, usando ABI genérica`);
      return null;
    }
  } catch (error) {
    console.log(`Error cargando ABI para ${dexName}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("Iniciando descubrimiento de los 10 pares con mayor liquidez en cada DEX...");
  
  // Crear proveedor directo a Ethereum Sepolia
  const provider = new ethers.providers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY);
  console.log(`Conectado directamente a Ethereum Sepolia en modo de solo lectura`);
  
  // Verificar conexión obteniendo el número de bloque
  const blockNumber = await provider.getBlockNumber();
  console.log(`Conectado al bloque ${blockNumber}`);
  
  // Mantener DEXs específicos de Sepolia
  const factories = {
    UniswapV2: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    SushiSwapV2: "0x734583f62Bb6ACe3c9bA9bd5A53143CA2Ce8C55A",
    UniswapV3: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c"
  };
  
  // ABI genérico en caso de que no se encuentre uno específico
  const genericFactoryAbi = [
    "function allPairsLength() external view returns (uint)",
    "function allPairs(uint) external view returns (address)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
  ];
  
  // ABIs estándar para pares y tokens
  const pairAbi = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
  ];
  
  const tokenAbi = [
    "function symbol() external view returns (string)",
    "function name() external view returns (string)",
    "function decimals() external view returns (uint8)"
  ];
  
  // Descubrir pares para cada factory
  const allDiscoveredPairs = [];
  
  for (const [factoryName, factoryAddress] of Object.entries(factories)) {
    try {
      console.log(`\nConsultando factory ${factoryName} en ${factoryAddress}...`);
      
      // Cargar ABI específica o usar genérica
      const specificAbi = loadAbi(factoryName);
      const factoryAbi = specificAbi || genericFactoryAbi;
      
      console.log(`Usando ${specificAbi ? 'ABI específica' : 'ABI genérica'} para ${factoryName}`);
      const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
      
      // Obtener cantidad de pares
      const pairCount = await factory.allPairsLength();
      console.log(`Encontrados ${pairCount} pares en ${factoryName}`);
      
      // Procesar pares 
      const pairsToProcess = Math.min(20, pairCount.toNumber());
      
      // Almacenar temporalmente los pares por DEX
      const pairsInDex = [];
      
      for (let i = 0; i < pairsToProcess; i++) {
        try {
          const pairAddress = await factory.allPairs(i);
          const pair = new ethers.Contract(pairAddress, pairAbi, provider);
          
          // Obtener tokens
          const token0Address = await pair.token0();
          const token1Address = await pair.token1();
          
          // Obtener información de tokens
          const token0 = new ethers.Contract(token0Address, tokenAbi, provider);
          const token1 = new ethers.Contract(token1Address, tokenAbi, provider);
          
          let token0Symbol, token1Symbol, token0Name, token1Name, token0Decimals, token1Decimals;
          
          try {
            token0Symbol = await token0.symbol();
            token0Name = await token0.name();
            token0Decimals = await token0.decimals();
          } catch (error) {
            token0Symbol = "UNKNOWN";
            token0Name = "Unknown Token";
            token0Decimals = 18;
          }
          
          try {
            token1Symbol = await token1.symbol();
            token1Name = await token1.name();
            token1Decimals = await token1.decimals();
          } catch (error) {
            token1Symbol = "UNKNOWN";
            token1Name = "Unknown Token";
            token1Decimals = 18;
          }
          
          // Obtener reservas
          const reserves = await pair.getReserves();
          
          // Calcular una puntuación simple de liquidez (suma de ambas reservas)
          const liquidityScore = reserves[0].add(reserves[1]);
          
          // Guardar el par con su puntuación
          pairsInDex.push({
            score: liquidityScore,
            data: {
              factory: factoryName,
              pairAddress,
              token0: {
                address: token0Address,
                symbol: token0Symbol,
                name: token0Name,
                decimals: token0Decimals
              },
              token1: {
                address: token1Address,
                symbol: token1Symbol,
                name: token1Name,
                decimals: token1Decimals
              },
              reserves: [reserves[0].toString(), reserves[1].toString()]
            }
          });
          
          console.log(`Par ${i}: ${token0Symbol}-${token1Symbol} - Liquidez: ${liquidityScore.toString()}`);
        } catch (error) {
          console.log(`Error procesando par ${i}: ${error.message}`);
        }
        
        // Pausa para ser amigables con el RPC
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Ordenar pares por liquidez (mayor a menor)
      pairsInDex.sort((a, b) => {
        return b.score.gt(a.score) ? 1 : -1;
      });
      
      // Tomar los 10 primeros
      const top10Pairs = pairsInDex.slice(0, 10);
      
      // Agregar solo la data (sin el score) al resultado final
      top10Pairs.forEach(pair => allDiscoveredPairs.push(pair.data));
      
      console.log(`Agregados los 10 pares con mayor liquidez de ${factoryName}`);
      
    } catch (error) {
      console.error(`Error al consultar factory ${factoryName}: ${error.message}`);
    }
  }
  
  // Crear directorio data si no existe
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Guardar resultados
  const outputPath = path.join(dataDir, `top-pairs-sepolia.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allDiscoveredPairs, null, 2));
  
  console.log(`\nDescubrimiento completado. Guardados ${allDiscoveredPairs.length} pares en ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });