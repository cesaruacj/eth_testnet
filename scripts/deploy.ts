// filepath: c:\Users\ccane\OneDrive\Escritorio\Maestria UACJ\4to Semestre\Seminario IV\basefl2\scripts\deploy.ts
// La sintaxis ya parece ser compatible con ethers v5
import { ethers } from "hardhat";

async function main() {
  // Dirección del PoolAddressesProvider de Aave en Base Mainnet
  const addressesProvider: string = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";

  // Dirección de ArbitrageLogic que ya desplegaste
  const arbitrageLogicAddress = "0x5Ab5E43a1235fe9C31a616855954317C1d388B3D";

  // Imprime para debug
  console.log("Usando PoolAddressesProvider de Base Sepolia:", addressesProvider);

  // Crea la fábrica del contrato
  const FlashLoanBaseSepolia = await ethers.getContractFactory("FlashLoanBaseSepolia");

  // Despliega el contrato con ambos parámetros
  const flashLoan = await FlashLoanBaseSepolia.deploy(addressesProvider, arbitrageLogicAddress);
  await flashLoan.deployed();

  // Muestra la dirección donde se desplegó el contrato
  console.log("FlashLoanBaseSepolia desplegado en:", flashLoan.address);
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al desplegar el contrato:", error);
  process.exitCode = 1;
});
