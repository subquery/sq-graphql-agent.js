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
ENS names (e.g., vitalik.eth) are automatically resolved for eth-mainnet

## Response Schemas

Each endpoint returns a consistent structure. Use these schemas to construct jq paths directly.

### Token Balances (balances_v2)
Response structure:
{
  "address": "0x...",
  "chain_id": 1,
  "chain_name": "eth-mainnet",
  "quote_currency": "USD",
  "items": [
    {
      "contract_ticker_symbol": "ETH",
      "contract_name": "Ethereum",
      "contract_address": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "contract_decimals": 18,
      "balance": "1234567890000000000",
      "quote": 1234.56,
      "pretty_quote": "$1,234.56",
      "quote_rate": 2500.00,
      "type": "cryptocurrency",
      "native_token": true,
      "is_spam": false
    }
  ]
}

Useful jq paths:
- items[*].contract_ticker_symbol - All token symbols
- items[*].contract_name - All token names
- items[*].pretty_quote - All formatted USD values
- items[*].balance - All raw balances
- items[0] - First token

### Transactions (transactions_v3)
Response structure:
{
  "address": "0x...",
  "items": [
    {
      "tx_hash": "0x...",
      "block_signed_at": "2024-01-01T00:00:00Z",
      "from_address": "0x...",
      "to_address": "0x...",
      "value": "1000000000000000000",
      "value_quote": 2500.00,
      "gas_spent": 21000,
      "fees_paid": "4200000000000000",
      "successful": true,
      "log_events": []
    }
  ],
  "pagination": {
    "has_more": true,
    "page_number": 0,
    "page_size": 100,
    "total_count": 500
  }
}

Useful jq paths:
- items[*].tx_hash - All transaction hashes
- items[*].block_signed_at - All timestamps
- items[*].from_address - All senders
- items[*].to_address - All receivers
- items[*].value_quote - All USD values

### NFT Holdings (nft)
Response structure:
{
  "address": "0x...",
  "items": [
    {
      "contract_name": "Bored Ape Yacht Club",
      "contract_ticker_symbol": "BAYC",
      "contract_address": "0x...",
      "supports_erc": ["ERC721"],
      "nft_data": [
        {
          "token_id": "1234",
          "token_balance": "1",
          "token_url": "https://..."
        }
      ]
    }
  ]
}

Useful jq paths:
- items[*].contract_name - All collection names
- items[*].nft_data[*].token_id - All token IDs

### Token Holders (token_holders_v2)
Response structure:
{
  "items": [
    {
      "address": "0x...",
      "balance": "1000000000000000000",
      "contract_ticker_symbol": "USDC",
      "total_supply": "10000000000000000000000000"
    }
  ],
  "pagination": {"has_more": true, "page_number": 0, "page_size": 100, "total_count": 1000}
}

Useful jq paths:
- items[*].address - All holder addresses
- items[*].balance - All balances

### Address Activity (activity)
Response structure:
{
  "items": [
    {
      "chain_name": "eth-mainnet",
      "chain_id": 1,
      "active": true
    }
  ]
}

Useful jq paths:
- items[*].chain_name - All active chains
- items[?active==true] - Filter active chains

### Token Prices (pricing/historical_by_addresses_v2)
Response structure:
{
  "items": [
    {
      "contract_ticker_symbol": "USDC",
      "quote_rate": 1.00,
      "pretty_quote_rate": "$1.00"
    }
  ]
}

Useful jq paths:
- items[*].contract_ticker_symbol - All symbols
- items[*].quote_rate - All prices`;
}
