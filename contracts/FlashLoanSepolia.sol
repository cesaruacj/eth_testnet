// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ArbitrageLogic.sol";

contract FlashLoanSepolia is Ownable {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;
    ArbitrageLogic public arbitrageLogic;

    constructor(address provider, address _arbitrageLogic) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
        arbitrageLogic = ArbitrageLogic(_arbitrageLogic);
    }

    function executeFlashLoan(address asset, uint256 amount) external {
        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        // 0 = no debt, 1 = stable, 2 = variable
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);
        bytes memory params = "";
        uint16 referralCode = 0;

        POOL.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(POOL), "Caller must be Aave Pool");
        
        uint256 amountOwing = amounts[0] + premiums[0];
        
        // AÑADIR ESTA LÍNEA: Transferir los tokens directamente a ArbitrageLogic
        IERC20(assets[0]).transfer(address(arbitrageLogic), amounts[0]);
        
        // Ejecutar arbitraje
        arbitrageLogic.executeArbitrage(assets[0], amounts[0]);
        
        // Aprobar a POOL para retirar monto + premium
        IERC20(assets[0]).approve(address(POOL), amountOwing);
        
        return true;
    }
}
