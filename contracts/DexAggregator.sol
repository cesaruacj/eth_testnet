// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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

contract DexAggregator {
    using SafeERC20 for IERC20;

    enum DexType { UniswapV2, UniswapV3, Aerodrome, Unknown }

    struct DexInfo {
        DexType dexType;
        address router; // Dirección del router del DEX
        bool active;
    }

    address public owner;
    DexInfo[] public dexes;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
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
     * @dev Obtiene la mejor cotización para un swap usando DEX con interfaz Uniswap V2-like.
     * Retorna la cantidad de tokenOut que se obtendría y el índice del DEX.
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
            if (dexes[i].dexType == DexType.UniswapV2 || dexes[i].dexType == DexType.Aerodrome) {
                IUniswapV2Router02 router = IUniswapV2Router02(dexes[i].router);
                address[] memory path = new address[](2);
                path[0] = tokenIn;
                path[1] = tokenOut;
                try router.getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
                    if (amounts[1] > bestAmountOut) {
                        bestAmountOut = amounts[1];
                        bestDexIndex = i;
                    }
                } catch {
                    // Si falla, ignora este DEX
                    continue;
                }
            } else if (dexes[i].dexType == DexType.UniswapV3) {
                // Para Uniswap V3, normalmente se usa un contrato Quoter (no implementado aquí)
                // Por simplicidad, lo dejamos en 0.
                continue;
            }
        }
    }

    /**
     * @dev Ejecuta el swap en el DEX indicado por dexIndex.
     * Calcula el mínimo de salida aplicando slippage.
     */
    function swapOnDex(
        uint256 dexIndex,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 slippageTolerance // en base points: 100 = 1%
    ) external returns (uint256 amountOut) {
        require(dexIndex < dexes.length, "Invalid dex index");
        DexInfo memory dex = dexes[dexIndex];
        require(dex.active, "DEX not active");
        
        if (dex.dexType == DexType.UniswapV2 || dex.dexType == DexType.Aerodrome) {
            IUniswapV2Router02 router = IUniswapV2Router02(dex.router);
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
            
            // Get balance before swap
            uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
            
            // Calculate minimum output with slippage
            uint256[] memory amounts = router.getAmountsOut(amountIn, path);
            uint256 amountOutMin = (amounts[1] * (10000 - slippageTolerance)) / 10000;
            
            // Approve router to spend tokens
            IERC20(tokenIn).safeApprove(address(router), amountIn);
            
            // Execute the swap
            router.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300 // 5 minute deadline
            );
            
            // Calculate the amount received
            uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
            amountOut = balanceAfter - balanceBefore;
        }
        
        return amountOut;
    }
}