// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {GraphqlProvider, type GraphQLProjectConfig} from '../types.js';
import {getCodexFullSchema, getCodexQuerySchema} from './schema.js';

/**
 * Get the complete bundled Codex configuration
 *
 * Pre-analyzed config for Codex GraphQL endpoints.
 * This avoids re-analyzing Codex via LLM on every request.
 *
 * @param endpoint - The Codex endpoint URL
 * @param authorization - Optional authorization header
 * @returns Complete GraphQLProjectConfig with schema content
 */
export function getCodexConfig(endpoint: string, authorization?: string): GraphQLProjectConfig {
  return {
    cid: 'codex-fixed',
    endpoint,
    nodeType: GraphqlProvider.CODEX,
    updatedAt: new Date().toISOString(),
    lastAnalyzedAt: new Date().toISOString(),
    domainName: 'Codex GraphQL API',
    domainCapabilities: [
      'NFT pool queries and analytics',
      'NFT collection metadata and stats',
      'Token prices and market data',
      'Wallet tracking and balances',
      'DEX pair and exchange data',
      'Chain & Block information',
    ],
    declineMessage: 'This query is outside the scope of Codex API capabilities.',
    suggestedQuestions: [
      'What block information can I get for specific block numbers or timestamps?',
      'Which blockchain networks are supported and what are their basic details?',
      'What information is available about specific NFT pools, including their current state and liquidity?',
      'Can I see events like swaps, mints, or burns for NFT pools based on various filters?',
      'How do I get aggregated statistics for an NFT collection within specific marketplaces?',
      'What collections have active liquidity pools on particular marketplaces?',
      'How can I find all pools for a specific collection or owned by a specific wallet?',
      'Can I get time-series statistics for NFT pools and collections over custom time ranges?',
      'How can I search and filter NFT collections using various criteria like network, type, or trading volume?',
      'What metadata is available for specific NFT collections, including images and market statistics?',
      'How do I retrieve assets within a collection and optionally fetch missing on-chain data?',
      'Can I get bucketed time-series statistics for NFT collections for charting purposes?',
      'What transaction events (sales, transfers) are available for NFTs across marketplaces?',
      'How can I batch-fetch metadata for multiple NFT collections at once?',
      'What filtering options exist for Parallel NFT assets based on their unique attributes?',
      'Can I track historical changes to Parallel card metadata over time?',
      'How do I get information about staked assets and events in Prime gaming pools?',
      'Who holds specific NFT collections and how many do they own?',
      'What NFTs does a particular wallet own, across collections or within specific collections?',
      'Can I see token balances for a wallet and who holds specific tokens?',
      'How can I filter and search tokens based on metrics like price, volume, or liquidity?',
      'What trading pairs exist and how can I filter them by network, exchange, or token?',
      'Which DEX exchanges are supported and how can I search/filter them?',
      'Can I get time-series charting data for tokens and pairs with customizable timeframes?',
      'What real-time and historical price data is available for multiple tokens?',
      'How do I retrieve recent swap, mint, and burn events for tokens and pairs?',
      'What information is available about liquidity locks for tokens and pairs?',
    ],
    schemaContent: getCodexQuerySchema(),
    fullSchema: getCodexFullSchema(),
    ...(authorization ? {authorization} : {}),
  };
}
