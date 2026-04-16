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
      'Polymarket and prediction market discovery, pricing, traders, holdings, trades, and charting analytics',
      'Network, block, and chain metadata queries',
      'Token, pair, and exchange discovery with pricing, bars, and market stats',
      'Wallet balances, holders, traders, and wallet analytics',
      'Liquidity, event streams, community notes, and webhook management',
      'Deprecated NFT collection, pool, Parallel, and Prime pool coverage',
    ],
    declineMessage: 'This query is outside the scope of Codex API capabilities.',
    suggestedQuestions: [
      'What Polymarket events and markets are active, and how can I rank them by volume, liquidity, or recent activity?',
      'Can you show Polymarket market prices, bars, and detailed stats for a specific market or event?',
      'Which Polymarket traders are performing best, and what positions, holdings, or trader-market stats do they have?',
      'Can you list recent Polymarket trades and summarize who is buying or selling in a market?',
      'Which networks does Codex support, and what are their status and configuration details?',
      'What block data can I fetch by block number or timestamp?',
      'Can you find a token, show its metadata, and return its current or historical price?',
      'How can I filter tokens or pairs by liquidity, volume, creation time, or network?',
      'What chart and bar data is available for a token or pair over a custom time range?',
      'Can you show recent swap, mint, burn, or liquidity events for a pair or token?',
      'What exchanges are available for a network, and how can I rank or filter them?',
      'Which wallets hold a token, what are the top holders, and what balances does a wallet have?',
      'Can you analyze a wallet using trader stats, activity charts, or token-specific wallet filters?',
      'What liquidity locks or liquidity metadata exist for a pair or token?',
      'What community notes exist for a token or NFT contract?',
      'Can you list, inspect, or manage webhooks for price, transfer, NFT, or prediction events?',
      'What NFT collection, pool, asset, Parallel, or Prime pool data is still available through the deprecated endpoints?',
    ],
    schemaContent: getCodexQuerySchema(),
    fullSchema: getCodexFullSchema(),
    ...(authorization ? {authorization} : {}),
  };
}
