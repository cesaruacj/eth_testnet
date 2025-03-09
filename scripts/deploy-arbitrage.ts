import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.getBalance()), "ETH");

  // Desplegar DexAggregator
  const DexAggregatorFactory = await ethers.getContractFactory("DexAggregator");
  const dexAggregator = await DexAggregatorFactory.deploy();
  await dexAggregator.waitForDeployment();
  console.log(`DexAggregator deployed to: ${dexAggregator.target}`);

  // Desplegar ArbitrageLogic pasando la dirección de DexAggregator
  const ArbitrageLogicFactory = await ethers.getContractFactory("ArbitrageLogic");
  const arbitrageLogic = await ArbitrageLogicFactory.deploy(dexAggregator.target);
  await arbitrageLogic.waitForDeployment();
  console.log(`ArbitrageLogic deployed to: ${arbitrageLogic.target}`);

  // Puedes continuar con el despliegue de otros contratos, por ejemplo, ArbitrageSystem o FlashLoanBaseSepolia
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });
