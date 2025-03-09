// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DexAggregator.sol";
import "./ArbitrageLogic.sol";

contract ArbitrageSystem is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ArbitrageLogic public arbitrageLogic;
    DexAggregator public dexAggregator;
    
    // Mapeo de símbolos a direcciones de tokens soportados
    mapping(string => address) public tokens;
    
    event ArbitrageExecuted(address indexed token, uint256 amount, uint256 profit);
    event TokenAdded(string symbol, address tokenAddress);
    event DexAdded(string name, address routerAddress, uint8 dexType);
    
    // Constructor: No llamamos a Ownable(msg.sender) porque la versión actual de Ownable no lo requiere.
    constructor(address _arbitrageLogic, address _dexAggregator) {
        arbitrageLogic = ArbitrageLogic(_arbitrageLogic);
        dexAggregator = DexAggregator(_dexAggregator);
    }
    
    function setArbitrageLogic(address _arbitrageLogic) external onlyOwner {
        arbitrageLogic = ArbitrageLogic(_arbitrageLogic);
    }
    
    function setDexAggregator(address _dexAggregator) external onlyOwner {
        dexAggregator = DexAggregator(_dexAggregator);
    }
    
    function addToken(string calldata symbol, address tokenAddress) external onlyOwner {
        tokens[symbol] = tokenAddress;
        emit TokenAdded(symbol, tokenAddress);
    }
    
    function addDex(string calldata name, address routerAddress, uint8 dexType) external onlyOwner {
        dexAggregator.addDex(DexAggregator.DexType(dexType), routerAddress);
        emit DexAdded(name, routerAddress, dexType);
    }
    
    /**
     * @dev Ejecuta arbitraje entre dos DEXes para un par específico.
     * Se espera que el contrato ArbitrageLogic tenga implementada la función 
     * executeMultiRouteArbitrage con la siguiente firma:
     * 
     *   function executeMultiRouteArbitrage(
     *      address tokenA,
     *      address tokenB,
     *      uint256 amountIn,
     *      uint256 dexIndexA,
     *      uint256 dexIndexB,
     *      uint256 slippageTolerance
     *   ) external returns (uint256);
     */
    function executeArbitrageBetweenDexes(
        address tokenA,
        address tokenB,
        uint256 amountIn,
        uint256 dexIndexA,
        uint256 dexIndexB,
        uint256 slippageTolerance
    ) external onlyOwner nonReentrant {
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenA).safeApprove(address(arbitrageLogic), amountIn);
        
        // Llamamos a executeMultiRouteArbitrage, la cual debe estar declarada en ArbitrageLogic
        arbitrageLogic.executeMultiRouteArbitrage(
            tokenA,
            tokenB,
            amountIn,
            dexIndexA,
            dexIndexB,
            slippageTolerance
        );
        
        uint256 finalBalance = IERC20(tokenA).balanceOf(address(this));
        IERC20(tokenA).safeTransfer(owner(), finalBalance);
        
        uint256 profit = finalBalance > amountIn ? finalBalance - amountIn : 0;
        emit ArbitrageExecuted(tokenA, amountIn, profit);
    }
    
    function withdrawTokens(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        IERC20(token).safeTransfer(owner(), balance);
    }
    
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        payable(owner()).transfer(balance);
    }
    
    receive() external payable {}
}
