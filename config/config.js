// basels/config/config.js
const path = require('path');
const fs = require('fs');

// Helper para cargar archivos JSON desde el directorio client/<dex>
function loadABI(folder, filename) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'client', folder, filename), 'utf8'));
}

module.exports = {
  aerodrome: {
    router: {
      address: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      abi: loadABI('aerodrome', 'router.json')
    },
    factory: {
      address: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
      abi: loadABI('aerodrome', 'factory.json')
    },
    priceOracle: {
      address: '0xee717411f6E44F9feE011835C8E6FAaC5dEfF166'
    }
  },
  alienbase: {
    router: {
      address: '0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7',
      abi: loadABI('alienbase', 'router.json')
    },
    factory: {
      address: '0x3e84d913803b02a4a7f027165e8ca42c14c0fde7',
      abi: loadABI('alienbase', 'factory.json')
    }
  },
  sushiv3: {
    router: {
      address: '0x...SushiV3RouterAddress...',
      abi: loadABI('sushiv3', 'router.json')
    }
    // Agrega más si fuera necesario
  },
  swapbased: {
    router: {
      address: '0x...SwapBasedRouterAddress...',
      abi: loadABI('swapbased', 'router.json')
    }
  },
  uniswapv2: {
    router: {
      address: '0x...UniswapV2RouterAddress...',
      abi: loadABI('uniswapv2', 'router.json')
    },
    factory: {
      address: '0x...UniswapV2FactoryAddress...',
      abi: loadABI('uniswapv2', 'factory.json')
    }
  },
  uniswapv3: {
    router: {
      address: '0x...UniswapV3RouterAddress...',
      abi: loadABI('uniswapv3', 'router.json')
    }
    // Puedes agregar factory u otras direcciones si fuera necesario
  },
  aave: {
    poolAddressesProvider: {
      address: process.env.AAVE_POOL_ADDRESSES_PROVIDER,  // Establecido en .env
      abi: loadABI('aave', 'poolAddressesProvider.json')
    },
    pool: {
      address: '0x...AavePoolAddress...',  // Verifica la dirección en BaseChain para Aave V3
      abi: loadABI('aave', 'pool.json')
    }
  }
};
