import { ethers } from "hardhat";
import { BigNumber } from "ethers";

// Configuración de tokens y routers en Sepolia (igual que en monitor-arbitrage.ts)
const TOKENS = {
  UNI:  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  YU:   "0xe0232d625ea3b94698f0a7dff702931b704083c9",
  MON:  "0x810a3b22c91002155d305c4ce032978e3a97f8c4",
  YBTC: "0xbbd3edd4d3b519c0d14965d9311185cfac8c3220",
  WETH: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14"
};
const DEX_ROUTERS = {
  SushiSwapV2: "0xeaBcE3E74EF41FB40024a21Cc2ee2F5dDc615791",
  UniswapV3:   "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  UniswapV4:   "0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b",
  BalancerV2:  "0x5e315f96389C1aaF9324D97d3512ae1e0Bf3C21a"
};

const PAIRS_TO_MONITOR = [
  { tokenA: TOKENS.YBTC, tokenB: TOKENS.YU,   amountIn: ethers.utils.parseUnits("1000", 8),  decimalsA: 8, decimalsB: 6 },
  { tokenA: TOKENS.YU,   tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 6),  decimalsA: 6, decimalsB: 18 },
  { tokenA: TOKENS.YBTC, tokenB: TOKENS.WETH, amountIn: ethers.utils.parseUnits("1000", 8),  decimalsA: 8, decimalsB: 18 }
  // Se pueden omitir pares con UNI o MON, pues su liquidez es menor actualmente.
];

// Función auxiliar para cargar ABI
function loadAbi(dexName: string, contractType: string = 'router'): any {
  try {
    const abiPath = `../external/abis/sepolia/${dexName}/${contractType}.json`;
    return require(abiPath);
  } catch {
    throw new Error(`ABI no encontrada para ${dexName} ${contractType}`);
  }
}

// Función para obtener el precio, similar a la del monitor
async function getTokenPrice(dexName: string, routerContract: ethers.Contract, pair: any): Promise<BigNumber | null> {
  try {
    if (dexName === 'UniswapV3') {
      const quoterAddress = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3";
      const quoterAbi = loadAbi("UniswapV3", "quoter");
      const quoter = new ethers.Contract(quoterAddress, quoterAbi, routerContract.provider);
      return await quoter.callStatic.quoteExactInputSingle(pair.tokenA, pair.tokenB, 3000, pair.amountIn, 0);
    }
    if (dexName === 'UniswapV4') {
      const quoterAddress = "0x61b3f2011a92d183c7dbadbda940a7555ccf9227";
      const quoterAbi = loadAbi("UniswapV4", "quoter");
      const quoter = new ethers.Contract(quoterAddress, quoterAbi, routerContract.provider);
      const path = ethers.utils.solidityPack(['address','uint24','address'], [pair.tokenA,3000, pair.tokenB]);
      return await quoter.callStatic.quoteExactInput(path, pair.amountIn);
    }
    if (routerContract.interface.functions['getAmountsOut(uint256,address[])']) {
      const path = [pair.tokenA, pair.tokenB];
      const amounts = await routerContract.getAmountsOut(pair.amountIn, path);
      return amounts?.[1] || null;
    }
    return null;
  } catch (error: any) {
    console.log(`${dexName}: Error obteniendo precio -> ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("=== Ejecución de arbitraje en Ethereum Sepolia (modo activo) ===");
  const provider = new ethers.providers.JsonRpcProvider("<URL_RPC_Sepolia>");
  const [deployer] = await ethers.getSigners();
  console.log(`Cuenta para ejecución: ${deployer.address}`);
  
  // Instanciar contrato flashLoan (asegúrate de que FlashLoanSepolia esté compilado y su ABI se haya generado)
  const FLASH_LOAN_ADDRESS = "0x012B50B13Be3cEfe9B2Bd51b1685A81e4eCE16D5";
  const flashLoan = await ethers.getContractAt("FlashLoanSepolia", FLASH_LOAN_ADDRESS, deployer);
  
  // Instanciar routers
  const dexRouters: Record<string, ethers.Contract> = {};
  for (const [dexName, routerAddr] of Object.entries(DEX_ROUTERS)) {
    try {
      const abi = loadAbi(dexName);
      dexRouters[dexName] = new ethers.Contract(routerAddr, abi, provider);
      console.log(`✅ Router ${dexName} cargado`);
    } catch (err) {
      console.error(`❌ Error cargando ABI para ${dexName}:`, err);
    }
  }
  
  // Sólo se trabajará con pares que tengan liquidez en dos DEX
  // Para simplificar, usaremos la lista PAIRS_TO_MONITOR directamente (preferiblemente, enfócate en YBTC/YU, YU/WETH, y YBTC/WETH)
  while (true) {
    for (const pair of PAIRS_TO_MONITOR) {
      const symA = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenA)?.[0] || pair.tokenA;
      const symB = Object.entries(TOKENS).find(([, addr]) => addr === pair.tokenB)?.[0] || pair.tokenB;
      console.log(`\n----- Analizando par ${symA}/${symB} -----`);
      
      let bestPrice: BigNumber | null = null;
      let worstPrice: BigNumber | null = null;
      let bestDex = "", worstDex = "";
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
        console.log("No se encontraron suficientes fuentes de precio para este par.");
        continue;
      }
      
      const profit = bestPrice.sub(worstPrice);
      const profitVal = parseFloat(ethers.utils.formatUnits(profit, pair.decimalsB));
      if (profitVal > 0) {
        const profitPct = (profitVal / parseFloat(ethers.utils.formatUnits(worstPrice, pair.decimalsB))) * 100;
        console.log(`➡️ Oportunidad detectada: comprar en ${worstDex} y vender en ${bestDex}`);
        console.log(`   Ganancia potencial = ${profitVal.toFixed(4)} ${symB} (${profitPct.toFixed(2)}%)`);
        
        // Ejecutamos el arbitraje si la ganancia supera un umbral (por ejemplo, >0.5 unidades en la moneda de salida)
        if (profitVal >= 0.5) {
          try {
            console.log("Ejecutando flash loan...");
            // Se asume que la función executeFlashLoan recibe (tokenIn, tokenOut, amountIn, routerCompra, routerVenta)
            const tx = await flashLoan.executeFlashLoan(
              pair.tokenA, pair.tokenB, pair.amountIn,
              DEX_ROUTERS[worstDex], // donde se compra
              DEX_ROUTERS[bestDex]   // donde se vende
            );
            console.log(`Transacción enviada. Hash: ${tx.hash}`);
            await tx.wait();
            console.log("✔️ Arbitraje ejecutado exitosamente.");
          } catch (err: any) {
            console.error("Error durante la ejecución del flash loan:", err);
          }
        } else {
          console.log("Ganancia detectada inferior al umbral para ejecutar el flash loan.");
        }
      } else {
        console.log("No hay oportunidad de arbitraje rentable en este ciclo.");
      }
    }
    await new Promise(res => setTimeout(res, 5000));
  }
}

main().catch(console.error);
