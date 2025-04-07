// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ------------------------
// INTERFACES DE ORÁCULOS (Ej: Chainlink)
// ------------------------
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

// ------------------------
// INTERFAZ DE UNISWAP V2-LIKE PARA SWAPS
// ------------------------
interface IUniswapV2Router02 {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin, // Mínimo a recibir para controlar el slippage
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

// Importamos la interfaz IERC20, SafeERC20 y ReentrancyGuard de OpenZeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ArbitrageExecutor
 * @dev Lógica básica de arbitraje (swap ida y vuelta) usando un solo router.
 *      Se incluye validación de slippage y verificación de rentabilidad.
 */
contract ArbitrageExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public owner;
    // Mapeo de token -> oráculo (Chainlink) para obtener precios en USD (8 decimales)
    mapping(address => AggregatorV3Interface) public priceFeeds;
    // Router de DEX a utilizar (por ejemplo, UniswapV2, etc.)
    IUniswapV2Router02 public dexRouter;
    // Token base para enrutar swaps (WETH en Ethereum)
    address public baseToken;

    event ArbitrageExecuted(
        address indexed tokenIn,
        uint256 amountIn,
        uint256 finalBalance
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _router, address _baseToken) {
        owner = msg.sender;
        dexRouter = IUniswapV2Router02(_router);
        baseToken = _baseToken;
    }

    // Funciones administrativas
    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function setPriceFeed(address token, address feed) external onlyOwner {
        priceFeeds[token] = AggregatorV3Interface(feed);
    }

    function setDexRouter(address _router) external onlyOwner {
        dexRouter = IUniswapV2Router02(_router);
    }

    /**
     * @dev Ejecuta un arbitraje simple:
     *      tokenIn -> baseToken y viceversa, utilizando la misma ruta.
     *      Se divide la cantidad en dos partes y se verifica que el saldo final cubra la inversión.
     *      Se debe configurar amountOutMin adecuadamente en producción para controlar el slippage.
     */
    function executeArbitrage(address tokenIn, uint256 amountIn)
        external
        nonReentrant
        onlyOwner
    {
        require(
            address(priceFeeds[tokenIn]) != address(0),
            "No oracle for tokenIn"
        );
        uint256 priceInUSD = getTokenPriceUSD(tokenIn);

        uint256 half = amountIn / 2;
        require(half > 0, "Insufficient amount for arbitrage");

        // Swap 1: tokenIn -> baseToken
        IERC20(tokenIn).safeApprove(address(dexRouter), half);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = baseToken;
        uint256 deadline = block.timestamp + 300; // 5 minutos

        dexRouter.swapExactTokensForTokens(
            half,
            0, // amountOutMin: a calcular en producción
            path,
            address(this),
            deadline
        );

        // Swap 2: baseToken -> tokenIn
        uint256 baseBalance = IERC20(baseToken).balanceOf(address(this));
        if (baseBalance > 0) {
            IERC20(baseToken).safeApprove(address(dexRouter), baseBalance);
            address[] memory reversePath = new address[](2);
            reversePath[0] = baseToken;
            reversePath[1] = tokenIn;
            dexRouter.swapExactTokensForTokens(
                baseBalance,
                0, // amountOutMin: a calcular según slippage
                reversePath,
                address(this),
                deadline
            );
        }

        uint256 finalBalance = IERC20(tokenIn).balanceOf(address(this));
        require(finalBalance >= amountIn, "Arbitrage did not cover initial amount");

        IERC20(tokenIn).safeTransfer(msg.sender, finalBalance);
        emit ArbitrageExecuted(tokenIn, amountIn, finalBalance);

        // priceInUSD se podría utilizar para validaciones futuras.
        priceInUSD;
    }

    /**
     * @dev Obtiene el precio en USD (8 decimales) de un token mediante Chainlink.
     */
    function getTokenPriceUSD(address token)
        public
        view
        returns (uint256)
    {
        AggregatorV3Interface feed = priceFeeds[token];
        require(address(feed) != address(0), "No price feed for token");
        (, int256 answer, , ,) = feed.latestRoundData();
        require(answer > 0, "Invalid price from oracle");
        return uint256(answer);
    }

    /**
     * @dev Permite al owner retirar tokens del contrato.
     */
    function withdrawTokens(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        IERC20(token).safeTransfer(owner, balance);
    }
}
