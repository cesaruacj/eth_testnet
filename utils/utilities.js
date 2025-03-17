const { network, ethers } = require("hardhat");

const fundErc20 = async (contract, sender, recipient, amount) => {
  // Convierte la cantidad a BigNumber usando 18 decimales (ajusta si el token usa otra cantidad)
  const FUND_AMOUNT = ethers.utils.parseUnits(amount, 18);
  
  // Obtén el signer del "whale" o cuenta con fondos
  const whale = await ethers.getSigner(sender);

  // Conecta el contrato al signer
  const contractSigner = contract.connect(whale);
  await contractSigner.transfer(recipient, FUND_AMOUNT);
};

const impersonateFundErc20 = async (contract, sender, recipient, amount) => {
  // Impersona la cuenta sender
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [sender],
  });

  // Llama a la función de fundear ERC20
  await fundErc20(contract, sender, recipient, amount);

  // Deja de impersonar la cuenta sender
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [sender],
  });
};

module.exports = {
  impersonateFundErc20,
};
