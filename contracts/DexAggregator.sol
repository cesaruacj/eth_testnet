// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Interfaces para Uniswap V2
interface IUniswapV2Router02 {
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

// Interfaces para Uniswap V3
interface IQuoterV2 {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut, uint160, uint32, uint256);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract DexAggregator {
    using SafeERC20 for IERC20;

    enum DexType { UniswapV2, UniswapV3, SushiSwap }
    
    // Fees para Uniswap V3
    uint24 public constant FEE_LOW = 500;      // 0.05%
    uint24 public constant FEE_MEDIUM = 3000;  // 0.3%
    uint24 public constant FEE_HIGH = 10000;   // 1.0%

    struct DexInfo {
        DexType dexType;
        address router; 
        bool active;
    }
    
    struct ArbitragePath {
        address[] tokens;      // La ruta completa de tokens [tokenA, tokenB, tokenC, ..., tokenA]
        uint256[] dexIndices;  // Qué DEX usar para cada paso
        uint24[] fees;         // Fees para Uniswap V3 (0 para V2)
    }

    address public owner;
    address public quoterV3;   // Para cotizaciones en Uniswap V3
    
    DexInfo[] public dexes;

    // Caché de cotizaciones para gas-optimization
    mapping(bytes32 => uint256) public lastQuotes;
    mapping(bytes32 => uint256) public quoteTimestamps;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _quoterV3) {
        owner = msg.sender;
        quoterV3 = _quoterV3;
    }

    function addDex(DexType _dexType, address _router) external onlyOwner {
        dexes.push(DexInfo({
            dexType: _dexType,
            router: _router,
            active: true
        }));
    }

    function setDexActive(uint256 index, bool _active) external onlyOwner {
        require(index < dexes.length, "Index out of range");
        dexes[index].active = _active;
    }

