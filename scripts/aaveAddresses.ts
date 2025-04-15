// Dirección de los contratos principales de Aave V3 en Sepolia

export const AaveSepoliaAddresses = {
    // PoolAddressesProvider (para obtener el pool real)
    POOL_ADDRESSES_PROVIDER: "0x012b5a383E1c09E2893e6b4bA3B5b936Ad616C9A",
  
    // Pool (puedes obtenerlo dinámicamente desde el provider, o usar directo si prefieres)
    POOL: "0x6ae43d3271ff6888e7fc43fd7321a503ff738951",
  
    // Tokens compatibles (usar solo los que necesites en el arbitraje)
    TOKENS: {
      WETH: "0xC558339A66aBc261fd9B4e47D1d3c2eA9e4299a3",
      USDC: "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8",
      DAI: "0xFF34c7c390C23D4Fb3F1B4CcEdCb80f67E31a357",
      LINK: "0xf8Fb819dADCB88108C73a0a5D018c88A1429EBE5",
      AAVE: "0x885476b2EF35a05f8EF637Ec00AE3D1e59D9AC9a"
    },
  
    // Aave Oracle (opcional, para validar precios justos de activos)
    ORACLE: "0x2da8b3e41eFC4B125Dc8491717D66A93CA8aa663",
  
    // Aave Data Provider (opcional, para inspección de reservas, colaterales, etc.)
    DATA_PROVIDER: "0x3e97c2ed13cb7efefc924098d30ccde3b1911f31"
  };
