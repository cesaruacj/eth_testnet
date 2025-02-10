import { ethers } from "hardhat";

async function main() {
  // Dirección del PoolAddressesProvider de Aave en Base Sepolia
  const addressesProvider: string = "0x150E9a8b83b731B9218a5633F1E804BC82508A46";

  // Imprime para debug
  console.log("Usando PoolAddressesProvider de Base Sepolia:", addressesProvider);

  // Crea la fábrica del contrato
  const FlashLoanBaseSepolia = await ethers.getContractFactory("FlashLoanBaseSepolia");

  // Despliega el contrato con la dirección anterior
  const flashLoan = await FlashLoanBaseSepolia.deploy(addressesProvider);
  await flashLoan.deployed();

  // Muestra la dirección donde se desplegó el contrato
  console.log("FlashLoanBaseSepolia desplegado en:", flashLoan.address);
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al desplegar el contrato:", error);
  process.exitCode = 1;
});
