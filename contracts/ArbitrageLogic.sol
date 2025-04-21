// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
 * @title ArbitrageLogicUpgradeable
 * @dev Lógica avanzada de arbitraje para usar con flash loans.
 *      Se apoya en DexAggregator para seleccionar la mejor ruta entre múltiples DEX.
 */
contract ArbitrageLogicUpgradeable is 
    Initializable,
    ReentrancyGuardUpgradeable, 
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;

    DexAggregator public dexAggregator;
    address public flashLoan;
    mapping(address => address) public priceFeeds;

    event ArbitrageExecuted(
        address indexed tokenIn,
        uint256 amountIn,
        uint256 finalBalance,
        uint256 profit
    );

    // Reemplaza constructor con initialize
    function initialize(address _dexAggregator) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init();
        
        dexAggregator = DexAggregator(_dexAggregator);
    }

    function setDexAggregator(address _dexAggregator) external onlyOwner {
        dexAggregator = DexAggregator(_dexAggregator);
    }

    function setPriceFeed(address _token, address _priceFeed) external onlyOwner {
        priceFeeds[_token] = _priceFeed;
    }

    function setFlashLoanAddress(address _flashLoan) external onlyOwner {
        flashLoan = _flashLoan;
    }

    /**
     * @dev Ejecuta un arbitraje simple: tokenIn -> (swap en el DEX óptimo) -> tokenIn.
     *      Esta función consulta la mejor ruta en DexAggregator, ejecuta el swap y verifica rentabilidad.
     */
    function executeArbitrage(address tokenIn, uint256 amountIn) public nonReentrant {
        require(msg.sender == flashLoan, "Only FlashLoan can call");
        
        // 1. Calcular el premium (0.09% del préstamo)
        uint256 premium = (amountIn * 9) / 10000;
        uint256 requiredAmount = amountIn + premium;
        
        // 2. Ejecutar swap en el mejor DEX (o simular para validación)
        // [... Código de swap existente ...]
        
        // 3. Transferir al menos el monto requerido de vuelta a FlashLoanSepolia
        IERC20(tokenIn).transfer(flashLoan, requiredAmount);
        
        // 4. Cualquier token adicional es ganancia para ArbitrageLogic
        uint256 remainingBalance = IERC20(tokenIn).balanceOf(address(this));
        uint256 profit = remainingBalance > 0 ? remainingBalance : 0;
        
        emit ArbitrageExecuted(tokenIn, amountIn, requiredAmount, profit);
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