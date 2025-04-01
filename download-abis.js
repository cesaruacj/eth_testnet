require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Verificar que las variables de entorno se cargaron correctamente
console.log(`BASESCAN_API_KEY: ${process.env.BASESCAN_API_KEY}`);
console.log(`BASESCAN_NETWORK: ${process.env.BASESCAN_NETWORK}`);

// Asegúrate de tener una API Key de BaseScan
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
if (!BASESCAN_API_KEY) {
  console.error('❌ Error: BASESCAN_API_KEY no está definida. Verifica tu archivo .env.');
  process.exit(1);
}

const network = process.env.BASESCAN_NETWORK || "mainnet"; 
const BASESCAN_API = network === "sepolia" ? 'https://api-sepolia.basescan.org/api' : 'https://api.basescan.org/api';

// Detalles de los DEXes y sus contratos (ahora con Factories también)
const DEX_CONTRACTS = {
  Aerodrome: {
    Router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    Factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da'
  },
  AerodromeSS: {
    Router: '0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5',
    Factory: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A'
  },
  SwapBased: {
    Router: '0x756C6BbDd915202adac7beBB1c6C89aC0886503f',
    Factory: '0xb5620F90e803C7F957A9EF351B8DB3C746021BEa'
  },
  SushiSwapV2: {
    Router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
    Factory: '0x71524B4f93c58fcbF659783284E38825f0622859'
  },
  BaseSwap: {
    Router: '0x1B8eea9315bE495187D873DA7773a874545D9D48',
    Factory: '0x38015D05f4fEC8AFe15D7cc0386a126574e8077B'
  },
  UniswapV2: {  
    Router: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
    Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'
  },
  UniswapV3: {
    Router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    Quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'
  },
  UniswapV4: {  
    Router: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    Factory: '0x498581ff718922c3f8e6a244956af099b2652b2b'
  },
  PancakeSwap: {
    Router: '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb',
    Factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
  },
  Alienbase: {  
    Router: '0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7',
    Factory: '0x0Fd83557b2be93617c9C1C1B6fd549401C74558C'
  }
};

// Crear directorio para ABIs
const ABI_DIR = path.join(__dirname, 'external', 'abis', 'mainnet');
if (!fs.existsSync(ABI_DIR)) {
  fs.mkdirSync(ABI_DIR, { recursive: true });
}

// Función para descargar ABI
async function downloadABI(contractAddress, dexName, contractType) {
  try {
    console.log(`Descargando ABI para ${dexName} ${contractType}...`);
    
    const url = `${BASESCAN_API}?module=contract&action=getabi&address=${contractAddress}&apikey=${BASESCAN_API_KEY}`;
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