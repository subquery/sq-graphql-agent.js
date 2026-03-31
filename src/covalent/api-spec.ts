// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

/**
 * Covalent (GoldRush) API Specification for LLM consumption
 *
 * This serves as the "schema" for the REST API, similar to how
 * GraphQL schema works for GraphQL endpoints.
 */

export function getCovalentApiSpec(): string {
  return `# Covalent (GoldRush) Blockchain Data API Specification

## Base URL
https://api.covalenthq.com/v1

## Authentication
Bearer token in Authorization header: "Bearer YOUR_API_KEY"
API keys start with "cqt_" or "ckey_"

## Response Format
All responses follow this structure:
{
  "data": { ... actual data ... },
  "error": false,
  "error_message": null,
  "error_code": null
}

## Chain Names (CRITICAL - case-sensitive)
Use exact chain names from the table below:

| Common Name | Chain Name | Chain ID |
|-------------|------------|----------|
| Ethereum | eth-mainnet | 1 |
| Polygon | matic-mainnet | 137 |
| Base | base-mainnet | 8453 |
| BSC | bsc-mainnet | 56 |
| Arbitrum | arbitrum-mainnet | 42161 |
| Optimism | optimism-mainnet | 10 |
| Avalanche | avalanche-mainnet | 43114 |
| Bitcoin | btc-mainnet | 20090103 |
| Solana | solana-mainnet | 1399811149 |
| Fantom | fantom-mainnet | 250 |
| zkSync Era | zksync-mainnet | 324 |
| Linea | linea-mainnet | 59144 |
| Scroll | scroll-mainnet | 534352 |
| Mantle | mantle-mainnet | 5000 |

## Endpoint Categories

### 1. BALANCE ENDPOINTS

#### Get Token Balances for Wallet
GET /v1/{chainName}/address/{walletAddress}/balances_v2/
- chainName: Chain name (e.g., eth-mainnet)
- walletAddress: Wallet address or ENS name (e.g., vitalik.eth)
Query params: nft, no-nft-fetch, quote-currency

#### Get Native Token Balance (Lightweight)
GET /v1/{chainName}/address/{walletAddress}/balances_native/
- Returns only native token (ETH, MATIC, etc.)

#### Get Historical Token Balances
GET /v1/{chainName}/address/{walletAddress}/historical_balances_v2/
Query params: starting-block, ending-block

#### Get ERC20 Transfers for Address
GET /v1/{chainName}/address/{walletAddress}/transfers_v2/
Query params: contract-address, starting-block, ending-block, page-size, page-number

#### Get Token Holders
GET /v1/{chainName}/tokens/{contractAddress}/token_holders_v2/
Query params: page-size, page-number

#### Get Historical Portfolio Value
GET /v1/{chainName}/address/{walletAddress}/portfolio_v2/
Query params: days, quote-currency

### 2. TRANSACTION ENDPOINTS

#### Get Transactions for Address
GET /v1/{chainName}/address/{walletAddress}/transactions_v3/
Query params: starting-block, ending-block, page-size, page-number, with-internal, with-decode

#### Get Transaction by Hash
GET /v1/{chainName}/transaction_v2/{transactionHash}/

#### Get Transaction Summary
GET /v1/{chainName}/address/{walletAddress}/transactions_summary/

#### Get Block Transactions
GET /v1/{chainName}/block/{blockHeight}/transactions_v3/

### 3. NFT ENDPOINTS

#### Get NFTs for Address
GET /v1/{chainName}/address/{walletAddress}/nft/
Query params: no-spam, with-uncached

#### Get NFT Collection Metadata
GET /v1/{chainName}/nft/{contractAddress}/metadata/

#### Get NFT Token IDs for Collection
GET /v1/{chainName}/nft/{contractAddress}/tokens/
Query params: page-size, page-number

#### Get NFT Transactions for Token
GET /v1/{chainName}/nft/{contractAddress}/token/{tokenId}/transactions/

#### Check NFT Ownership
GET /v1/{chainName}/nft/{contractAddress}/tokens/{tokenId}/owners/{walletAddress}/

### 4. PRICING ENDPOINTS

#### Get Token Prices
GET /v1/pricing/historical_by_addresses_v2/{chainName}/{quoteCurrency}/{contractAddresses}/

#### Get Historical Token Prices
GET /v1/pricing/historical_v2/{chainName}/{quoteCurrency}/{contractAddress}/
Query params: from, to

### 5. SECURITY (APPROVALS) ENDPOINTS

#### Get Token Approvals
GET /v1/{chainName}/approvals/{walletAddress}/
Query params: contract-addresses, quote-currency

### 6. CROSS-CHAIN ENDPOINTS

#### Get Address Activity (Which chains a wallet is active on)
GET /v1/address/{walletAddress}/activity/

#### Get Multi-Chain Balances
GET /v1/address/{walletAddress}/balances_v2/
Query params: chains (comma-separated chain names)

### 7. UTILITY ENDPOINTS

#### Get Block
GET /v1/{chainName}/block_v2/{blockHeight}/

#### Get Block Heights by Date
GET /v1/{chainName}/block/{startDate}/{endDate}/

#### Get Log Events by Address
GET /v1/{chainName}/events/address/{contractAddress}/
Query params: starting-block, ending-block, page-size

#### Get Log Events by Topic Hash
GET /v1/{chainName}/events/topics/{topic}/

#### Get All Chains
GET /v1/chains/

#### Get Gas Prices
GET /v1/{chainName}/gas_prices/

## Understanding Balance Values
- balance: Raw token amount as string (divide by 10^contract_decimals for human-readable)
- quote_rate: Current price of 1 token in quote currency
- quote: Total value of holdings in quote currency
- pretty_quote: Formatted currency string for display

## Pagination
- Page numbers are 0-indexed (first page is 0)
- Default page size is 100 items
- If returned items < 100, it's the last page

## Quote Currencies
Supported: USD, CAD, EUR, SGD, INR, JPY, VND, CNY, KRW, RUB, TRY, NGN, ARS, AUD, CHF, GBP

## ENS Resolution
ENS names (e.g., vitalik.eth) are automatically resolved for eth-mainnet`;
}
