// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import {z} from 'zod';
import {getInitialApiInfo, getCategoryDoc} from '../api-spec.js';

/**
 * Create the Covalent API Info tool
 *
 * Returns the REST API specification for Covalent endpoints.
 * Call with category parameter to get specific endpoint documentation.
 */
export function createCovalentApiInfoTool(logger?: Logger): DynamicStructuredTool {
  const schema = z.object({
    category: z
      .enum(['workflows', 'balances', 'transactions', 'nft-security-crosschain', 'utility'])
      .optional()
      .describe(
        'Optional category to get detailed docs. Options: workflows, balances, transactions, nft-security-crosschain, utility. Leave empty for overview.'
      ),
  });

  return new DynamicStructuredTool({
    name: 'covalent_api_info',
    description: `Get the Covalent REST API documentation.

    FIRST CALL (no category): Returns overview, chain names, common workflows, and available categories.
    SUBSEQUENT CALLS (with category): Returns detailed endpoint docs for that category while keeping the shared workflows reference in context.

    Categories:
    - "workflows" - Common usage patterns (DEFAULT if no category)
    - "balances" - Token balances, transfers, holders, portfolio
    - "transactions" - Transaction history, blocks, summaries
    - "nft-security-crosschain" - NFTs, approvals, multi-chain activity
    - "utility" - Pricing, gas, events, chains status

    Usage:
    1. Call without category to understand available endpoints and workflows
    2. Call with specific category if you need detailed endpoint parameters`,
    schema,
    // eslint-disable-next-line @typescript-eslint/require-await
    func: async (input: z.infer<typeof schema>) => {
      try {
        const {category} = input;
        logger?.info({category}, 'Executing Covalent API info tool');

        if (category) {
          const doc = getCategoryDoc(category);
          logger?.info({category, docLength: doc.length}, 'Returned category documentation');
          return `📖 ${category.toUpperCase()} DOCUMENTATION:

${doc}

💡 This includes the shared workflows reference plus the detailed documentation for "${category}".
   Call with another category if needed, or use covalent_query to make requests.`;
        }

        const initialInfo = getInitialApiInfo();
        logger?.info({docLength: initialInfo.length}, 'Returned initial API info');

        return `📖 COVALENT API OVERVIEW:

${initialInfo}

⚠️ CRITICAL REMINDERS:
- Chain names are CASE-SENSITIVE: "eth-mainnet" not "ethereum"
- ENS names are supported for eth-mainnet (e.g., vitalik.eth)
- Balance values need division by 10^contract_decimals for display
- Page numbers are 0-indexed (first page is 0)

🚀 NEXT STEPS:
1. If you need more endpoint details, call with category (e.g., "balances", "transactions")
2. When ready, use covalent_query to execute requests`;
      } catch (error) {
        logger?.error(error, 'Error executing API info tool');
        return `Error reading API spec: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
