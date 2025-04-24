import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TOKENS, AAVE_TOKENS, AAVE_V3, DEPLOYED_CONTRACTS } from "./sepoliaAddresses";
dotenv.config();

// Configuración
const FLASH_LOAN_CONTRACT_ADDRESS = DEPLOYED_CONTRACTS.FLASH_LOAN;
const ARBITRAGE_LOGIC_ADDRESS = DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC;
const AAVE_POOL_ADDRESS_PROVIDER = AAVE_V3.POOL_ADDRESSES_PROVIDER;

// Token configuration with all available tokens
const TOKEN_CONFIGS = [
  { address: AAVE_TOKENS.DAI, symbol: "DAI", amount: "0.01" },
  { address: AAVE_TOKENS.LINK, symbol: "LINK", amount: "0.01" },
  { address: AAVE_TOKENS.WBTC, symbol: "WBTC", amount: "0.001" }, // Lower amount for WBTC
  { address: AAVE_TOKENS.USDC, symbol: "USDC", amount: "0.01" },
  { address: AAVE_TOKENS.USDT, symbol: "USDT", amount: "0.01" },
  { address: AAVE_TOKENS.AAVE, symbol: "AAVE", amount: "0.01" }
];

const TEST_AMOUNT = "0.01"; // Cantidad pequeña para pruebas iniciales

// ABI mínimos
const flashLoanABI = [
  "function executeFlashLoan(address asset, uint256 amount) external",
  "function executeOperation(address[] calldata assets, uint256[] calldata amounts, uint256[] calldata premiums, address initiator, bytes calldata params) external returns (bool)"
];

const erc20ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function transfer(address recipient, uint256 amount) external returns (bool)"
];

const poolAddressProviderABI = [
  "function getPool() external view returns (address)"
];

const poolABI = [
  "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))"
];

// Inicialización de proveedor y wallet
if (!process.env.SEPOLIA_RPC_URL || !process.env.PRIVATE_KEY) {
  throw new Error("SEPOLIA_RPC_URL y PRIVATE_KEY deben estar definidos en el archivo .env");
}

const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Función principal de validación
async function validateFlashLoan() {
  console.log("\n🔍 INICIANDO VALIDACIÓN DEL CONTRATO FLASH LOAN\n");
  
  // Paso 1: Verificar que los contratos existen
  await validateContractExistence();
  
  // Test each token
  for (const tokenConfig of TOKEN_CONFIGS) {
    console.log(`\n==== TESTING FLASH LOAN WITH ${tokenConfig.symbol} ====\n`);
    
    const currentTestToken = tokenConfig.address;
    const currentTestSymbol = tokenConfig.symbol;
    const currentTestAmount = tokenConfig.amount;

    try {
      // Paso 2: Verificar que el token está soportado por Aave
      await validateTokenSupport(currentTestToken, currentTestSymbol);
      
      // Paso 3: Verificar saldos y aprobaciones
      await validateBalancesAndAllowances(currentTestToken, currentTestSymbol);
      
      // Paso 4: Simular la función de flash loan
      const simulationSuccess = await simulateFlashLoan(currentTestToken, currentTestSymbol, currentTestAmount);
      
      // Paso 5: Ejecutar un flash loan pequeño
      if (simulationSuccess && await confirmExecution(currentTestSymbol, currentTestAmount)) {
        await preFundArbitrageLogic(currentTestToken, currentTestSymbol, currentTestAmount);
        await executeTestFlashLoan(currentTestToken, currentTestSymbol, currentTestAmount);
      }
    } catch (error) {
      console.error(`❌ Error testing flash loan with ${currentTestSymbol}:`, error);
      console.log(`Continuing with next token...\n`);
      continue;
    }
  }
}

// Valida que los contratos existan en la blockchain
async function validateContractExistence() {
  console.log("PASO 1: Verificando existencia de contratos en la blockchain...");
  
  try {
    const flashLoanCode = await provider.getCode(FLASH_LOAN_CONTRACT_ADDRESS);
    if (flashLoanCode === '0x') {
      console.error(`❌ El contrato FlashLoanSepolia no existe en ${FLASH_LOAN_CONTRACT_ADDRESS}`);
      process.exit(1);
    }
    console.log(`✓ Contrato FlashLoanSepolia encontrado en ${FLASH_LOAN_CONTRACT_ADDRESS}`);
    
    const arbitrageCode = await provider.getCode(ARBITRAGE_LOGIC_ADDRESS);
    if (arbitrageCode === '0x') {
      console.error(`❌ El contrato ArbitrageLogic no existe en ${ARBITRAGE_LOGIC_ADDRESS}`);
      process.exit(1);
    }
    console.log(`✓ Contrato ArbitrageLogic encontrado en ${ARBITRAGE_LOGIC_ADDRESS}`);
    
    const providerCode = await provider.getCode(AAVE_POOL_ADDRESS_PROVIDER);
    if (providerCode === '0x') {
      console.error(`❌ El contrato PoolAddressesProvider no existe en ${AAVE_POOL_ADDRESS_PROVIDER}`);
      process.exit(1);
    }
    console.log(`✓ Contrato PoolAddressesProvider encontrado en ${AAVE_POOL_ADDRESS_PROVIDER}`);
    
    console.log("✅ Todos los contratos existen en la blockchain\n");
  } catch (error) {
    console.error("Error verificando contratos:", error);
    process.exit(1);
  }
}

