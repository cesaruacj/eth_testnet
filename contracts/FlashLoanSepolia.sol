// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ArbitrageLogic.sol";

contract FlashLoanSepolia {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    ArbitrageLogic public arbitrageLogic;

    constructor(address provider, address _arbitrageLogic) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
        arbitrageLogic = ArbitrageLogic(_arbitrageLogic);
    }

    function executeFlashLoan(address asset, uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");

        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // Flash loan sin deuda

        POOL.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            "",
            0
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(POOL), "Caller must be the Aave Pool");
        require(initiator == address(this), "Invalid initiator");

        // Transferir el activo prestado a ArbitrageLogic
        IERC20(assets[0]).transfer(address(arbitrageLogic), amounts[0]);

        // Ejecutar la lógica de arbitraje en ArbitrageLogic
        arbitrageLogic.executeArbitrage(assets[0], amounts[0]);

        // Calcular el total a devolver (principal + comisión)
        uint256 amountOwed = amounts[0] + premiums[0];
        IERC20(assets[0]).approve(address(POOL), amountOwed);

        return true;
    }
}
