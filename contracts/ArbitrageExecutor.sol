// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ------------------------
// INTERFACES DE ORÁCULOS (EJ: CHAINLINK)
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
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

// ------------------------
// INTERFAZ ERC20
// ------------------------
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);
}

// Importamos SafeERC20 y ReentrancyGuard de OpenZeppelin para mayor seguridad.
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ArbitrageLogic
 * @dev Contrato que contiene la lógica de arbitraje:
 *      - Consulta de precios con oráculos (Chainlink).
 *      - Ejecución de swaps simples.
 *      - Detección de oportunidades entre dos rutas (por ejemplo, dos DEX distintos).
 *
 * NOTA: La detección de oportunidades en un entorno real se haría off-chain y se invocaría on-chain
 *       cuando la discrepancia sea confirmada; aquí se presenta un ejemplo de flujo completo.
 */
contract ArbitrageLogic is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Dirección del owner (quien puede orquestar las operaciones)
    address public owner;

    // Mapeo de token -> oráculo (precio en USD, 8 decimales, por ejemplo)
    mapping(address => AggregatorV3Interface) public priceFeeds;

    // Instancia de un router (por defecto) para realizar swaps simples
    IUniswapV2Router02 public dexRouter;

    // Dirección de un token base (ej. WETH o WBASE) para enrutar los swaps
    address public WETHorWBASE;

    // Evento para notificar el resultado de la ejecución del arbitraje
    event ArbitrageExecuted(
        address indexed tokenIn,
        uint256 amountIn,
        uint256 finalBalance
    );

    // Modificador que restringe funciones solo al owner
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _router, address _wrappedBase) {
        owner = msg.sender;
        dexRouter = IUniswapV2Router02(_router);
        WETHorWBASE = _wrappedBase;
    }

    // ------------------------------------------------------------------------
    // FUNCIONES ADMINISTRATIVAS
    // ------------------------------------------------------------------------

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /**
     * @dev Configura la dirección del oráculo (ej: Chainlink aggregator) para un token específico.
     */
    function setPriceFeed(address token, address feed) external onlyOwner {
        priceFeeds[token] = AggregatorV3Interface(feed);
    }

    /**
     * @dev Permite cambiar el router DEX si fuera necesario.
     */
    function setDexRouter(address _router) external onlyOwner {
        dexRouter = IUniswapV2Router02(_router);
    }

    // ------------------------------------------------------------------------
    // FUNCIONES DE ARBITRAJE SIMPLE (Misma ruta)
    // ------------------------------------------------------------------------

    /**
     * @dev Función que ejecuta un ejemplo simple de arbitraje:
     *      tokenIn -> WETH/WBASE y de vuelta a tokenIn usando el mismo router.
     *      Se utiliza para comprobar la ganancia mínima.
     *
     * @param tokenIn Dirección del token recibido (ej. USDC).
     * @param amountIn Cantidad de tokens recibidos.
     */
    function executeArbitrage(address tokenIn, uint256 amountIn)
        external
        nonReentrant
    {
        // 1. Verificar que se haya configurado un oráculo para tokenIn
        require(
            address(priceFeeds[tokenIn]) != address(0),
            "No oracle for tokenIn"
        );

        // 2. (Opcional) Consultar precio de tokenIn en USD
        uint256 priceInUSD = getTokenPriceUSD(tokenIn);

        // 3. Dividir la cantidad en dos mitades para realizar el swap
        uint256 half = amountIn / 2;
        require(half > 0, "Insufficient amount for arbitrage");

        // 4. Swap: tokenIn -> WETH/WBASE
        IERC20(tokenIn).safeApprove(address(dexRouter), half);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = WETHorWBASE;
        uint256 deadline = block.timestamp + 300; // 5 minutos

        dexRouter.swapExactTokensForTokens(
            half, // amountIn
            0,    // amountOutMin (debe calcularse en producción)
            path,
            address(this),
            deadline
        );

        // 5. Swap inverso: WETH/WBASE -> tokenIn
        uint256 baseBalance = IERC20(WETHorWBASE).balanceOf(address(this));
        if (baseBalance > 0) {
            IERC20(WETHorWBASE).safeApprove(address(dexRouter), baseBalance);
            address[] memory reversePath = new address[](2);
            reversePath[0] = WETHorWBASE;
            reversePath[1] = tokenIn;

            dexRouter.swapExactTokensForTokens(
                baseBalance,
                0, // amountOutMin (a calcular)
                reversePath,
                address(this),
                deadline
            );
        }

        // 6. Validar ganancia
        uint256 finalBalance = IERC20(tokenIn).balanceOf(address(this));
        require(finalBalance >= amountIn, "Arbitrage did not cover initial amount");

        IERC20(tokenIn).safeTransfer(msg.sender, finalBalance);

        emit ArbitrageExecuted(tokenIn, amountIn, finalBalance);

        // Se podría incorporar priceInUSD en validaciones futuras.
        priceInUSD; // variable sin usar en este ejemplo.
    }

    // ------------------------------------------------------------------------
    // NUEVA FUNCIÓN: ARBITRAJE MULTIRUTA CON CONTROLES DE SLIPPAGE Y VALIDACIÓN DE GANANCIA
    // ------------------------------------------------------------------------

    /**
     * @dev Ejecuta arbitraje comparando dos rutas: 
     *      Se toma tokenIn, se cambia a tokenOut en routerA y luego se vuelve a cambiar a tokenIn en routerB.
     *      Se aplican controles de slippage y se verifica que la ganancia cubra un mínimo deseado.
     *
     * Parámetros:
     * - tokenIn: token de origen (ej. USDC)
     * - tokenOut: token intermedio (ej. WETH)
     * - amountIn: cantidad de tokenIn a invertir
     * - routerA: dirección del primer DEX (ruta forward)
     * - routerB: dirección del segundo DEX (ruta reverse)
     * - minProfit: ganancia mínima (en unidades de tokenIn) que se espera obtener para cubrir costos
     * - slippageTolerance: tolerancia de slippage en base points (por ejemplo, 100 = 1%)
     */
    function executeMultiRouteArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address routerA,
        address routerB,
        uint256 minProfit,
        uint256 slippageTolerance
    ) external nonReentrant onlyOwner {
        // Aprobamos al routerA la cantidad de tokenIn
        IERC20(tokenIn).safeApprove(routerA, amountIn);

        // Ruta forward: tokenIn -> tokenOut
        address[] memory pathForward = new address[](2);
        pathForward[0] = tokenIn;
        pathForward[1] = tokenOut;

        // Consultamos la salida esperada en routerA
        uint256[] memory amountsOutA = IUniswapV2Router02(routerA).getAmountsOut(amountIn, pathForward);
        uint256 expectedOutA = amountsOutA[1];
        // Calculamos el mínimo aceptable (considerando slippageTolerance, expresado en base points, donde 10000 = 100%)
        uint256 amountOutMinForward = (expectedOutA * (10000 - slippageTolerance)) / 10000;

        // Realizamos el swap en routerA: tokenIn -> tokenOut
        IUniswapV2Router02(routerA).swapExactTokensForTokens(
            amountIn,
            amountOutMinForward,
            pathForward,
            address(this),
            block.timestamp + 300
        );

        // Obtenemos el balance de tokenOut obtenido
        uint256 tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance > 0, "No tokenOut obtained");

        // Aprobamos al routerB la totalidad de tokenOut
        IERC20(tokenOut).safeApprove(routerB, tokenOutBalance);

        // Ruta reverse: tokenOut -> tokenIn
        address[] memory pathReverse = new address[](2);
        pathReverse[0] = tokenOut;
        pathReverse[1] = tokenIn;

        // Consultamos la salida esperada en routerB
        uint256[] memory amountsOutB = IUniswapV2Router02(routerB).getAmountsOut(tokenOutBalance, pathReverse);
        uint256 expectedOutB = amountsOutB[1];
        uint256 amountOutMinReverse = (expectedOutB * (10000 - slippageTolerance)) / 10000;

        // Ejecutamos el swap en routerB: tokenOut -> tokenIn
        IUniswapV2Router02(routerB).swapExactTokensForTokens(
            tokenOutBalance,
            amountOutMinReverse,
            pathReverse,
            address(this),
            block.timestamp + 300
        );

        // Balance final en tokenIn
        uint256 finalTokenInBalance = IERC20(tokenIn).balanceOf(address(this));

        // Validamos que la ganancia sea al menos minProfit mayor al monto inicial
        require(
            finalTokenInBalance >= amountIn + minProfit,
            "Arbitrage not profitable"
        );

        // Transferimos el resultado al owner o al contrato de flashloan según convenga
        IERC20(tokenIn).safeTransfer(msg.sender, finalTokenInBalance);

        emit ArbitrageExecuted(tokenIn, amountIn, finalTokenInBalance);
    }

    // ------------------------------------------------------------------------
    // FUNCIONES AUXILIARES
    // ------------------------------------------------------------------------

    /**
     * @dev Obtiene el precio en USD (con 8 decimales) de un token mediante un oráculo Chainlink.
     * @param token Dirección del token.
     * @return Precio en USD con 8 decimales.
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
     * @dev Permite al owner retirar tokens que hayan quedado en el contrato.
     * @param token Dirección del token a retirar.
     */
    function withdrawTokens(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        IERC20(token).safeTransfer(owner, balance);
    }
}
