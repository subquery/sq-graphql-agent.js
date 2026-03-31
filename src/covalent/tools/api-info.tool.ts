// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import {z} from 'zod';
import {getCovalentApiSpec} from '../api-spec.js';

/**
 * Create the Covalent API Info tool
 *
 * Returns the REST API specification for Covalent endpoints.
 * The agent should call this once at the start to understand available endpoints.
 */
export function createCovalentApiInfoTool(logger?: Logger): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'covalent_api_info',
    description: `Get the Covalent REST API specification with available endpoints and parameters.

    Use this tool ONCE at the start to understand the available endpoints,
    their parameters, and response formats.

    DO NOT call this tool multiple times. The API spec contains everything needed.`,
    schema: z.object({}),
    // eslint-disable-next-line @typescript-eslint/require-await
    func: async () => {
      try {
        logger?.info('Executing Covalent API info tool');

        const apiSpec = getCovalentApiSpec();
        logger?.info({specLength: apiSpec.length}, 'Successfully returned API spec');

        return `📖 COVALENT REST API SPECIFICATION:

${apiSpec}

💡 NOW USE THE SPECIFICATION ABOVE TO:
1. Choose the appropriate endpoint category (balances, transactions, nfts, etc.)
2. Construct the REST path with correct chain_name and wallet address
3. Add query parameters as needed (quote-currency, page-size, etc.)
4. Use covalent_query tool to execute the request

⚠️ CRITICAL REMINDERS:
- Chain names are case-sensitive: "eth-mainnet" not "ethereum"
- ENS names are supported for eth-mainnet (e.g., vitalik.eth)
- Balance values need division by 10^contract_decimals for display
- Page numbers are 0-indexed (first page is 0)

DO NOT call covalent_api_info again - everything needed is above.`;
      } catch (error) {
        logger?.error(error, 'Error executing API info tool');
        return `Error reading API spec: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
