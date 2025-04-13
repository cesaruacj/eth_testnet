import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

// ========================================================
// Configuración de tokens en Sepolia (usando direcciones checksummed)
// ========================================================
const TOKENS = {
  YU:   ethers.utils.getAddress("0xe0232d625ea3b94698f0a7dff702931b704083c9"),  // Stablecoin YU (6 decimales)
  YBTC: ethers.utils.getAddress("0xbbd3edd4d3b519c0d14965d9311185cfac8c3220"),  // YBTC (8 decimales)
  WETH: ethers.utils.getAddress("0xfff9976782d46cc05630d1f6ebab18b2324d6b14")   // WETH (18 decimales)
};

// ========================================================
// Configuración de routers (DEX) en Sepolia (checksummed)
// ========================================================
const DEX_ROUTERS = {
  SushiSwapV2: ethers.utils.getAddress("0xeaBcE3E74EF41FB40024a21Cc2ee2F5dDc615791"),
  // Para UniswapV3 no se usa el router en la consulta, pues se utiliza el Quoter; se mantiene la dirección para referencia.
  UniswapV3:   ethers.utils.getAddress("0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD"),
  UniswapV4:   ethers.utils.getAddress("0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b")
};

// ========================================================
// Selección de pares con liquidez comprobada o con alto potencial de liquidez en Sepolia
// Se recomienda usar los pares YBTC/YU, YU/WETH y YBTC/WETH.
// ========================================================
const PAIRS_TO_MONITOR = [
  { tokenA: TOKENS.YBTC, tokenB: TOKENS.YU,   amountIn: ethers.utils.parseUnits("1000", 8),  decimalsA: 8,  decimalsB: 6 },
  { tokenA: TOKENS.YU,   tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 6),  decimalsA: 6,  decimalsB: 18 },
  { tokenA: TOKENS.YBTC, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 8),  decimalsA: 8,  decimalsB: 18 }
];

// ========================================================
// Función auxiliar: carga el ABI desde la carpeta
// Aquí se asume que tienes archivos JSON en ../external/abis/sepolia/<dexName>/router.json
// Si no, se pueden sustituir por ABIs mínimos cuando no se requiera el router (los Quoters se especifican en el código).
// ========================================================
function loadAbi(dexName: string, contractType: string = "router"): any {
  try {
    const abiPath = `../external/abis/sepolia/${dexName}/${contractType}.json`;
    return require(abiPath);
  } catch {
    throw new Error(`ABI no encontrada para ${dexName} ${contractType}`);
  }
}

// ========================================================
// Función para obtener el precio de tokenA -> tokenB en un DEX
// ========================================================
async function getTokenPrice(
  dexName: string,
  routerContract: ethers.Contract,
  pair: any
): Promise<ethers.BigNumber | null> {
  try {
    if (dexName === "UniswapV3") {
      // Usar el Quoter de Uniswap V3 – nota: se usa la ABI mínima con la función quoteExactInputSingle
      const quoterAddress = ethers.utils.getAddress("0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3");
      const quoterAbi = [
        "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256)"
      ];
      const quoter = new ethers.Contract(quoterAddress, quoterAbi, routerContract.provider);
      return await quoter.callStatic.quoteExactInputSingle(pair.tokenA, pair.tokenB, 3000, pair.amountIn, 0);
    }
    if (dexName === "UniswapV4") {
      // Usar el Quoter de Uniswap V4
      const quoterAddress = ethers.utils.getAddress("0x61b3f2011a92d183C7DbAdBdA940A7555CcF9227");
      const quoterAbi = [
        "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut)"
      ];
      const quoter = new ethers.Contract(quoterAddress, quoterAbi, routerContract.provider);
      const path = ethers.utils.solidityPack(["address", "uint24", "address"], [pair.tokenA, 3000, pair.tokenB]);
      return await quoter.callStatic.quoteExactInput(path, pair.amountIn);
    }
    // Para SushiSwap V2 u otros DEX que implementen getAmountsOut:
    if (routerContract.interface.functions["getAmountsOut(uint256,address[])"]) {
      const path = [pair.tokenA, pair.tokenB];
      const amounts = await routerContract.getAmountsOut(pair.amountIn, path);
      return amounts && amounts.length > 1 ? amounts[amounts.length - 1] : null;
    }
    return null;
  } catch (error: any) {
    console.log(`${dexName}: Error obteniendo precio -> ${error.message}`);
    return null;
  }
}

