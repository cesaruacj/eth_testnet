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
    address public flashLoan;
    DexAggregator public dexAggregator;
    
    // Mapping token => dirección del oráculo (Chainlink)
    mapping(address => address) public priceFeeds;
    
    event ArbitrageExecuted(
        address indexed tokenIn,
        uint256 amountIn,
        uint256 finalBalance,
        uint256 profit
    );
    event SwapInitiated(address tokenIn, uint256 amount, address dex);
    event SwapCompleted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event PremiumCalculated(uint256 loanAmount, uint256 premium, uint256 totalRequired);
    event FundsTransferred(address token, address from, address to, uint256 amount);
    event ArbitrageQuoteData(uint256 bestAmountOut, uint256 requiredAmount, string status);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Modificar para permitir tanto al owner como al flashLoan
    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == flashLoan, "Not owner");
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
    
    function setPriceFeed(address _token, address _priceFeed) external onlyAuthorized {
        priceFeeds[_token] = _priceFeed;
    }

    // Añadir para configurar FlashLoan
    function setFlashLoanAddress(address _flashLoan) external onlyOwner {
        flashLoan = _flashLoan;
    }
    
    /**
     * @dev Ejecuta un arbitraje simple: tokenIn -> (swap en el DEX óptimo) -> tokenIn.
     *      Esta función consulta la mejor ruta en DexAggregator, ejecuta el swap y verifica rentabilidad.
     */
    function executeArbitrage(address tokenIn, uint256 amountIn) public nonReentrant {
        require(msg.sender == flashLoan, "Only FlashLoan can call");

        // 1. Calcular el premium (0.05% del préstamo)
        uint256 premium = (amountIn * 5) / 10000;
        uint256 requiredAmount = amountIn + premium;

        // 2. Consultar la mejor ruta y cotización en DexAggregator
        (uint256 bestAmountOut, uint256 bestDexIndex) = dexAggregator.getBestDexQuote(
            tokenIn,
            tokenIn,
            amountIn
        );

        // 3. Verificar si la ganancia cubre el premium
        require(bestAmountOut > requiredAmount, "No profitable arbitrage opportunity");

        // 4. Aprobar tokens al DexAggregator y ejecutar el swap
        IERC20(tokenIn).approve(address(dexAggregator), amountIn);
        uint256 receivedAmount = dexAggregator.swapOnDex(
            bestDexIndex,
            tokenIn,
            tokenIn,
            amountIn,
            bestAmountOut * 995 / 1000 // 0.5% slippage tolerance
        );

        // 5. Transferir el préstamo + premium de vuelta a FlashLoanSepolia
        IERC20(tokenIn).transfer(flashLoan, requiredAmount);

        // 6. Cualquier token adicional es ganancia para ArbitrageLogic
        uint256 remainingBalance = IERC20(tokenIn).balanceOf(address(this));
        uint256 profit = remainingBalance > 0 ? remainingBalance : 0;

        emit ArbitrageExecuted(tokenIn, amountIn, receivedAmount, profit);
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
     * @dev Ejecuta arbitraje directo desde una wallet externa (no flash loan)
     * Esta función permite que cualquier usuario ejecute arbitraje si encuentra oportunidad
     */
    function executeDirectArbitrage(address tokenIn, uint256 amountIn) 
        external 
        nonReentrant 
        returns (uint256)
    {
        // Transfer tokens from caller (already approved)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Get initial balance after transfer
        uint256 initialBalance = IERC20(tokenIn).balanceOf(address(this));
        
        // Consulta la mejor ruta para el swap
        (uint256 bestAmountOut, uint256 bestDexIndex) = dexAggregator.getBestDexQuote(
            tokenIn,
            tokenIn, 
            amountIn
        );
        
        // Slippage tolerance
        uint256 slippageTolerance = 100; // 1%
        
        // Execute the swap on the best DEX
        dexAggregator.swapOnDex(
            bestDexIndex,
            tokenIn,
            tokenIn,
            amountIn,
            slippageTolerance
        );
        
        // Calculate profit
        uint256 finalBalance = IERC20(tokenIn).balanceOf(address(this));
        uint256 profit = finalBalance > initialBalance ? finalBalance - initialBalance : 0;
        
        emit ArbitrageExecuted(tokenIn, amountIn, finalBalance, profit);
        
        // Return tokens to caller
        IERC20(tokenIn).transfer(msg.sender, finalBalance);
        
        return profit;
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