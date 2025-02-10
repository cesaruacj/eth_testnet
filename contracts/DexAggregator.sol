// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Importar las interfaces
import "./IDexInterfaces.sol"; 
// ^ Asume que guardaste las interfaces en un archivo "IDexInterfaces.sol" 
// con todo el bloque anterior (IUniswapV2Router02, IUniswapV3SwapRouter, etc.)

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DexAggregator
 * @dev Contrato que permite:
 *   - Registrar varios DEXes (con su dirección de router y tipo).
 *   - Consultar la mejor cotización (getBestDexQuote) para un swap.
 *   - Ejecutar el swap en el DEX elegido (swapOnDex).
 *
 *   Ejemplo simplificado: 
 *   en V3 se requiere la 'fee' del pool, en Balancer se requiere 'poolId', etc.
 *   Por lo que la función 'getQuote' no siempre es tan simple.
 */
contract DexAggregator {
    // Definimos tipos de DEX
    enum DexType {
        UniswapV2,
        UniswapV3,
        BalancerV2,
        Maverick,
        SolidlyFork,   // Ej: Aerodrome
        Unknown
        // etc...
    }

    // Estructura para guardar info de cada DEX que registres
    struct DexInfo {
        DexType dexType;
        address router;  // dirección del router (V2, V3, Balancer, etc.)
        bool active;
    }

    address public owner;
    DexInfo[] public dexes;  // array de DEX registrados

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ------------------------------------------------------------------------
    // ADMIN FUNCTIONS
    // ------------------------------------------------------------------------

    /**
     * @dev Agrega un nuevo DEX a la lista
     * @param _dexType Tipo del DEX (UniswapV2, V3, BalancerV2, etc.)
     * @param _router Dirección del router
     */
    function addDex(DexType _dexType, address _router) external onlyOwner {
        dexes.push(DexInfo({
            dexType: _dexType,
            router: _router,
            active: true
        }));
    }

    /**
     * @dev Activa o desactiva un DEX
     */
    function setDexActive(uint256 index, bool _active) external onlyOwner {
        require(index < dexes.length, "Index out of range");
        dexes[index].active = _active;
    }

    /**
     * @dev Permite cambiar owner
     */
    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ------------------------------------------------------------------------
    // CORE: OBTENER LA MEJOR COTIZACIÓN
    // ------------------------------------------------------------------------

    /**
     * @dev Retorna la mejor cantidad de `tokenOut` que podrías recibir
     *      para `amountIn` de `tokenIn`, buscando en todos los DEXes activos.
     *
     * @notice Para Uniswap V2 y forks, podemos usar getAmountsOut directamente.
     *         Para Uniswap V3, necesitaríamos una simulación, o la librería
     *         oficial (no hay getAmountsOut on-chain).
     *         Para Balancer, habría que usar "queryBatchSwap" o "querySwap"
     *         (off-chain) o una aproximación. Aquí todo se muestra en pseudo-lógico.
     *
     * @param tokenIn  Token que vendes
     * @param tokenOut Token que compras
     * @param amountIn Cuánto vendes
     * @return bestAmountOut La mejor cantidad de tokenOut encontrada
     * @return bestDexIndex  El índice en `dexes[]` del DEX que dio esa mejor cantidad
     */
    function getBestDexQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) 
        external 
        view 
        returns (uint256 bestAmountOut, uint256 bestDexIndex)
    {
        bestAmountOut = 0;
        bestDexIndex = 0;

        for (uint256 i = 0; i < dexes.length; i++) {
            DexInfo memory dex = dexes[i];
            if (!dex.active) continue;  // saltar dex inactivos

            uint256 quote = _getQuoteForDex(dex, tokenIn, tokenOut, amountIn);
            if (quote > bestAmountOut) {
                bestAmountOut = quote;
                bestDexIndex = i;
            }
        }
    }

    /**
     * @dev Función interna para obtener la cotización aproximada en cada DEX,
     *      dependiendo de su tipo. Aquí, cada caso se maneja de forma distinta.
     *
     *      En una implementación real, muchas de estas llamadas se hacen off-chain,
     *      o usando librerías específicas. On-chain a veces no hay funciones directas.
     */
    function _getQuoteForDex(
        DexInfo memory dex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256) {
        if (dex.dexType == DexType.UniswapV2) {
            // Llamamos al router V2
            IUniswapV2Router02 router = IUniswapV2Router02(dex.router);

            // getAmountsOut => array: [ amountIn, amountOut ]
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;

            try router.getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                return amounts[1];
            } catch {
                return 0;
            }

        } else if (dex.dexType == DexType.UniswapV3) {
            // No existe getAmountsOut nativo en Uniswap V3 on-chain.
            // Normalmente usarías la librería "Quoter" de Uniswap V3,
            // o harías la simulación off-chain.
            // Aquí ponemos un "try-catch" pseudo-lógico, devolviendo 0 para simplificar.
            // O podríamos tener un "IQuoterV3" interface si lo deseas.
            return 0;

        } else if (dex.dexType == DexType.BalancerV2) {
            // Balancer V2 usa "queryBatchSwap" o "querySwap" en su Vault.
            // On-chain tendrías que usar "simulate" si está disponible, 
            // o de nuevo, lo normal es hacerlo off-chain.
            return 0;

        } else if (dex.dexType == DexType.Maverick) {
            // Maverick no siempre ofrece una función de quote on-chain (depende de la implementación).
            // Se podría simular con un call "staticcall" a "swapExactInput" con `amountOutMin = type(uint256).max`
            // y ver si falla. Muy hacky. Se suele hacer off-chain.
            return 0;

        } else if (dex.dexType == DexType.SolidlyFork) {
            // Ej: Aerodrome. Podrían tener un "getAmountsOut" si es un fork de Solidly
            // Este ejemplo se deja en 0.
            return 0;
        } 

        return 0;
    }

    // ------------------------------------------------------------------------
    // CORE: SWAP EN EL DEX ELEGIDO
    // ------------------------------------------------------------------------

    /**
     * @dev Hace el swap real en el DEX indicado por `dexIndex` (retornado por getBestDexQuote, por ejemplo).
     * @param dexIndex Indice en el array `dexes` del DEX deseado
     * @param tokenIn  Token a vender
     * @param tokenOut Token a comprar
     * @param amountIn Cantidad de tokenIn que vendes
     * @param minOut   Cantidad mínima de tokenOut para no slippage
     * @param recipient Quien recibe los tokens de salida
     */
    function swapOnDex(
        uint256 dexIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address recipient
    ) external {
        require(dexIndex < dexes.length, "Invalid dexIndex");
        DexInfo memory dex = dexes[dexIndex];
        require(dex.active, "DEX not active");

        // Transferir tokensIn desde el msg.sender a este contrato
        // (asegúrate de que msg.sender haya hecho approve al aggregator)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Approve al router
        IERC20(tokenIn).approve(dex.router, amountIn);

        if (dex.dexType == DexType.UniswapV2) {
            IUniswapV2Router02 router = IUniswapV2Router02(dex.router);

            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;

            // deadline de 5 minutos
            uint256 deadline = block.timestamp + 300;

            // swapExactTokensForTokens
            router.swapExactTokensForTokens(
                amountIn,
                minOut,
                path,
                recipient,
                deadline
            );

        } else if (dex.dexType == DexType.UniswapV3) {
            // En Uniswap V3 usaríamos:
            // exactInputSingle(ExactInputSingleParams)
            // Ojo que necesitas la `fee`, y no la hemos definido aquí.
            // Esto es un ejemplo MUY simplificado.
            IUniswapV3SwapRouter router = IUniswapV3SwapRouter(dex.router);

            IUniswapV3SwapRouter.ExactInputSingleParams memory params = 
                IUniswapV3SwapRouter.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: 3000, // 0.3% -> ajusta según el pool
                    recipient: recipient,
                    deadline: block.timestamp + 300,
                    amountIn: amountIn,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0
                });

            router.exactInputSingle(params);

        } else if (dex.dexType == DexType.BalancerV2) {
            // Balancer V2
            IBalancerVault vault = IBalancerVault(dex.router);

            // Debes conocer "poolId", no está en este ejemplo. 
            // Ejemplo simplificado:
            IBalancerVault.SingleSwap memory singleSwap = IBalancerVault.SingleSwap({
                poolId: bytes32(0), // Poner el poolId correcto
                kind: IBalancerVault.SwapKind.GIVEN_IN,
                assetIn: tokenIn,
                assetOut: tokenOut,
                amount: amountIn,
                userData: new bytes(0)
            });

            IBalancerVault.FundManagement memory funds = IBalancerVault.FundManagement({
                sender: address(this),
                fromInternalBalance: false,
                recipient: recipient,
                toInternalBalance: false
            });

            vault.swap(
                singleSwap,
                funds,
                minOut,
                block.timestamp + 300
            );

        } else if (dex.dexType == DexType.Maverick) {
            // Ejemplo
            IMaverick mv = IMaverick(dex.router);
            mv.swapExactInput(
                tokenIn,
                tokenOut,
                amountIn,
                minOut,
                recipient,
                block.timestamp + 300
            );

        } else if (dex.dexType == DexType.SolidlyFork) {
            // Ej: Aerodrome (Solidly style). 
            // La lógica de swap es distinta (swapExactTokensForTokensSupportingFeeOnTransfer?).
            // Requeriría su propia interfaz. Ejemplo:
            // router.swapExactTokensForTokensSimple(...);
        } else {
            revert("DEX type not supported yet");
        }
    }
}
