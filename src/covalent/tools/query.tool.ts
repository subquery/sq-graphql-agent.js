// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import {z} from 'zod';
import type {CovalentContext} from '../context.js';
import {CovalentService} from '../service.js';
import type {CovalentConfig} from '../types.js';

/**
 * Create the Covalent Query tool
 */
export function createCovalentQueryTool(
  config: CovalentConfig,
  context: CovalentContext,
  logger?: Logger
): DynamicStructuredTool {
  const service = new CovalentService(config, logger);

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
    3. After getting results, use covalent_result_jq to extract fields
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
        return '❌ Error: Path must start with /v1/';
      }

      // Execute the REST request
      const result = await service.execute(path, params);

      const executionTime = Date.now() - startTime;
      logger?.info(
        {executionTime, hasData: result.data !== null, hasError: result.error},
        'Covalent request completed'
      );

      // Handle API errors
      if (result.error) {
        logger?.error({error: result.error_message}, 'Covalent API error');
        return `❌ API Error: ${result.error_message || 'Unknown error'} (code: ${result.error_code || 'N/A'})`;
      }

      // Cache result in context
      if (result.data !== null && result.data !== undefined) {
        const saved = context.setResult(result.data, path);
        const items = result.data as {items?: unknown[]};
        const itemCount = Array.isArray(items?.items) ? items.items.length : 'unknown';

        logger?.info(
          {resultId: saved.id, sizeKB: Math.round(saved.size / 1024), itemCount, executionTime},
          'Result cached'
        );

        return `✅ Request successful.

📊 Items: ${itemCount}
📦 Size: ${Math.round(saved.size / 1024)}KB
⏱️ Time: ${executionTime}ms

Use covalent_result_jq to extract specific fields.
Use covalent_result_head to inspect structure if needed.`;
      }

      logger?.warn({result}, 'Unexpected response format');
      return `⚠️ Unexpected response format`;
    },
  });
}

/**
 * Create the Result Head tool
 */
export function createCovalentResultHeadTool(context: CovalentContext, logger?: Logger): DynamicStructuredTool {
  const schema = z.object({
    count: z.number().min(1).max(50).default(5).describe('Number of items to show'),
  });

  return new DynamicStructuredTool({
    name: 'covalent_result_head',
    description: `View the first N items from the most recent saved result.

    🔄 FALLBACK: Use this ONLY if covalent_result_jq fails or you need to explore the structure.
    💡 PREFER: Use covalent_result_jq directly when you know the schema from covalent_api_info.

    Input:
    - count: Number of items to show (default: 5, max: 50)`,
    schema,
    // eslint-disable-next-line @typescript-eslint/require-await
    func: async (input: z.infer<typeof schema>) => {
      const {count} = input;
      logger?.info({tool: 'covalent_result_head', input: {count}}, 'Tool invoked');

      const result = context.getResult();

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

      return `📋 First ${headItems.length} of ${items.items.length} items:

${formatted}

💡 Next: Use covalent_result_jq to extract specific fields.`;
    },
  });
}

/**
 * Create the Result JQ tool
 */
export function createCovalentResultJqTool(context: CovalentContext, logger?: Logger): DynamicStructuredTool {
  const schema = z.object({
    path: z
      .string()
      .describe('JSONPath to extract (e.g., "items[0].contract_name" or "items[*].contract_ticker_symbol")'),
  });

  return new DynamicStructuredTool({
    name: 'covalent_result_jq',
    description: `Extract specific fields from the saved result using JSONPath.

    ⭐ PRIMARY TOOL: Use this FIRST after covalent_query (you know the schema from covalent_api_info).
    🔄 FALLBACK: If jq fails, use covalent_result_head to inspect structure first.

    JSONPath examples:
    - "items[0]" - First item
    - "items[0:5]" - First 5 items
    - "items[*].contract_ticker_symbol" - All ticker symbols
    - "items[*].pretty_quote" - All formatted USD values
    - "items[*].contract_name" - All contract names

    Input:
    - path: JSONPath expression`,
    schema,
    // eslint-disable-next-line @typescript-eslint/require-await
    func: async (input: z.infer<typeof schema>) => {
      const {path} = input;
      logger?.info({tool: 'covalent_result_jq', input: {path}}, 'Tool invoked');

      const result = context.getResult();

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
  const obj = data as {items?: unknown[]};

  // Helper to parse object construction pattern: {alias: field, alias2: field2}
  function parseObjectPattern(pattern: string): Record<string, string> | null {
    if (!pattern.startsWith('{') || !pattern.endsWith('}')) {
      return null;
    }
    const content = pattern.slice(1, -1);
    const fields: Record<string, string> = {};
    const pairs = content.split(',').map((p) => p.trim());
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex > 0) {
        const alias = pair.slice(0, colonIndex).trim();
        const field = pair.slice(colonIndex + 1).trim();
        if (alias && field) {
          fields[alias] = field;
        }
      }
    }
    return Object.keys(fields).length > 0 ? fields : null;
  }

  // Helper to extract object with multiple fields from an item
  function extractObjectFromItem(
    item: Record<string, unknown>,
    fieldMap: Record<string, string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [alias, field] of Object.entries(fieldMap)) {
      result[alias] = item[field];
    }
    return result;
  }

  // Handle items[*].{alias: field, ...} pattern (all items, multiple fields)
  const wildcardObjMatch = path.match(/^items\[\*\]\.(\{.+\})$/);
  if (wildcardObjMatch && wildcardObjMatch[1]) {
    const fieldMap = parseObjectPattern(wildcardObjMatch[1]);
    if (fieldMap && Array.isArray(obj?.items)) {
      const items = obj.items as Record<string, unknown>[];
      return items.map((item) => extractObjectFromItem(item, fieldMap));
    }
  }

  // Handle items[0:N].{alias: field, ...} pattern (slice, multiple fields)
  const sliceObjMatch = path.match(/^items\[(\d+):(\d+)\]\.(\{.+\})$/);
  if (sliceObjMatch && sliceObjMatch[1] && sliceObjMatch[2] && sliceObjMatch[3]) {
    const start = parseInt(sliceObjMatch[1], 10);
    const end = parseInt(sliceObjMatch[2], 10);
    const fieldMap = parseObjectPattern(sliceObjMatch[3]);
    if (fieldMap && Array.isArray(obj?.items)) {
      const items = obj.items as Record<string, unknown>[];
      return items.slice(start, end).map((item) => extractObjectFromItem(item, fieldMap));
    }
  }

  // Handle items[N].{alias: field, ...} pattern (single index, multiple fields)
  const indexObjMatch = path.match(/^items\[(\d+)\]\.(\{.+\})$/);
  if (indexObjMatch && indexObjMatch[1] && indexObjMatch[2]) {
    const index = parseInt(indexObjMatch[1], 10);
    const fieldMap = parseObjectPattern(indexObjMatch[2]);
    if (fieldMap && Array.isArray(obj?.items)) {
      const items = obj.items as Record<string, unknown>[];
      const item = items[index];
      if (item && typeof item === 'object') {
        return extractObjectFromItem(item, fieldMap);
      }
    }
  }

  // Handle items[*].field pattern (all items, single field)
  const wildcardMatch = path.match(/^items\[\*\]\.(\S+)$/);
  if (wildcardMatch && wildcardMatch[1]) {
    const field = wildcardMatch[1];
    if (Array.isArray(obj?.items)) {
      const items = obj.items as Record<string, unknown>[];
      return items.map((item) => item[field]);
    }
  }

  // Handle items[0:N].field pattern (slice + field)
  const sliceFieldMatch = path.match(/^items\[(\d+):(\d+)\]\.(\S+)$/);
  if (sliceFieldMatch && sliceFieldMatch[1] && sliceFieldMatch[2] && sliceFieldMatch[3]) {
    const start = parseInt(sliceFieldMatch[1], 10);
    const end = parseInt(sliceFieldMatch[2], 10);
    const field = sliceFieldMatch[3];
    if (Array.isArray(obj?.items)) {
      const items = obj.items as Record<string, unknown>[];
      return items.slice(start, end).map((item) => item[field]);
    }
  }

  // Handle items[0:N] pattern (slice only)
  const sliceMatch = path.match(/^items\[(\d+):(\d+)\]$/);
  if (sliceMatch && sliceMatch[1] && sliceMatch[2]) {
    const start = parseInt(sliceMatch[1], 10);
    const end = parseInt(sliceMatch[2], 10);
    if (Array.isArray(obj?.items)) {
      return obj.items.slice(start, end);
    }
  }

  // Handle items[N].field pattern (single index + field)
  const indexFieldMatch = path.match(/^items\[(\d+)\]\.(\S+)$/);
  if (indexFieldMatch && indexFieldMatch[1] && indexFieldMatch[2]) {
    const index = parseInt(indexFieldMatch[1], 10);
    const field = indexFieldMatch[2];
    if (Array.isArray(obj?.items)) {
      const items = obj.items as Record<string, unknown>[];
      const item = items[index];
      if (item && typeof item === 'object') {
        return item[field];
      }
    }
  }

  // Handle items[N] pattern (single index)
  const indexMatch = path.match(/^items\[(\d+)\]$/);
  if (indexMatch && indexMatch[1]) {
    const index = parseInt(indexMatch[1], 10);
    if (Array.isArray(obj?.items)) {
      return obj.items[index];
    }
  }

  // Handle simple field access (top-level)
  if (path && !path.includes('[')) {
    const dataObj = data as Record<string, unknown>;
    if (path.includes('.')) {
      // Handle nested field like pagination.has_more
      return path.split('.').reduce((acc: unknown, key: string) => {
        if (acc && typeof acc === 'object') {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, dataObj);
    }
    return dataObj?.[path];
  }

  throw new Error(`Unsupported path format: ${path}`);
}
