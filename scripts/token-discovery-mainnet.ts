import { ethers } from "hardhat";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para descubrir automáticamente tokens y pares en DEXes de Base Mainnet
 */
async function main() {
  console.log("Iniciando descubrimiento de tokens y pares en Base Mainnet...");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Utilizando address: ${deployer.address}`);
  
  // Cargar contratos de factory de cada DEX en Base Mainnet
  const factories = {
    // Factory addresses para Base Mainnet
    AerodromeSS: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
    Aerodrome: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    Alienbase: "0x0Fd83557b2be93617c9C1C1B6fd549401C74558C",
    BaseSwap: "0x38015D05f4fEC8AFe15D7cc0386a126574e8077B",
    SwapBased: "0xb5620F90e803C7F957A9EF351B8DB3C746021BEa",
    UniswapV2: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    UniswapV3: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    UniswapV4: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    PancakeSwap: "0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E",
    SushiSwapV2: "0x71524B4f93c58fcbF659783284E38825f0622859"
  };
  
  const factoryAbi = [
    "function allPairsLength() external view returns (uint)",
    "function allPairs(uint) external view returns (address)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
  ];
  
  // Descubrir pares para cada factory
  const allDiscoveredPairs = [];
  
  for (const [factoryName, factoryAddress] of Object.entries(factories)) {
    try {
      console.log(`\nConsultando factory ${factoryName} en ${factoryAddress}...`);
      const factory = new ethers.Contract(factoryAddress, factoryAbi, deployer);
      
      // Obtener cantidad de pares
      const pairCount = await factory.allPairsLength();
      console.log(`Encontrados ${pairCount} pares en ${factoryName}`);
      
      // Procesar pares (limitemos a 50 por factory)
      const pairsToProcess = Math.min(50, pairCount.toNumber());
      
      // ABI mínimo para interactuar con un par
      const pairAbi = [
        "function token0() external view returns (address)",
        "function token1() external view returns (address)",
        "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
      ];
      
      // ABI mínimo para interactuar con un token
      const tokenAbi = [
        "function symbol() external view returns (string)",
        "function name() external view returns (string)",
        "function decimals() external view returns (uint8)"
      ];
      
      for (let i = 0; i < pairsToProcess; i++) {
        try {
          const pairAddress = await factory.allPairs(i);
          const pair = new ethers.Contract(pairAddress, pairAbi, deployer);
          
          // Obtener tokens
          const token0Address = await pair.token0();
          const token1Address = await pair.token1();
          
          // Obtener información de tokens
          const token0 = new ethers.Contract(token0Address, tokenAbi, deployer);
          const token1 = new ethers.Contract(token1Address, tokenAbi, deployer);
          
          let token0Symbol, token1Symbol, token0Name, token1Name, token0Decimals, token1Decimals;
          
          try {
            token0Symbol = await token0.symbol();
            token0Name = await token0.name();
            token0Decimals = await token0.decimals();
          } catch (error) {
            console.log(`Error obteniendo detalles para token0 ${token0Address}: ${error.message}`);
            token0Symbol = "UNKNOWN";
            token0Name = "Unknown Token";
            token0Decimals = 18;
          }
          
          try {
            token1Symbol = await token1.symbol();
            token1Name = await token1.name();
            token1Decimals = await token1.decimals();
          } catch (error) {
            console.log(`Error obteniendo detalles para token1 ${token1Address}: ${error.message}`);
            token1Symbol = "UNKNOWN";
            token1Name = "Unknown Token";
            token1Decimals = 18;
          }
          
          // Obtener reservas para ver si hay liquidez
          const reserves = await pair.getReserves();
          
          // Verificar si el par tiene liquidez suficiente (al menos $1000)
          const minReserve = ethers.utils.parseUnits("1000", 0);
          
          if (reserves[0].gt(minReserve) && reserves[1].gt(minReserve)) {
            allDiscoveredPairs.push({
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
            });
            
            console.log(`Par ${i}: ${token0Symbol}-${token1Symbol} (${token0Address.slice(0, 8)}.../${token1Address.slice(0, 8)}...)`);
          }
        } catch (error) {
          console.log(`Error procesando par ${i}: ${error.message}`);
        }
        
        // Pequeña pausa para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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
  const outputPath = path.join(dataDir, `pairs-mainnet.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allDiscoveredPairs, null, 2));
  
  console.log(`\nDescubrimiento completado. Guardados ${allDiscoveredPairs.length} pares en ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });