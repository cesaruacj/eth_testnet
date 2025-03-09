// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DexAggregator.sol";

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title ArbitrageLogic
 * @dev Lógica avanzada de arbitraje para usar con flash loans.
 *      Se apoya en DexAggregator para seleccionar la mejor ruta entre múltiples DEX.
 */
contract ArbitrageLogic is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public owner;
    DexAggregator public dexAggregator;
    
    // Mapping token => dirección del oráculo (Chainlink)
    mapping(address => address) public priceFeeds;
    
    event ArbitrageExecuted(
        address indexed tokenIn,
        uint256 amountIn,
        uint256 finalBalance,
        uint256 profit
    );
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _dexAggregator) {
        owner = msg.sender;
        dexAggregator = DexAggregator(_dexAggregator);
    }
    
    function setOwner(address _newOwner) external onlyOwner {
        owner = _newOwner;
    }
    
    function setDexAggregator(address _dexAggregator) external onlyOwner {
        dexAggregator = DexAggregator(_dexAggregator);
    }
    
    function setPriceFeed(address _token, address _priceFeed) external onlyOwner {
        priceFeeds[_token] = _priceFeed;
    }
    
    /**
     * @dev Ejecuta un arbitraje simple: tokenIn -> (swap en el DEX óptimo) -> tokenIn.
     *      Esta función consulta la mejor ruta en DexAggregator, ejecuta el swap y verifica rentabilidad.
     */
    function executeArbitrage(address tokenIn, uint256 amountIn)
        public
        nonReentrant
        onlyOwner
    {
        // Verificar que hay oráculo para tokenIn
        require(priceFeeds[tokenIn] != address(0), "No oracle for tokenIn");
        uint256 priceInUSD = getTokenPriceUSD(tokenIn);
        uint256 initialBalance = IERC20(tokenIn).balanceOf(address(this));
        require(initialBalance >= amountIn, "Insufficient balance");

        // Consulta la mejor ruta para el swap de tokenIn a tokenIn (ciclo) usando DexAggregator.
        (uint256 bestAmountOut, uint256 bestDexIndex) = dexAggregator.getBestDexQuote(
            tokenIn,
            tokenIn, // En un ciclo real se usaría un token intermedio; aquí se simplifica
            amountIn
        );
        // Calculamos el mínimo aceptable con slippage
        uint256 slippageTolerance = 100; // 1%
        
        // Ejecutamos el swap usando DexAggregator
        dexAggregator.swapOnDex(
            bestDexIndex,
            tokenIn,
            tokenIn,
            amountIn,
            slippageTolerance
        );
        
        // Verificar que se obtuvo ganancia
        uint256 finalBalance = IERC20(tokenIn).balanceOf(address(this));
        require(finalBalance >= amountIn, "Arbitrage did not cover initial amount");
        uint256 profit = finalBalance - amountIn;
        require(profit > 0, "Arbitrage not profitable");
        
        emit ArbitrageExecuted(tokenIn, amountIn, finalBalance, profit);
        
        // Using priceInUSD to avoid compiler warning
        if (priceInUSD == 0) {
            // This code will never execute, but prevents the unused variable warning
            revert("Price should not be zero");
        }
    }
    
    /**
     * @dev Ejecuta arbitraje multiruta utilizando DexAggregator.
     *      En una implementación real, se evaluarían distintas rutas.
     *      Aquí se llama a executeArbitrage y retorna la ganancia (stub).
     */
    function executeMultiRouteArbitrage(
        address tokenA,
        address /* tokenB */,  // Commented out unused parameter
        uint256 amountIn,
        uint256 /* dexIndexA */,  // Commented out unused parameter
        uint256 /* dexIndexB */,  // Commented out unused parameter
        uint256 /* slippageTolerance */  // Commented out unused parameter
    ) external onlyOwner nonReentrant returns (uint256 profit) {
        executeArbitrage(tokenA, amountIn);
        uint256 finalBalance = IERC20(tokenA).balanceOf(address(this));
        profit = finalBalance > amountIn ? finalBalance - amountIn : 0;
    }
    
    /**
     * @dev Obtiene el precio en USD (8 decimales) de un token mediante Chainlink.
     */
    function getTokenPriceUSD(address token)
        public
        view
        returns (uint256)
    {
        address feedAddress = priceFeeds[token];
        require(feedAddress != address(0), "No price feed for token");
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);
        (, int256 answer, , ,) = feed.latestRoundData();
        require(answer > 0, "Invalid price from oracle");
        return uint256(answer);
    }
}