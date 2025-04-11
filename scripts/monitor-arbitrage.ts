import { ethers } from "hardhat";

// Configuración de tokens y routers en Sepolia
const TOKENS = {
  UNI:  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",  // UNI Sepolia (18 dec)
  YU:   "0xe0232d625ea3b94698f0a7dff702931b704083c9",  // YU stable Sepolia (6 dec)
  MON:  "0x810a3b22c91002155d305c4ce032978e3a97f8c4",  // MON Sepolia (18 dec)
  YBTC: "0xbbd3edd4d3b519c0d14965d9311185cfac8c3220",  // YBTC Sepolia (8 dec)
  WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14"   // WETH Sepolia (18 dec)
};
const DEX_ROUTERS = {
  SushiSwapV2: "0xeaBcE3E74EF41FB40024a21Cc2ee2F5dDc615791", // SushiSwap V2 (Uniswap V2-style) Sepolia
  UniswapV3:   "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", // Uniswap V3 (se usa el Quoter) Sepolia
  UniswapV4:   "0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b", // Uniswap V4 (Universal Router) Sepolia
  BalancerV2:  "0x5e315f96389C1aaF9324D97d3512ae1e0Bf3C21a"  // Balancer V2 Vault Sepolia
};

// Definición de pares a monitorear (tokenA, tokenB, monto y decimales)
const PAIRS_TO_MONITOR = [
  { tokenA: TOKENS.UNI,  tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 18 },
  { tokenA: TOKENS.YU,   tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 6),  decimalsA: 6,  decimalsB: 18 },
  { tokenA: TOKENS.UNI,  tokenB: TOKENS.YU,   amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 6  },
  { tokenA: TOKENS.UNI,  tokenB: TOKENS.MON,  amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 18 },
  { tokenA: TOKENS.MON,  tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 18 },
  { tokenA: TOKENS.MON,  tokenB: TOKENS.YBTC, amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 8  },
  { tokenA: TOKENS.YBTC, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 8),  decimalsA: 8,  decimalsB: 18 },
  { tokenA: TOKENS.WETH, tokenB: TOKENS.YBTC, amountIn: ethers.utils.parseUnits("1000", 18), decimalsA: 18, decimalsB: 8  }
];

// Función auxiliar: carga el ABI desde la carpeta
function loadAbi(dexName: string, contractType: string = 'router'): any {
  try {
    const abiPath = `../external/abis/sepolia/${dexName}/${contractType}.json`;
    return require(abiPath);
  } catch {
    throw new Error(`ABI no encontrada para ${dexName} ${contractType}`);
  }
}

// Función para obtener el precio de tokenA -> tokenB en cada DEX
async function getTokenPrice(dexName: string, routerContract: ethers.Contract, pair: any): Promise<ethers.BigNumber | null> {
  try {
    // Caso Uniswap V3: usar el contrato Quoter especial
    if (dexName === 'UniswapV3') {
      const quoterAddress = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3"; // Quoter de Uniswap V3 en Sepolia
      const quoterAbi = loadAbi("UniswapV3", "quoter");
      const quoter = new ethers.Contract(quoterAddress, quoterAbi, routerContract.provider);
      return await quoter.callStatic.quoteExactInputSingle(pair.tokenA, pair.tokenB, 3000, pair.amountIn, 0);
    }
    // Caso Uniswap V4: usar contrato Quoter de V4
    if (dexName === 'UniswapV4') {
      const quoterAddress = "0x61b3f2011a92d183c7dbadbda940a7555ccf9227"; // Quoter de Uniswap V4 en Sepolia
      const quoterAbi = loadAbi("UniswapV4", "quoter");
      const quoter = new ethers.Contract(quoterAddress, quoterAbi, routerContract.provider);
      const path = ethers.utils.solidityPack(['address', 'uint24', 'address'], [pair.tokenA, 3000, pair.tokenB]);
      return await quoter.callStatic.quoteExactInput(path, pair.amountIn);
    }
    // Otros DEX (SushiSwap V2, Balancer, etc.): utilizar la función getAmountsOut si existe
    if (routerContract.interface.functions['getAmountsOut(uint256,address[])']) {
      const path = [pair.tokenA, pair.tokenB];
      const amounts = await routerContract.getAmountsOut(pair.amountIn, path);
      return amounts?.[1] || null;
    }
    // Si no se encuentra, retorna null
    return null;
  } catch (error: any) {
    console.log(`${dexName}: Error obteniendo precio -> ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("=== Monitoreo de arbitraje en Ethereum Sepolia (modo solo lectura) ===");
  const provider = new ethers.providers.JsonRpcProvider("<URL_RPC_Sepolia>");

  // Instanciar routers para cada DEX
  const dexRouters: Record<string, ethers.Contract> = {};
  for (const [dexName, routerAddr] of Object.entries(DEX_ROUTERS)) {
    try {
      const abi = loadAbi(dexName);
      dexRouters[dexName] = new ethers.Contract(routerAddr, abi, provider);
      console.log(`✅ Router ${dexName} cargado`);
    } catch (err) {
      console.error(`❌ No se pudo cargar ABI para ${dexName}:`, err);
    }
  }

  console.log(`Monitoreando ${PAIRS_TO_MONITOR.length} pares de tokens...`);

  // Bucle de monitoreo continuo (solo lectura)
  while (true) {
    for (const pair of PAIRS_TO_MONITOR) {
      // Convertir direcciones a símbolos si es posible
      const symA = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenA)?.[0] || pair.tokenA;
      const symB = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenB)?.[0] || pair.tokenB;
      console.log(`\n----- Verificando par ${symA}/${symB} -----`);

      let bestPrice: ethers.BigNumber | null = null;
      let worstPrice: ethers.BigNumber | null = null;
      let bestDex = "", worstDex = "";
      // Consultar precios en todos los DEX
      for (const [dexName, router] of Object.entries(dexRouters)) {
        const amountOut = await getTokenPrice(dexName, router, pair);
        if (!amountOut || amountOut.isZero()) continue;
        const priceNum = parseFloat(ethers.utils.formatUnits(amountOut, pair.decimalsB));
        console.log(`Precio en ${dexName}: ${priceNum}`);
        if (bestPrice === null || amountOut.gt(bestPrice)) {
          bestPrice = amountOut; bestDex = dexName;
        }
        if (worstPrice === null || amountOut.lt(worstPrice)) {
          worstPrice = amountOut; worstDex = dexName;
        }
      }
      if (!bestPrice || !worstPrice || bestDex === worstDex) {
        console.log("No se han encontrado al menos dos fuentes con liquidez para este par.");
        continue;
      }
      // Calcular oportunidad
      const profit = bestPrice.sub(worstPrice);
      const profitVal = parseFloat(ethers.utils.formatUnits(profit, pair.decimalsB));
      if (profitVal > 0) {
        const profitPct = (profitVal / parseFloat(ethers.utils.formatUnits(worstPrice, pair.decimalsB))) * 100;
        console.log(`➡️ Oportunidad detectada: comprar en ${worstDex} y vender en ${bestDex}`);
        console.log(`   Ganancia potencial = ${profitVal.toFixed(4)} ${symB} (${profitPct.toFixed(2)}%)`);
      } else {
        console.log("No hay oportunidad rentable en este ciclo.");
      }
    }
    // Esperar 5 segundos para la siguiente iteración
    await new Promise(res => setTimeout(res, 5000));
  }
}

main().catch(console.error);