    /**
     * @dev Obtiene la mejor cotización para un swap entre dos tokens.
     */
    function getBestDexQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 bestAmountOut, uint256 bestDexIndex) {
        bestAmountOut = 0;
        bestDexIndex = 0;
        
        for (uint256 i = 0; i < dexes.length; i++) {
            if (!dexes[i].active) continue;
            
            uint256 amountOut = 0;
            
            // UniswapV2, SushiSwap y otros compatibles con V2
            if (dexes[i].dexType == DexType.UniswapV2 || dexes[i].dexType == DexType.SushiSwap) {
                IUniswapV2Router02 router = IUniswapV2Router02(dexes[i].router);
                address[] memory path = new address[](2);
                path[0] = tokenIn;
                path[1] = tokenOut;
                
                try router.getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                    amountOut = amounts[1];
                } catch {
                    continue;
                }
            }
            // UniswapV3 requiere un contrato de cotizador externo
            else if (dexes[i].dexType == DexType.UniswapV3) {
                // Para V3 normalmente usarías el quoter, pero aquí lo omitimos
                // porque es una llamada no-view y necesitaríamos un quoter simulado
                continue;
            }
            
            if (amountOut > bestAmountOut) {
                bestAmountOut = amountOut;
                bestDexIndex = i;
            }
        }
    }

    /**
     * @dev Ejecuta un swap en un DEX específico
     */
    function swapOnDex(
        uint256 dexIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 slippageTolerance // en base points: 100 = 1%
    ) public returns (uint256 amountOut) {
        require(dexIndex < dexes.length, "Invalid dex index");
        DexInfo memory dex = dexes[dexIndex];
        require(dex.active, "DEX not active");
        
        // Obtener el saldo antes del swap
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // UniswapV2, SushiSwap
        if (dex.dexType == DexType.UniswapV2 || dex.dexType == DexType.SushiSwap) {
            IUniswapV2Router02 router = IUniswapV2Router02(dex.router);
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
            
            // Calcular el mínimo aceptable con slippage
            uint256[] memory amounts = router.getAmountsOut(amountIn, path);
            uint256 amountOutMin = (amounts[1] * (10000 - slippageTolerance)) / 10000;
            
            // Aprobar al router para gastar tokens
            IERC20(tokenIn).safeApprove(address(router), amountIn);
            
            // Ejecutar el swap
            router.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300 // 5 minutos de deadline
            );
        }
        // UniswapV3
        else if (dex.dexType == DexType.UniswapV3) {
            ISwapRouter router = ISwapRouter(dex.router);
            
            // Para V3 necesitaríamos determinar el fee óptimo
            uint24 fee = FEE_MEDIUM; // Default 0.3%
            
            // Estimación del mínimo que queremos recibir
            uint256 amountOutMin = estimateV3Output(tokenIn, tokenOut, fee, amountIn);
            amountOutMin = (amountOutMin * (10000 - slippageTolerance)) / 10000;
            
            // Aprobar al router para gastar tokens
            IERC20(tokenIn).safeApprove(address(router), amountIn);
            
            // Construir parámetros para el swap
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });
            
            // Ejecutar swap
            router.exactInputSingle(params);
        }
        
        // Calcular cantidad recibida
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        
        return amountOut;
    }
    
    /**
     * @dev Estima la salida para un swap en Uniswap V3 usando el quoter
     */
    function estimateV3Output(
        address tokenIn,
        address tokenOut,
        uint24 fee, 
        uint256 amountIn
    ) internal returns (uint256) {
        bytes32 quoteKey = keccak256(abi.encodePacked(tokenIn, tokenOut, fee, amountIn));
        
        // Check cache (valid for 3 blocks)
        if (quoteTimestamps[quoteKey] + 3 > block.number) {
            return lastQuotes[quoteKey];
        }

        if (quoterV3 == address(0)) return 0;
        
        try IQuoterV2(quoterV3).quoteExactInputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            0 // sin límite de precio
        ) returns (uint256 amountOut, uint160, uint32, uint256) {
            // Update cache
            lastQuotes[quoteKey] = amountOut;
            quoteTimestamps[quoteKey] = block.number;
            return amountOut;
        } catch {
            return 0;
        }
    }
    
    /**
     * @dev Ejecuta una ruta completa de arbitraje
     * tokens[0] debe ser igual a tokens[tokens.length-1] para formar un ciclo completo
     */
    function executeArbitragePath(ArbitragePath calldata path, uint256 startAmount) external returns (uint256) {
        require(path.tokens.length >= 3, "Path too short");  
        require(path.tokens[0] == path.tokens[path.tokens.length-1], "Not a cycle");
        require(path.tokens.length - 1 == path.dexIndices.length, "Invalid path structure");
        require(path.dexIndices.length == path.fees.length, "Path lengths don't match");
        
        uint256 currentAmount = startAmount;
        
        // Transferir el token inicial al contrato
        IERC20(path.tokens[0]).safeTransferFrom(msg.sender, address(this), startAmount);
        
        // Ejecutar la ruta de swaps
        for (uint i = 0; i < path.dexIndices.length; i++) {
            address tokenIn = path.tokens[i];
            address tokenOut = path.tokens[i+1];
            uint256 dexIndex = path.dexIndices[i];
            
            // Para V3 necesitaríamos usar el fee correspondiente
            // Para V2 es ignorado
            uint24 fee = path.fees[i];
            
            // Swap en el DEX específico
            if (dexes[dexIndex].dexType == DexType.UniswapV3) {
                // Aquí manejaríamos el caso especial de V3 con el fee
                // Por ahora lo simulamos con el método normal
                currentAmount = swapOnDexWithFee(dexIndex, tokenIn, tokenOut, currentAmount, 100, fee);
            } else {
                // Swap estándar para V2
                currentAmount = swapOnDex(dexIndex, tokenIn, tokenOut, currentAmount, 100);
            }
        }
        
        // Transferir las ganancias de vuelta al remitente
        IERC20(path.tokens[0]).safeTransfer(msg.sender, currentAmount);
        
        return currentAmount;
    }
    
    /**
     * @dev Versión especial de swapOnDex para Uniswap V3 con fee específico
     */
    function swapOnDexWithFee(
        uint256 dexIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 slippageTolerance,
        uint24 fee
    ) internal returns (uint256) {
        require(dexes[dexIndex].dexType == DexType.UniswapV3, "Not a V3 DEX");
        
        ISwapRouter router = ISwapRouter(dexes[dexIndex].router);
        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        
        // Estimación del mínimo que queremos recibir
        uint256 amountOutMin = estimateV3Output(tokenIn, tokenOut, fee, amountIn);
        amountOutMin = (amountOutMin * (10000 - slippageTolerance)) / 10000;
        
        // Aprobar al router para gastar tokens
        IERC20(tokenIn).safeApprove(address(router), amountIn);
        
        // Construir parámetros para el swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });
        
        // Ejecutar swap
        router.exactInputSingle(params);
        
        // Calcular cantidad recibida
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }
    
    // Función de recuperación para tokens atrapados en caso de error
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}