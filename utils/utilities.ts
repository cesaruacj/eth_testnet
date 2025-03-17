import { network, ethers } from "hardhat";
import { Contract } from "ethers";

const fundErc20 = async (contract: Contract, sender: string, recipient: string, amount: string): Promise<void> => {
  // Usa ethers.parseUnits (compatible con ethers v6)
  const FUND_AMOUNT = ethers.parseUnits(amount, 18);
  
  // Obtén el signer del "whale" o cuenta con fondos
  const whale = await ethers.getSigner(sender);

  // Conecta el contrato al signer
  const contractSigner = contract.connect(whale);
  // Asegura que la transacción se complete antes de continuar
  // Si TypeScript no reconoce "transfer", haz un cast a any o define correctamente la interfaz ERC20.
  await (contractSigner as any).transfer(recipient, FUND_AMOUNT);
  console.log(`Transferred ${amount} tokens from ${sender} to ${recipient}`);
};

const impersonateFundErc20 = async (contract: Contract, sender: string, recipient: string, amount: string): Promise<void> => {
  try {
    // Impersona la cuenta sender
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [sender],
    });

    // Llama a la función de fundear ERC20
    await fundErc20(contract, sender, recipient, amount);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : error;
    console.error(`Error while funding ERC20: ${errorMessage}`);
    throw error; // Re-lanza el error después de registrarlo
  } finally {
    // Asegura que siempre se deje de impersonar la cuenta, incluso si hay errores
    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [sender],
    });
  }
};

export {
  fundErc20,
  impersonateFundErc20,
};