// filepath: c:\Users\ccane\OneDrive\Escritorio\Maestria UACJ\4to Semestre\Seminario IV\basefl2\scripts\deploy.ts
// La sintaxis ya parece ser compatible con ethers v5
import { ethers } from "hardhat";

async function main() {
  // Dirección del PoolAddressesProvider de Aave en ETH Sepolia
  const addressesProvider: string = "0x012bAC54348C0E635dCAc9D5FB99f06F24136514";

  // Dirección de ArbitrageLogic que ya desplegaste
  // Aquí tendrías que poner la dirección real de tu contrato ArbitrageLogic desplegado
  const arbitrageLogicAddress = "0x5Ab5E43a1235fe9C31a616855954317C1d388B3D";

  // Imprime para debug
  console.log("Usando PoolAddressesProvider de Ethereum Sepolia:", addressesProvider);

  // Crea la fábrica del contrato
  const FlashLoanEthereumSepolia = await ethers.getContractFactory("FlashLoanEthereumSepolia");

  // Despliega el contrato con ambos parámetros
  const flashLoan = await FlashLoanEthereumSepolia.deploy(addressesProvider, arbitrageLogicAddress);
  await flashLoan.deployed();

  // Muestra la dirección donde se desplegó el contrato
  console.log("FlashLoanEthereumSepolia desplegado en:", flashLoan.address);
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al desplegar el contrato:", error);
  process.exitCode = 1;
});
