import { ethers } from "hardhat";

async function main() {
  // Obtener el primer firmante conectado (deployer)
  const [deployer] = await ethers.getSigners();

  // Mostrar la dirección del deployer
  console.log("Conectado con la cuenta:", deployer.address);

  // Obtener y formatear el balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance de la cuenta:", ethers.utils.formatEther(balance), "ETH");
}

// Maneja errores en la ejecución del script
main().catch((error) => {
  console.error("Error al verificar la red:", error);
  process.exitCode = 1;
});
