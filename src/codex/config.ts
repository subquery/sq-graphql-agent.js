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
    lastAnalyzedAt: '2025-01-01T00:00:00.000Z',
    domainName: 'Codex GraphQL API',
    domainCapabilities: [
      'NFT pool queries and analytics',
      'NFT collection metadata and stats',
      'Token prices and market data',
      'Wallet tracking and balances',
      'DEX pair and exchange data',
      'Webhook management',
      'Network status information',
      'Real-time subscriptions',
    ],
    declineMessage: 'This query is outside the scope of Codex API capabilities.',
    schemaContent: getCodexQuerySchema(),
    // introspectionSchema: getCodexIntrospectionSchema(),
    fullSchema: getCodexFullSchema(),
    ...(authorization ? {authorization} : {}),
  };
}