// Valida que el token esté soportado por Aave
async function validateTokenSupport(testToken, testSymbol) {
  console.log(`PASO 2: Verificando soporte del token ${testSymbol} en Aave...`);
  
  try {
    // Obtener la Pool de Aave desde el Provider
    const providerContract = new ethers.Contract(AAVE_POOL_ADDRESS_PROVIDER, poolAddressProviderABI, provider);
    const poolAddress = await providerContract.getPool();
    console.log(`✓ Pool de Aave encontrado en: ${poolAddress}`);
    
    // Verificar que el token está soportado en la Pool
    const poolContract = new ethers.Contract(poolAddress, poolABI, provider);
    const reserveData = await poolContract.getReserveData(testToken);
    
    // Si no revierte, el token está soportado
    const tokenContract = new ethers.Contract(testToken, erc20ABI, provider);
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    
    console.log(`✓ Token ${symbol} (${testToken}) soportado por Aave`);
    console.log(`✓ aToken address: ${reserveData.aTokenAddress}`);
    console.log(`✓ Decimals: ${decimals}`);
    console.log(`✓ Liquidez disponible: ${ethers.utils.formatUnits(reserveData.currentLiquidityRate, 27)}%`);
    
    console.log("✅ Token verificado y soportado por Aave\n");
    
    return { poolAddress, decimals };
  } catch (error) {
    console.error(`❌ Error verificando soporte del token: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`);
    console.error("Es posible que Aave en Sepolia no soporte este token o que la reserva esté pausada");
    process.exit(1);
  }
}

// Valida saldos y aprobaciones
async function validateBalancesAndAllowances(testToken, testSymbol) {
  console.log("PASO 3: Verificando saldos y aprobaciones...");
  
  try {
    const tokenContract = new ethers.Contract(testToken, erc20ABI, provider);
    const decimals = await tokenContract.decimals();
    
    // Verificar saldo de la wallet
    const walletBalance = await tokenContract.balanceOf(wallet.address);
    console.log(`✓ Saldo de ${testSymbol} en tu wallet: ${ethers.utils.formatUnits(walletBalance, decimals)}`);
    
    // Verificar saldo del contrato FlashLoan
    const contractBalance = await tokenContract.balanceOf(FLASH_LOAN_CONTRACT_ADDRESS);
    console.log(`✓ Saldo de ${testSymbol} en FlashLoanSepolia: ${ethers.utils.formatUnits(contractBalance, decimals)}`);
    
    // Verificar aprobación de la wallet al contrato FlashLoan
    const allowanceToFlashLoan = await tokenContract.allowance(wallet.address, FLASH_LOAN_CONTRACT_ADDRESS);
    console.log(`✓ Aprobación actual de wallet a FlashLoanSepolia: ${ethers.utils.formatUnits(allowanceToFlashLoan, decimals)}`);
    
    // Verificar aprobación del contrato FlashLoan a ArbitrageLogic
    const flashLoanWithProvider = new ethers.Contract(FLASH_LOAN_CONTRACT_ADDRESS, flashLoanABI, provider);
    const allowanceToArbitrage = await tokenContract.allowance(FLASH_LOAN_CONTRACT_ADDRESS, ARBITRAGE_LOGIC_ADDRESS);
    console.log(`✓ Aprobación actual de FlashLoanSepolia a ArbitrageLogic: ${ethers.utils.formatUnits(allowanceToArbitrage, decimals)}`);
    
    console.log("✅ Verificación de saldos y aprobaciones completada\n");
  } catch (error) {
    console.error("Error verificando saldos y aprobaciones:", error);
  }
}

