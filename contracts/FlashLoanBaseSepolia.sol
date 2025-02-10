// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
// AAVE V3 INTERFACES
import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
// OZ ERC20 INTERFACE
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// IMPORTAR LA LÓGICA DE ARBITRAJE
import "./ArbitrageLogic.sol";
/**
 * @title FlashLoanBaseSepolia
 * @dev Solicita Flash Loans de Aave V3 y delega la lógica de arbitraje
 *      al contrato ArbitrageLogic. Esto es un ejemplo simplificado.
 */
contract FlashLoanBaseSepolia {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    // Referencia al contrato que contiene la lógica de arbitraje
    ArbitrageLogic public arbitrageLogic;

    /**
     * @dev Inicializa la dirección del PoolAddressesProvider y configura 
     *      la referencia al contrato de lógica de arbitraje.
     * @param provider Dirección del PoolAddressesProvider en la red Sepolia (o Base).
     * @param _arbitrageLogic Dirección del contrato ArbitrageLogic.
     */
    constructor(address provider, address _arbitrageLogic) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
        arbitrageLogic = ArbitrageLogic(_arbitrageLogic);
    }

    /**
     * @dev Solicita un flash loan de un único activo en Aave.
     * @param asset Dirección del token que deseas pedir prestado.
     * @param amount Cantidad del token que deseas pedir prestado.
     */
    function executeFlashLoan(address asset, uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");

        // Lista de activos a pedir prestado (solo uno)
        address[] memory assets = new address[](1);
        assets[0] = asset;

        // Lista de cantidades para cada activo
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        // Modo 0 = sin deuda (se devuelve todo al final)
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        // Solicita el flash loan
        POOL.flashLoan(
            address(this),   // receptor del préstamo
            assets,
            amounts,
            modes,
            address(this),   // onBehalfOf
            "",              // parámetros adicionales (vacío)
            0                // referralCode
        );
    }

    /**
     * @dev Función que Aave llama automáticamente después de entregar los fondos.
     *      Aquí delegamos la operación de arbitraje al contrato ArbitrageLogic.
     *
     * @param assets Lista de direcciones de los activos prestados.
     * @param amounts Lista de cantidades prestadas para cada activo.
     * @param premiums Lista de comisiones a pagar para cada activo.
     * @param initiator Dirección que inició el flash loan (este contrato).
     * @param params Parámetros adicionales (no usados en este ejemplo).
     *
     * @return true si la operación se completó exitosamente.
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(POOL), "Caller must be the Aave Pool");
        require(initiator == address(this), "Invalid initiator");

        // 1. Transferir los fondos al contrato de arbitraje
        //    para que éste pueda manejar el swap (opcional si deseas aislar fondos).
        //    *Si prefieres, podrías hacer todo en este mismo contrato sin transferir.*
        IERC20(assets[0]).transfer(address(arbitrageLogic), amounts[0]);

        // 2. Ejecutar la lógica de arbitraje con la cantidad prestada
        //    (en este ejemplo, asumimos tokenIn = assets[0], y un tokenOut dentro del ArbitrageLogic).
        arbitrageLogic.executeArbitrage(assets[0], amounts[0]);

        // 3. (Opcional) El contrato ArbitrageLogic debe devolver tokens a este contrato
        //    para poder repagar a Aave. Aquí asumimos que ArbitrageLogic ya dejó
        //    los tokens de vuelta en este contrato (ver "executeArbitrage" en ArbitrageLogic).

        // 4. Calcular la cantidad total a devolver (principal + comisión)
        uint256 amountOwed = amounts[0] + premiums[0];

        // 5. Aprobar al Pool para que retire los fondos adeudados
        IERC20(assets[0]).approve(address(POOL), amountOwed);

        return true;
    }
}