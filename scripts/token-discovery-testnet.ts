import { ethers } from "hardhat";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para descubrir automáticamente tokens y pares en DEXes de Base Sepolia
 */
async function main() {
  console.log("Iniciando descubrimiento de tokens y pares en Base Sepolia...");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Utilizando address: ${deployer.address}`);
  
  // Cargar contratos de factory de cada DEX en Base Sepolia
  const factories = {
    // Factory addresses para Base Sepolia
    UniswapV3: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // Updated address
    UniswapV4: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408", // Added address
    PancakeSwap: "0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E"  // Existing address
  };
  
  const factoryAbi = [
    "function allPairsLength() external view returns (uint)",
    "function allPairs(uint) external view returns (address)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
  ];
  
  // Tokens comunes en Base Sepolia para referencia
  const commonTokens = {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    DAI: "0x693ac4be0a2cad9aa38a8cc1d9fc0b9d8c54111f"
  };
  
  // Descubrir pares para cada factory
  const allDiscoveredPairs = [];
  
  for (const [factoryName, factoryAddress] of Object.entries(factories)) {
    try {
      console.log(`\nConsultando factory ${factoryName} en ${factoryAddress}...`);
      const factory = new ethers.Contract(factoryAddress, factoryAbi, deployer);
      
      // Obtener cantidad de pares
      let pairCount;
      try {
        pairCount = await factory.allPairsLength();
        console.log(`Encontrados ${pairCount} pares en ${factoryName}`);
      } catch (error) {
        console.log(`Error al obtener cantidad de pares: ${error.message}`);
        console.log("Intentando con consultas directas para tokens conocidos...");
        
        // Si allPairsLength falla, intentamos consultar pares específicos
        for (const [symbol1, address1] of Object.entries(commonTokens)) {
          for (const [symbol2, address2] of Object.entries(commonTokens)) {
            if (symbol1 !== symbol2) {
              try {
                const pairAddress = await factory.getPair(address1, address2);
                if (pairAddress && pairAddress !== ethers.constants.AddressZero) {
                  console.log(`Par encontrado para ${symbol1}-${symbol2}: ${pairAddress}`);
                  
                  // Aquí procesaríamos el par como en el bucle principal
                  // Por simplicidad, omitimos el código duplicado
                }
              } catch (e) {
                // Ignoramos errores en pares específicos
              }
            }
          }
        }
        
        // Pasamos al siguiente factory
        continue;
      }
      
      // Procesar pares (limitemos a 30 por factory en testnet)
      const pairsToProcess = Math.min(30, pairCount.toNumber());
      
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
          
          // En testnet aceptamos cualquier liquidez
          if (reserves[0].gt(0) && reserves[1].gt(0)) {
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
  const outputPath = path.join(dataDir, `pairs-testnet.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allDiscoveredPairs, null, 2));
  
  console.log(`\nDescubrimiento completado. Guardados ${allDiscoveredPairs.length} pares en ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });