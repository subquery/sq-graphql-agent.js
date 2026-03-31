// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import {z} from 'zod';
import {CovalentService} from '../service.js';
import type {CovalentConfig} from '../types.js';
import {ResultFileManager} from './file-manager.js';

/**
 * Create the Covalent Query tool
 *
 * Executes REST API requests against Covalent endpoints and saves results to temp files.
 */
export function createCovalentQueryTool(config: CovalentConfig, logger?: Logger): DynamicStructuredTool {
  const service = new CovalentService(config, logger);
  const fileManager = ResultFileManager.getInstance(logger);

  const schema = z.object({
    path: z.string().describe('REST API path, starting with /v1/'),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('Query parameters as key-value pairs'),
  });

  return new DynamicStructuredTool({
    name: 'covalent_query',
    description: `Execute a REST API request against the Covalent endpoint.

    Call covalent_api_info FIRST to understand available endpoints.

    Input:
    - path: API path starting with /v1/ (e.g., /v1/eth-mainnet/address/0x.../balances_v2/)
    - params: Optional query parameters as key-value pairs

    Example paths:
    - Token balances: /v1/eth-mainnet/address/vitalik.eth/balances_v2/
    - Transactions: /v1/eth-mainnet/address/0x.../transactions_v3/
    - NFTs: /v1/eth-mainnet/address/0x.../nft/
    - Token holders: /v1/eth-mainnet/tokens/0x.../token_holders_v2/

    Common params:
    - quote-currency: USD, EUR, etc.
    - page-size: Number of items (default 100)
    - page-number: 0-indexed page number
    - no-spam: true to filter spam tokens

    🛑 CRITICAL RULES:
    1. Call covalent_api_info FIRST to understand endpoints
    2. Chain names are CASE-SENSITIVE: "eth-mainnet" not "Ethereum"
    3. After getting results, use covalent_result_head or covalent_result_jq to explore
    4. Balance values need division by 10^contract_decimals

    Example:
    - path: "/v1/eth-mainnet/address/vitalik.eth/balances_v2/"
    - params: { "quote-currency": "USD", "no-spam": "true" }`,
    schema,
    func: async (input: z.infer<typeof schema>) => {
      const {params, path} = input;
      const startTime = Date.now();

      logger?.info({path, hasParams: !!params}, 'Starting Covalent REST request');

      // Validate path format
      if (!path.startsWith('/v1/')) {
        logger?.warn({path}, 'Invalid path format');
        return '❌ Error: Path must start with /v1/';
      }

      // Execute the REST request
      const result = await service.execute(path, params);

      const executionTime = Date.now() - startTime;
      logger?.info(
        {
          executionTime,
          hasData: result.data !== null,
          hasError: result.error,
        },
        'Covalent request completed'
      );

      // Handle API errors
      if (result.error) {
        logger?.error({error: result.error_message}, 'Covalent API error');
        return `❌ API Error: ${result.error_message || 'Unknown error'} (code: ${result.error_code || 'N/A'})`;
      }

      // Save result to temp file
      if (result.data !== null && result.data !== undefined) {
        const saved = fileManager.saveResult(result.data, path);
        const items = result.data as {items?: unknown[]};
        const itemCount = Array.isArray(items?.items) ? items.items.length : 'unknown';

        logger?.info(
          {
            fileId: saved.id,
            fileSizeKB: Math.round(saved.size / 1024),
            itemCount,
            executionTime,
          },
          'Result saved to file'
        );

        return `✅ Request successful. Result saved to file.

📁 File ID: ${saved.id}
📊 Items: ${itemCount}
📦 Size: ${Math.round(saved.size / 1024)}KB
⏱️ Time: ${executionTime}ms

Use these tools to explore the result:
- covalent_result_head: View first N items
- covalent_result_jq: Extract specific fields with JSONPath`;
      }

      logger?.warn({result}, 'Unexpected response format');
      return `⚠️ Unexpected response format`;
    },
  });
}

/**
 * Create the Result Head tool
 *
 * Shows the first N items from a saved result.
 */
