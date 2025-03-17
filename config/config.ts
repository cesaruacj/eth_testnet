import path from "path";
import fs from "fs";

// Helper para cargar archivos JSON desde el directorio client/<dex>
function loadABI(folder: string, filename: string): any {
  const filePath = path.join(__dirname, '..', 'client', folder, filename);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export const config = {
  aerodrome: {
    router: {
      address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
      abi: loadABI("aerodrome", "router.json")
    },
    factory: {
      address: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
      abi: loadABI("aerodrome", "factory.json")
    },
    priceOracle: {
      address: "0xee717411f6E44F9feE011835C8E6FAaC5dEfF166"
    }
  },
  alienbase: {
    router: {
      address: "0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7",
      abi: loadABI("alienbase", "router.json")
    },
    factory: {
      address: "0x3e84d913803b02a4a7f027165e8ca42c14c0fde7",
      abi: loadABI("alienbase", "factory.json")
    }
  },
  sushiv3: {
    router: {
      address: "0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55",
      abi: loadABI("sushiv3", "router.json")
    },
    factory: {
      address: "0x80C7DD17B01855a6D2347444a0FCC36136a314de",
      abi: loadABI("sushiv3", "factory.json")
    }
  },
  swapbased: {
    router: {
      address: "0xaaa3b1F1bd7BCc97fD1917c18ADE665C5D31F066",
      abi: loadABI("swapbased", "router.json")
    },
    factory: {
      address: "0x04C9f118d21e8B767D2e50C946f0cC9F6C367300",
      abi: loadABI("swapbased", "factory.json")
    }
  },
  uniswapv2: {
    router: {
      address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      abi: loadABI("uniswapv2", "router.json")
    },
    factory: {
      address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      abi: loadABI("uniswapv2", "factory.json")
    }
  },
  uniswapv3: {
    router: {
      address: "0x2626664c2603336E57B271c5C0b26F421741e481",
      abi: loadABI("uniswapv3", "router.json")
    },
    factory: {
      address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      abi: loadABI("uniswapv3", "factory.json")
    }
  },
  aave: {
    poolAddressesProvider: {
      address: process.env.AAVE_POOL_ADDRESSES_PROVIDER || "",
      abi: loadABI("aave", "poolAddressesProvider.json")
    },
    pool: {
      address: "0x...AavePoolAddress...", // Verifica la dirección en BaseChain para Aave V3
      abi: loadABI("aave", "pool.json")
    }
  }
};