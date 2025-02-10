// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/* -----------------------------------------------------
 * Ejemplo de interfaces para varios DEXes
 * -----------------------------------------------------
 */

// 1. Uniswap V2 (y forks tipo PancakeSwap V2, SushiSwap V2, etc.)
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

// 2. Uniswap V3 (y forks tipo Sushiswap V3, Pancake V3)
interface IUniswapV3SwapRouter {
    // La interfaz oficial está en @uniswap/v3-periphery
    // Sólo agregamos lo mínimo para un swap simple, p.ej. exactInputSingle
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

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
    
    // Si quieres calcular cuánto recibirías, normalmente se usa la función "quote",
    // o simular la llamada off-chain. On-chain, deberías hacer tu propia estimación
    // o usar librerías uniswap v3. No hay getAmountsOut como en V2.
}

// 3. Balancer V2 (simplificado)
interface IBalancerVault {
    enum SwapKind { GIVEN_IN, GIVEN_OUT }

    struct SingleSwap {
        bytes32 poolId;
        IBalancerVault.SwapKind kind;
        address assetIn;
        address assetOut;
        uint256 amount;
        bytes userData;
    }

    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address recipient;
        bool toInternalBalance;
    }

    function swap(
        SingleSwap calldata singleSwap,
        FundManagement calldata funds,
        uint256 limit,
        uint256 deadline
    ) external payable returns (uint256 amountCalculated);
}

// 4. Maverick (ejemplo, su interfaz puede variar)
interface IMaverick {
    // Cada DEX tiene su propia forma de swap. Ejemplo hipotético:
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);

    // Podrías necesitar también una función de quote, etc.
}

// 5. Alien Base, Aerodrome, BaseSwap, SwapBased, etc.
// Muchos son forks de Uniswap V2/V3. 
// P.ej. Aerodrome es un fork de Solidly, que tiene otra interfaz, 
// pero la idea es la misma: un router con una función de swap.