export function createCovalentResultHeadTool(logger?: Logger): DynamicStructuredTool {
  const fileManager = ResultFileManager.getInstance(logger);

  const schema = z.object({
    count: z.number().min(1).max(50).default(5).describe('Number of items to show'),
  });

  return new DynamicStructuredTool({
    name: 'covalent_result_head',
    description: `View the first N items from the most recent saved result.

    🎯 Use this AFTER covalent_query to explore the data.
    🎯 Call this INSTEAD of making another API call with different page-size.

    Input:
    - count: Number of items to show (default: 5, max: 50)

    After viewing, use covalent_result_jq to extract specific fields.`,
    schema,
    func: (input: z.infer<typeof schema>) => {
      const {count} = input;
      logger?.info({tool: 'covalent_result_head', input: {count}}, 'Tool invoked');

      const result = fileManager.getLatestResult();

      if (!result) {
        logger?.warn({tool: 'covalent_result_head'}, 'No saved result found');
        return '❌ No saved result found. Run covalent_query first.';
      }

      const items = result.data as {items?: unknown[]};
      if (!Array.isArray(items?.items)) {
        logger?.warn({tool: 'covalent_result_head'}, 'Result does not contain items array');
        return '❌ Result does not contain an items array.';
      }

      const headItems = items.items.slice(0, count);
      const formatted = JSON.stringify(headItems, null, 2);

      logger?.info(
        {
          tool: 'covalent_result_head',
          input: {count},
          output: {
            resultId: result.id,
            requestedCount: count,
            returnedCount: headItems.length,
            totalItems: items.items.length,
          },
        },
        'Tool completed'
      );

      return `📋 First ${headItems.length} of ${items.items.length} items (File: ${result.id}):

${formatted}

💡 Next: Use covalent_result_jq to extract specific fields from all ${items.items.length} items.`;
    },
  });
}

/**
 * Create the Result JQ tool
 *
 * Extracts specific fields from a saved result using simple JSONPath.
 */
export function createCovalentResultJqTool(logger?: Logger): DynamicStructuredTool {
  const fileManager = ResultFileManager.getInstance(logger);

  const schema = z.object({
    path: z
      .string()
      .describe('JSONPath to extract (e.g., "items[0].contract_name" or "items[*].contract_ticker_symbol")'),
  });

  return new DynamicStructuredTool({
    name: 'covalent_result_jq',
    description: `Extract specific fields from the saved result using JSONPath.

    🎯 Use this AFTER covalent_query and covalent_result_head to get specific data.

    JSONPath examples:
    - "items[0]" - First item
    - "items[0:5]" - First 5 items
    - "items[*].contract_name" - All contract names
    - "items[*].contract_ticker_symbol" - All ticker symbols
    - "items[*].pretty_quote" - All formatted USD values

    Input:
    - path: JSONPath expression`,
    schema,
    func: (input: z.infer<typeof schema>) => {
      const {path} = input;
      logger?.info({tool: 'covalent_result_jq', input: {path}}, 'Tool invoked');

      const result = fileManager.getLatestResult();

      if (!result) {
        logger?.warn('No saved result found');
        return '❌ No saved result found. Run covalent_query first.';
      }

      try {
        const extracted = extractByPath(result.data, path);
        const formatted = JSON.stringify(extracted, null, 2);

        logger?.info(
          {
            tool: 'covalent_result_jq',
            input: {path},
            output: {
              resultId: result.id,
              extractedType: Array.isArray(extracted) ? `array[${extracted.length}]` : typeof extracted,
            },
          },
          'Tool completed'
        );

        return `📊 Extracted from ${result.id}:

${formatted}`;
      } catch (error) {
        logger?.error({path, error}, 'covalent_result_jq failed');
        return `❌ Failed to extract: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

/**
 * Simple JSONPath extraction
 */
function extractByPath(data: unknown, path: string): unknown {
  // Handle items[*].field pattern
  const wildcardMatch = path.match(/^items\[\*\]\.(\S+)$/);
  if (wildcardMatch && wildcardMatch[1]) {
    const field = wildcardMatch[1];
    const obj = data as {items?: Record<string, unknown>[]};
    if (Array.isArray(obj?.items)) {
      return obj.items.map((item) => item[field]);
    }
  }

  // Handle items[0:5] pattern (slice)
  const sliceMatch = path.match(/^items\[(\d+):(\d+)\]$/);
  if (sliceMatch && sliceMatch[1] && sliceMatch[2]) {
    const start = parseInt(sliceMatch[1], 10);
    const end = parseInt(sliceMatch[2], 10);
    const obj = data as {items?: unknown[]};
    if (Array.isArray(obj?.items)) {
      return obj.items.slice(start, end);
    }
  }

  // Handle items[N] pattern (single index)
  const indexMatch = path.match(/^items\[(\d+)\]\.?(.*)$/);
  if (indexMatch && indexMatch[1]) {
    const index = parseInt(indexMatch[1], 10);
    const rest = indexMatch[2] || '';
    const obj = data as {items?: Record<string, unknown>[]};
    if (Array.isArray(obj?.items) && obj.items[index]) {
      const item = obj.items[index];
      if (rest) {
        // Handle nested field like items[0].contract_name
        return rest.split('.').reduce((acc: unknown, key: string) => {
          if (acc && typeof acc === 'object') {
            return (acc as Record<string, unknown>)[key];
          }
          return undefined;
        }, item);
      }
      return item;
    }
  }

  // Handle simple field access
  if (path && !path.includes('[') && !path.includes('.')) {
    const obj = data as Record<string, unknown>;
    return obj?.[path];
  }

  throw new Error(`Unsupported path format: ${path}`);
}
