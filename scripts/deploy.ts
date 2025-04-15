// filepath: c:\Users\ccane\OneDrive\Escritorio\Maestria UACJ\4to Semestre\Seminario IV\basefl2\scripts\deploy.ts
// La sintaxis ya parece ser compatible con ethers v5
import { ethers } from "hardhat";

async function main() {
  // Dirección del PoolAddressesProvider de Aave en ETH Sepolia
  const addressesProvider: string = "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A";

  // Dirección de ArbitrageLogic que ya desplegaste
  // Aquí tendrías que poner la dirección real de tu contrato ArbitrageLogic desplegado
  const arbitrageLogicAddress = "0x418f6389008B51E5f658D9Ef4BC73d819904A709";

  // Imprime para debug
  console.log("Usando PoolAddressesProvider de Ethereum Sepolia:", addressesProvider);

  // Crea la fábrica del contrato
  const FlashLoanSepolia = await ethers.getContractFactory("FlashLoanSepolia");

  // Despliega el contrato con ambos parámetros
  const flashLoan = await FlashLoanSepolia.deploy(addressesProvider, arbitrageLogicAddress);
  await flashLoan.deployed();

  // Muestra la dirección donde se desplegó el contrato
  console.log("FlashLoanSepolia desplegado en:", flashLoan.address);
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al desplegar el contrato:", error);
  process.exitCode = 1;
});