// Simula la ejecución del flash loan (sin enviar transacción)
async function simulateFlashLoan(testToken, testSymbol, testAmount) {
  console.log("PASO 4: Simulando ejecución de flash loan...");
  
  try {
    const tokenContract = new ethers.Contract(testToken, erc20ABI, provider);
    const decimals = await tokenContract.decimals();
    const amount = ethers.utils.parseUnits(testAmount, decimals);
    
    // Conectar al contrato FlashLoan con la wallet
    const flashLoanWithSigner = new ethers.Contract(FLASH_LOAN_CONTRACT_ADDRESS, flashLoanABI, wallet);
    
    // Estimar gas (esto simulará la llamada completa sin ejecutarla)
    const gasEstimate = await flashLoanWithSigner.estimateGas.executeFlashLoan(testToken, amount);
    
    console.log(`✓ Simulación exitosa! Estimación de gas: ${gasEstimate.toString()}`);
    console.log("✅ La transacción de flash loan debería ejecutarse correctamente\n");
    
    return true;
  } catch (error) {
    console.error("❌ Error en la simulación del flash loan:");
    console.error((error instanceof Error ? error.message : String(error)));
    
    // Analizar el error para dar recomendaciones más específicas
    if ((error instanceof Error ? error.message : String(error)).includes("TRANSFER_AMOUNT_EXCEEDS_BALANCE")) {
      console.log("\n⚠️ El error parece indicar un problema de balance insuficiente.");
      // Detailed error handling...
    } 
    else if ((error instanceof Error ? error.message : String(error)).includes("insufficient")) {
      console.log("\n⚠️ El error parece indicar un problema de fondos insuficientes para gas.");
      console.log("Asegúrate de tener suficiente ETH en tu wallet para cubrir el gas.");
    }
    else if ((error instanceof Error ? error.message : String(error)).includes("approve")) {
      console.log("\n⚠️ El error parece estar relacionado con aprobaciones (approve).");
      console.log("Verifica la implementación de los métodos de aprobación en el contrato.");
    }
    
    console.log("\n⚠️ Recomendaciones:");
    console.log("1. Revisa que la función executeOperation en FlashLoanSepolia.sol maneje correctamente los premiums.");
    console.log("2. Asegúrate que ArbitrageLogic.executeArbitrage devuelva los tokens al contrato FlashLoanSepolia.");
    console.log("3. Prueba con un monto más pequeño, por ejemplo 0.1 tokens en vez de 1.");
    console.log("4. Verifica que el executeOperation use el método de aprovación correcto.\n");
    
    return false;
  }
}

// Confirma si el usuario quiere ejecutar un flash loan de prueba
async function confirmExecution(testSymbol, testAmount) {
  // En un entorno de script, simplemente retornamos true
  // En un entorno interactivo, podrías implementar una confirmación real
  console.log("PASO 5: Ejecutar un flash loan de prueba");
  console.log(`Se ejecutará un flash loan de ${testAmount} ${testSymbol}`);
  console.log("NOTA: Esto enviará una transacción real a la blockchain\n");
  
  return true; // Cambiar a false si no quieres ejecutar automáticamente
}

// Añadir función para pre-fondear
async function preFundArbitrageLogic(testToken, testSymbol, testAmount) {
  const tokenContract = new ethers.Contract(testToken, erc20ABI, wallet);
  const decimals = await tokenContract.decimals();
  
  // Calculate premium as 0.05% of the flash loan amount
  const borrowAmount = ethers.utils.parseUnits(testAmount, decimals);
  const premiumRate = 0.0005; // 0.05%
  const premiumAmount = borrowAmount.mul(Math.floor(premiumRate * 10000)).div(10000);
  
  // Add a small buffer (10%) to ensure we have enough to cover the premium
  const fundAmount = premiumAmount.mul(110).div(100);
  
  // Send the calculated premium amount to ArbitrageLogic
  const tx = await tokenContract.transfer(ARBITRAGE_LOGIC_ADDRESS, fundAmount);
  await tx.wait();
  
  console.log(`✅ Enviados ${ethers.utils.formatUnits(fundAmount, decimals)} ${testSymbol} a ArbitrageLogic para cubrir el premium (0.05% de ${testAmount} + 10% buffer)`);
}

// Ejecuta un flash loan pequeño como prueba
async function executeTestFlashLoan(testToken, testSymbol, testAmount) {
  console.log("Ejecutando flash loan de prueba...");
  
  try {
    const tokenContract = new ethers.Contract(testToken, erc20ABI, provider);
    const decimals = await tokenContract.decimals();
    const amount = ethers.utils.parseUnits(testAmount, decimals);
    
    // Conectar al contrato FlashLoan con la wallet
    const flashLoanWithSigner = new ethers.Contract(FLASH_LOAN_CONTRACT_ADDRESS, flashLoanABI, wallet);
    
    // Ejecutar el flash loan
    console.log(`Enviando transacción de flash loan para ${testAmount} ${testSymbol}...`);
    const tx = await flashLoanWithSigner.executeFlashLoan(testToken, amount);
    
    console.log(`Transacción enviada! Hash: ${tx.hash}`);
    console.log("Esperando confirmación...");
    
    // Esperar a que la transacción sea minada
    const receipt = await tx.wait();
    
    console.log(`✅ Flash loan ejecutado con éxito!`);
    console.log(`Gas usado: ${receipt.gasUsed.toString()}`);
    
    return true;
  } catch (error) {
    console.error("❌ Error ejecutando flash loan:");
    console.error(error instanceof Error ? error.message : String(error));
    return false;
  }
}
