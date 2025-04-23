import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { DEPLOYED_CONTRACTS, AAVE_TOKENS } from "./sepoliaAddresses";
import { getOptimizedGasFees } from "../src/utils/gas";
dotenv.config();

// Usar direcciones de sepoliaAddresses.ts
const ARBITRAGE_LOGIC_ADDRESS = DEPLOYED_CONTRACTS.ARBITRAGE_LOGIC;
const TOKEN_ADDRESS = AAVE_TOKENS.LINK; // LINK como ejemplo
const AMOUNT = ethers.utils.parseUnits("1", 18);

const arbitrageABI = [
    "function executeArbitrage(address tokenIn, uint256 amountIn) external",
    "event ArbitrageExecuted(address indexed token, uint256 amountIn, uint256 receivedAmount, uint256 profit)"
];

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Validando arbitraje con la cuenta:", signer.address);
    
    const arbitrage = new ethers.Contract(ARBITRAGE_LOGIC_ADDRESS, arbitrageABI, signer);
    
    // Obtener gas settings optimizados
    const gasSettings = await getOptimizedGasFees('default');

    // Verificar balance antes
    const token = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        TOKEN_ADDRESS,
        signer
    );
    const balanceBefore = await token.balanceOf(ARBITRAGE_LOGIC_ADDRESS);
    console.log(`Balance antes: ${ethers.utils.formatUnits(balanceBefore, 18)} LINK`);

    // Ejecutar arbitraje con gas settings optimizados
    const tx = await arbitrage.executeArbitrage(TOKEN_ADDRESS, AMOUNT, gasSettings);
    console.log(`Tx enviada: ${tx.hash}`);
    console.log(`Ver en Etherscan: https://sepolia.etherscan.io/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Gas usado: ${receipt.gasUsed.toString()}`);

    // Buscar evento ArbitrageExecuted
    const event = receipt.events?.find(e => e.event === "ArbitrageExecuted");
    if (event) {
        const { token, amountIn, receivedAmount, profit } = event.args!;
        console.log("\nResultados del arbitraje:");
        console.log(`Token: ${token}`);
        console.log(`Monto entrada: ${ethers.utils.formatUnits(amountIn, 18)} LINK`);
        console.log(`Monto recibido: ${ethers.utils.formatUnits(receivedAmount, 18)} LINK`);
        console.log(`Ganancia: ${ethers.utils.formatUnits(profit, 18)} LINK`);
    } else {
        console.log("⚠️ No se encontró el evento ArbitrageExecuted");
    }

    // Verificar balance después
    const balanceAfter = await token.balanceOf(ARBITRAGE_LOGIC_ADDRESS);
    console.log(`\nBalance después: ${ethers.utils.formatUnits(balanceAfter, 18)} LINK`);
    console.log(`Diferencia: ${ethers.utils.formatUnits(balanceAfter.sub(balanceBefore), 18)} LINK`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });