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
        // Ensure the caller is the Aave Pool
        require(msg.sender == address(POOL), "Caller must be Aave Pool");
        
        // First approve the arbitrage contract to spend tokens
        IERC20(assets[0]).approve(address(arbitrageLogic), amounts[0]);
        
        // Execute arbitrage (this should return tokens to this contract)
        arbitrageLogic.executeArbitrage(assets[0], amounts[0]);
        
        // Calculate amount to repay (original + premium)
        uint256 amountOwing = amounts[0] + premiums[0];
        
        // Approve the Pool to pull the owed amount
        IERC20(assets[0]).approve(address(POOL), amountOwing);
        
        return true;
    }
}
