# Basechain Flash Loan Arbitrage System

This project implements a cryptocurrency arbitrage system using flash loans on Basechain. The system monitors price differences between various DEXes (Aerodrome, BaseSwap, Uniswap V3, etc.) and executes arbitrage trades when profitable opportunities are found.

## Architecture

The system consists of several key components:

1. **ArbitrageSystem**: The main contract that orchestrates the entire arbitrage process.
2. **FlashLoanBaseSepolia**: Handles flash loan requests from Aave V3.
3. **ArbitrageLogic**: Contains the core arbitrage logic to execute trades across different DEXes.
4. **DexAggregator**: Allows registering and interacting with multiple DEXes to find the best trading opportunities.

## Prerequisites

- Node.js and npm
- Hardhat
- An RPC URL for Basechain (mainnet or testnet)
- Private key with some ETH on Basechain for deployment

## Installation

```shell
# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

## Deployment

To deploy the arbitrage system to Basechain:

```shell
# Deploy to Base Sepolia testnet
npx hardhat run scripts/deploy-arbitrage.ts --network base-sepolia

# Deploy to Base mainnet
npx hardhat run scripts/deploy-arbitrage.ts --network base
```

## Monitoring Arbitrage Opportunities

After deployment, you can monitor arbitrage opportunities using the provided script:

```shell
# Update the deployed contract address in scripts/monitor-arbitrage.ts
# Then run:
npx hardhat run scripts/monitor-arbitrage.ts --network base
```

## How It Works

1. The monitoring script continuously checks price differences between DEXes.
2. When a profitable opportunity is found (after accounting for gas costs and flash loan fees), the script can trigger the arbitrage execution.
3. The ArbitrageSystem contract borrows tokens via a flash loan from Aave.
4. The ArbitrageLogic contract executes the trades across different DEXes to capture the price difference.
5. The flash loan is repaid with a small fee, and the profit is kept in the contract.
6. The owner can withdraw the profits at any time.

## Supported DEXes

- Aerodrome (Solidly fork)
- BaseSwap (Uniswap V2 fork)
- Uniswap V3
- More can be added through the DexAggregator

## Supported Tokens

The system works with any ERC20 token available on Basechain, but the following are pre-configured:

- WETH
- USDC
- DAI
- USDbC

## Security Considerations

- The contracts use OpenZeppelin's SafeERC20, ReentrancyGuard, and Ownable for security.
- Always test thoroughly on testnet before deploying to mainnet.
- Monitor gas prices to ensure arbitrage remains profitable.
- Be aware of MEV (Miner Extractable Value) risks.

## License

MIT
