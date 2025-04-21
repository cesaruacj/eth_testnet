// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IPoolAddressesProvider } from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./ArbitrageLogic.sol";

contract FlashLoanSepoliaUpgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IPoolAddressesProvider public ADDRESSES_PROVIDER;
    IPool public POOL;
    ArbitrageLogic public arbitrageLogic;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address provider, address _arbitrageLogic) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
        arbitrageLogic = ArbitrageLogic(_arbitrageLogic);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

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
        
        // Transfer tokens directly to ArbitrageLogic
        IERC20(assets[0]).transfer(address(arbitrageLogic), amounts[0]);
        
        // Execute arbitrage
        arbitrageLogic.executeArbitrage(assets[0], amounts[0]);
        
        // Approve POOL to withdraw amount + premium
        IERC20(assets[0]).approve(address(POOL), amountOwing);
        
        return true;
    }
}
