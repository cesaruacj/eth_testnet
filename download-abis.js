require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Verificar que las variables de entorno se cargaron correctamente
console.log(`API_KEY: ${process.env.API_KEY}`);
console.log(`ETHSCAN_NETWORK: ${process.env.ETHSCAN_NETWORK}`);

// Asegúrate de tener una API Key de Ethscan
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('❌ Error: API_KEY no está definida. Verifica tu archivo .env.');
  process.exit(1);
}

const network = process.env.ETHSCAN_NETWORK || "sepolia"; 
const ETHERSCAN_API = network === "sepolia" ? 'https://api-sepolia.etherscan.io/api' : 'https://api.etherscan.io/api';

// Detalles de los DEXes y sus contratos
const DEX_CONTRACTS = {
  SushiSwapV2: {
    Router: '0xeaBcE3E74EF41FB40024a21Cc2ee2F5dDc615791',
    Factory: '0x734583f62Bb6ACe3c9bA9bd5A53143CA2Ce8C55A'
  },
  UniswapV3: {
    Router: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    Quoter: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3'
  },
  UniswapV4: {
    Router: '0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b',
    Factory: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
    Quoter: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227'
  },
  BalancerV2: {
    Router: '0x5e315f96389C1aaF9324D97d3512ae1e0Bf3C21a',
    Factory: '0x7532d5a3bE916e4a4D900240F49F0BABd4FD855C'
  },
};

// Crear directorio para ABIs
const ABI_DIR = path.join(__dirname, 'external', 'abis', network);
if (!fs.existsSync(ABI_DIR)) {
  fs.mkdirSync(ABI_DIR, { recursive: true });
}

// Función para descargar ABI
async function downloadABI(contractAddress, dexName, contractType) {
  try {
    console.log(`Descargando ABI para ${dexName} ${contractType}...`);
    
    const url = `${ETHERSCAN_API}?module=contract&action=getabi&address=${contractAddress}&apikey=${API_KEY}`;
    console.log(`URL: ${url}`);
    
    const response = await axios.get(url);
    console.log(`Response: ${JSON.stringify(response.data)}`);
    
    if (response.data.status === '1') {
      // Crear directorio para el DEX si no existe
      const dexDir = path.join(ABI_DIR, dexName);
      if (!fs.existsSync(dexDir)) {
        fs.mkdirSync(dexDir, { recursive: true });
      }
      
      // Guardar ABI como JSON
      const abiPath = path.join(dexDir, `${contractType.toLowerCase()}.json`);
      fs.writeFileSync(abiPath, response.data.result);
      
      console.log(`✅ ABI guardada en ${abiPath}`);
      return true;
    } else {
      console.error(`❌ Error descargando ABI: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error en la petición: ${error.message}`);
    return false;
  }
}

// Función para agregar un retraso
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Descargar todas las ABIs con un retraso entre cada solicitud
async function downloadAllABIs() {
  console.log('Iniciando descarga de ABIs...');
  
  for (const [dexName, contracts] of Object.entries(DEX_CONTRACTS)) {
    for (const [contractType, address] of Object.entries(contracts)) {
      await downloadABI(address, dexName, contractType);
      await delay(500); // Aumenté el retraso a 500ms para evitar rate limits
    }
  }
  
  console.log('Proceso completado.');
}

// Ejecutar la descarga
downloadAllABIs();