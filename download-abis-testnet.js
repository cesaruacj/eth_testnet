require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Asegúrate de tener una API Key de BaseScan
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
if (!BASESCAN_API_KEY) {
  console.error('❌ Error: BASESCAN_API_KEY no está definida. Verifica tu archivo .env.');
  process.exit(1);
}

const BASESCAN_API = 'https://api-sepolia.basescan.org/api';

// Actualizar DEX_CONTRACTS para incluir también Factory
const DEX_CONTRACTS = {
  UniswapV3: {
    Router: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
    Quoter: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
    Factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24'
  },
  UniswapV4: {  
    Router: '0x492e6456d9528771018deb9e87ef7750ef184104',
    Quoter: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
    Factory: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408'
  }
};

// Cambiar esto:
const ABI_DIR = path.join(__dirname, 'external', 'abis', 'testnet');

/**
 * Descarga el ABI para un contrato desde BaseScan API
 */
async function fetchAbi(address) {
  try {
    const response = await axios.get(BASESCAN_API, {
      params: {
        module: 'contract',
        action: 'getabi',
        address: address,
        apikey: BASESCAN_API_KEY
      }
    });

    if (response.data.status !== '1' || response.data.message !== 'OK') {
      throw new Error(`Error al obtener ABI: ${response.data.message || 'Respuesta inválida'}`);
    }

    return JSON.parse(response.data.result);
  } catch (error) {
    console.error(`❌ Error fetchAbi(${address}):`, error.message);
    // En caso de error, devolver un ABI mínimo
    return [
      "function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory amounts)",
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
    ];
  }
}

/**
 * Guarda el ABI en un archivo JSON
 */
function saveAbi(dexName, contractType, abi) {
  // Crear directorio para el DEX
  const dexDir = path.join(ABI_DIR, dexName);
  if (!fs.existsSync(dexDir)) {
    fs.mkdirSync(dexDir, { recursive: true });
  }

  // Guardar ABI como JSON
  const filename = path.join(dexDir, `${contractType.toLowerCase()}.json`);
  fs.writeFileSync(filename, JSON.stringify(abi, null, 2));
  console.log(`✅ ABI guardado: ${filename}`);
}

/**
 * Proceso principal para descargar y guardar ABIs
 */
async function main() {
  console.log('Descargando ABIs para Base Sepolia...');
  
  // Recorrer todos los DEXes y contratos
  for (const [dexName, contracts] of Object.entries(DEX_CONTRACTS)) {
    console.log(`\n📥 Procesando ${dexName}...`);
    
    for (const [contractType, address] of Object.entries(contracts)) {
      try {
        console.log(`- Descargando ABI para ${contractType} (${address})...`);
        const abi = await fetchAbi(address);
        saveAbi(dexName, contractType, abi);
      } catch (error) {
        console.error(`❌ Error al procesar ${dexName} ${contractType}:`, error.message);
      }
    }
  }
  
  console.log('\n✨ Descarga de ABIs completada!');
}

// Y luego actualizar la función downloadABI para usar correctamente la estructura de directorios:
async function downloadABI(contractAddress, dexName, contractType) {
  try {
    // ... código existente para la descarga ...
    
    // Crear directorio para el DEX específico dentro de testnet
    const dexDir = path.join(ABI_DIR, dexName);
    if (!fs.existsSync(dexDir)) {
      fs.mkdirSync(dexDir, { recursive: true });
    }
    
    // Guardar ABI en la ruta correcta
    const filePath = path.join(dexDir, `${contractType.toLowerCase()}.json`);
    fs.writeFileSync(filePath, abi);
    
    console.log(`✅ ABI guardado en: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error en la petición: ${error.message}`);
    return false;
  }
}

// Ejecutar el proceso
main().catch(error => {
  console.error('❌ Error en el proceso principal:', error);
  process.exit(1);
});