// ========================================================
// Función principal de monitoreo
// ========================================================
async function main() {
  console.log("=== Monitoreo de arbitraje en Ethereum Sepolia (modo solo lectura) ===");

  // Crear provider a partir de la URL RPC definida en .env
  const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const network = await provider.getNetwork();
  console.log("Conectado a la red:", network);

  // Instanciar los contratos de router para cada DEX (usando ABIs cargados desde archivo)
  const dexRouters: Record<string, ethers.Contract> = {};
  for (const [dexName, routerAddr] of Object.entries(DEX_ROUTERS)) {
    try {
      const abi = loadAbi(dexName, "router");
      dexRouters[dexName] = new ethers.Contract(ethers.utils.getAddress(routerAddr), abi, provider);
      console.log(`✅ Router ${dexName} cargado`);
    } catch (err) {
      console.error(`❌ No se pudo cargar ABI para ${dexName}:`, err);
    }
  }

  console.log(`Monitoreando ${PAIRS_TO_MONITOR.length} pares de tokens...`);

  // Bucle de monitoreo continuo (cada 5 segundos)
  while (true) {
    for (const pair of PAIRS_TO_MONITOR) {
      // Convertir direcciones a símbolos para mayor legibilidad
      const symA =
        Object.entries(TOKENS).find(
          ([, addr]) => addr.toLowerCase() === pair.tokenA.toLowerCase()
        )?.[0] || pair.tokenA;
      const symB =
        Object.entries(TOKENS).find(
          ([, addr]) => addr.toLowerCase() === pair.tokenB.toLowerCase()
        )?.[0] || pair.tokenB;
      console.log(`\n----- Verificando par ${symA}/${symB} -----`);

      let bestPrice: ethers.BigNumber | null = null;
      let worstPrice: ethers.BigNumber | null = null;
      let bestDex = "", worstDex = "";
      
      // Consultar el precio en cada DEX disponible
      for (const [dexName, router] of Object.entries(dexRouters)) {
        const priceOut = await getTokenPrice(dexName, router, pair);
        if (!priceOut || priceOut.isZero()) continue;
        const priceNum = parseFloat(ethers.utils.formatUnits(priceOut, pair.decimalsB));
        console.log(`Precio en ${dexName}: ${priceNum}`);
        if (bestPrice === null || priceOut.gt(bestPrice)) {
          bestPrice = priceOut;
          bestDex = dexName;
        }
        if (worstPrice === null || priceOut.lt(worstPrice)) {
          worstPrice = priceOut;
          worstDex = dexName;
        }
      }
      
      if (!bestPrice || !worstPrice || bestDex === worstDex) {
        console.log("No se han encontrado al menos dos fuentes con liquidez para este par.");
        continue;
      }
      
      // Calcular la diferencia: ganancia potencial
      const profit = bestPrice.sub(worstPrice);
      const profitVal = parseFloat(ethers.utils.formatUnits(profit, pair.decimalsB));
      const profitPct = (profitVal / parseFloat(ethers.utils.formatUnits(worstPrice, pair.decimalsB))) * 100;
      
      if (profitVal > 0 && profitPct > 0.1) {
        console.log(`➡️ Oportunidad detectada: comprar en ${worstDex} y vender en ${bestDex}`);
        console.log(`   Ganancia potencial = ${profitVal.toFixed(4)} ${symB} (${profitPct.toFixed(2)}%)`);
      } else {
        console.log("No hay oportunidad rentable en este ciclo.");
      }
    }
    // Esperar 5 segundos entre cada iteración
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

main().catch(console.error);