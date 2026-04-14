// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {existsSync} from 'fs';
import {createRequire} from 'module';
import {dirname, join} from 'path';
import {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import {z} from 'zod';
import type {CovalentContext} from '../context.js';
import {CovalentService} from '../service.js';
import type {CovalentConfig} from '../types.js';

const require = createRequire(import.meta.url);
const MAX_RESPONSE_BYTES = 100 * 1024;

type JsonValue = string | number | boolean | null | {[key: string]: JsonValue} | JsonValue[];

const JQ_BUILTINS = new Set([
  'add',
  'all',
  'any',
  'del',
  'group_by',
  'keys',
  'length',
  'map',
  'max',
  'min',
  'reverse',
  'select',
  'sort',
  'sort_by',
  'tostring',
  'tonumber',
  'unique',
  'values',
]);

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
    - Token prices: /v1/pricing/historical_by_addresses_v2/eth-mainnet/USD/0x.../
    - Token holders: /v1/eth-mainnet/tokens/0x.../token_holders_v2/

    Common params:
    - quote-currency: USD, EUR, etc.
    - page-size: Number of items (default 100)
    - page-number: 0-indexed page number
    - no-spam: true to filter spam tokens

    🛑 CRITICAL RULES:
    1. Call covalent_api_info FIRST to understand endpoints
    2. Chain names are CASE-SENSITIVE: "eth-mainnet" not "Ethereum"
    3. Raw Covalent responses use top-level fields named data, error, error_message, and error_code
    4. This tool caches only response.data for downstream inspection
    5. After getting results, use covalent_result_jq to extract fields
    6. Balance values need division by 10^contract_decimals

    Example:
    - path: "/v1/eth-mainnet/address/vitalik.eth/balances_v2/"
    - params: quote-currency=USD, no-spam=true`,
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

        // Detect response structure
        let itemCount: number | string = 'unknown';
        let structureHint = '';

        if (Array.isArray(result.data)) {
          itemCount = result.data.length;
          structureHint = 'array';
        } else if (result.data && typeof result.data === 'object') {
          const dataObj = result.data as Record<string, unknown>;
          if (Array.isArray(dataObj.items)) {
            itemCount = dataObj.items.length;
            structureHint = 'object with items';
          } else {
            // Check for common nested arrays
            const keys = Object.keys(dataObj);
            const arrayKeys = keys.filter((k) => Array.isArray(dataObj[k]));
            if (arrayKeys.length === 1) {
              const [arrayKey] = arrayKeys;
              if (arrayKey) {
                itemCount = (dataObj[arrayKey] as unknown[]).length;
                structureHint = `object with ${arrayKey} array`;
              }
            } else {
              itemCount = 1;
              structureHint = 'object';
            }
          }
        }

        logger?.info(
          {resultId: saved.id, sizeKB: Math.round(saved.size / 1024), itemCount, structureHint, executionTime},
          'Result cached'
        );

        return `✅ Request successful.

📊 Structure: ${structureHint} (${itemCount} items)
📦 Size: ${Math.round(saved.size / 1024)}KB
⏱️ Time: ${executionTime}ms

⚠️ IMPORTANT: Raw Covalent responses use top-level fields named data, error, error_message, and error_code.
👉 This tool caches only the unwrapped payload from data.
👉 Use covalent_result_jq directly when the docs already tell you the shape.
👉 Use covalent_result_head only if jq fails or the payload shape is unclear.`;
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
    count: z.number().min(1).max(200).default(20).describe('Number of text lines to show from the saved payload'),
  });

  return new DynamicStructuredTool({
    name: 'covalent_result_head',
    description: `Fallback tool: preview the saved payload as text.

    This behaves like a text-based "head" command.
    It does not assume arrays, objects, or an items field.
    Use it only when covalent_result_jq fails or when the payload shape is still unclear after reading the docs.

    Input:
    - count: Number of lines to show (default: 20, max: 200)

    Output shows:
    - The first N lines of the saved payload text
    - A truncated preview that helps you choose the jq path`,
    schema,
    func: async (input: z.infer<typeof schema>) => {
      const {count} = input;
      logger?.info({tool: 'covalent_result_head', input: {count}}, 'Tool invoked');

      const result = context.getResult();

      if (!result) {
        logger?.warn({tool: 'covalent_result_head'}, 'No saved result found');
        return '❌ No saved result found. Run covalent_query first.';
      }

      const formatted = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      const lines = formatted.split('\n');
      const headLines = lines.slice(0, count);
      const preview = headLines.join('\n');
      const truncated = lines.length > count;
      const largePayloadHint =
        lines.length > 5000
          ? '⚠️ Large payload detected. Plan ONE jq call if possible. Avoid repeated full-array scans, especially sort_by/group_by/aggregate passes.\n'
          : '';

      logger?.info(
        {
          tool: 'covalent_result_head',
          input: {count},
          output: {
            resultId: result.id,
            requestedCount: count,
            returnedCount: headLines.length,
            totalLines: lines.length,
            truncated,
          },
        },
        'Tool completed'
      );

      return `📋 First ${headLines.length} of ${lines.length} lines from the saved payload:

${preview}

${truncated ? '\n... (truncated)\n' : ''}
${largePayloadHint}
💡 Next: Use covalent_result_jq with a path against the saved payload.`;
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
      .describe(
        'jq filter to run against the saved payload (e.g., .items | length, .items[0:20] | map(.contract_ticker_symbol), . for all, or .data.items[0] which will be normalized)'
      ),
  });

  return new DynamicStructuredTool({
    name: 'covalent_result_jq',
    description: `Extract specific fields from the saved result using jq.

    Preferred extraction tool after covalent_query.
    Different endpoints return different payload structures (array, object with items, etc.).
    The raw API response uses top-level fields named data, error, error_message, and error_code,
    but this tool operates on the saved payload after unwrapping.
    Performance note: large payloads can make jq queries expensive.
    Prefer one final jq call instead of several exploratory passes.
    Use covalent_result_head only if this jq call fails or the payload shape is unclear.
    Keep jq outputs bounded. Avoid extracting hundreds or thousands of values into the model context.

    jq examples:
    - "." - Return all data
    - ".data" - Also returns all data (normalized to ".")
    - ".data.items[0]" - Allowed; normalized to ".items[0]"
    - ".items[0]" - First item
    - ".items[0:5]" - First 5 items
    - ".items | length" - Count items
    - ".items | map(.quote // 0) | add" - Sum quote values safely when some are null
    - ".items[0:20] | map(.contract_ticker_symbol)" - Fast slice to list token symbols
    - ".items | sort_by(-(.quote // 0)) | .[0:10] | map(.contract_ticker_symbol)" - More expensive top tokens by quote
    - ".[0].prices | map(.price)" - Map nested arrays when the root payload is an array
    - Avoid unbounded filters like ".items | map(.contract_ticker_symbol) | unique" on very large payloads

    Input:
    - path: jq filter based on the saved payload structure`,
    schema,
    func: async (input: z.infer<typeof schema>) => {
      const {path} = input;
      const normalizedPath = normalizeDataPath(path);
      const startTime = Date.now();
      logger?.info({tool: 'covalent_result_jq', input: {path, normalizedPath}}, 'Tool invoked');

      const result = context.getResult();

      if (!result) {
        logger?.warn('No saved result found');
        return '❌ No saved result found. Run covalent_query first.';
      }

      try {
        const jqResult = await runJqRawCli(result.data as object | string, normalizedPath);
        const formatted = jqResult.stdout.trimEnd();

        if (jqResult.stderr || (typeof jqResult.exitCode === 'number' && jqResult.exitCode !== 0)) {
          const errorMessage = (jqResult.stderr || `jq exited with code ${jqResult.exitCode}`).trim();
          const hint = getJqErrorHint(normalizedPath, errorMessage);

          logger?.error(
            {
              path,
              normalizedPath,
              error: {
                message: errorMessage,
                exitCode: jqResult.exitCode,
                stderr: jqResult.stderr,
              },
            },
            'covalent_result_jq failed'
          );

          return `❌ Failed to extract: ${errorMessage}${hint ? `\n\n💡 Hint: ${hint}` : ''}`;
        }

        if (!formatted) {
          return `❌ jq filter produced no output: ${normalizedPath}

Call covalent_result_head again and adjust the filter to match the saved payload.`;
        }

        const resultSize = Buffer.byteLength(formatted, 'utf-8');
        const executionTime = Date.now() - startTime;
        let extractedType = 'string';

        try {
          const parsed = JSON.parse(formatted);
          extractedType = Array.isArray(parsed) ? `array[${parsed.length}]` : typeof parsed;
        } catch {
          extractedType = 'string';
        }

        logger?.info(
          {
            tool: 'covalent_result_jq',
            input: {path, normalizedPath},
            output: {
              resultId: result.id,
              extractedType,
              executionTime,
              resultSizeKB: Math.round(resultSize / 1024),
            },
          },
          'Tool completed'
        );

        let returnedContent = formatted;
        let truncationNotice = '';

        if (resultSize > MAX_RESPONSE_BYTES) {
          let truncatedContent = formatted;

          while (Buffer.byteLength(truncatedContent, 'utf-8') > MAX_RESPONSE_BYTES) {
            truncatedContent = truncatedContent.slice(0, Math.max(0, truncatedContent.length - 1024));
          }

          returnedContent = truncatedContent;
          truncationNotice = `⚠️ Output truncated: ${Math.round(resultSize / 1024)}KB total, returning first ${Math.round(Buffer.byteLength(returnedContent, 'utf-8') / 1024)}KB.\nUse a narrower jq filter such as \`.items[0:20]\`, \`.items | length\`, or a specific field projection.`;

          logger?.warn(
            {
              resultId: result.id,
              path,
              normalizedPath,
              resultSizeKB: Math.round(resultSize / 1024),
              returnedSizeKB: Math.round(Buffer.byteLength(returnedContent, 'utf-8') / 1024),
            },
            'JQ result was truncated to keep model context safe'
          );
        }

        return `📊 Extracted from ${result.id}:

${returnedContent}

${truncationNotice ? `${truncationNotice}\n\n` : ''}${executionTime > 3000 ? `⚠️ Slow jq query: ${executionTime}ms. Avoid repeated jq calls and prefer one final extraction pass.` : ''}`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message.trim() : String(error);
        const hint = getJqErrorHint(normalizedPath, errorMessage);

        logger?.error(
          {
            path,
            normalizedPath,
            error: {
              message: errorMessage,
              stack: error instanceof Error ? error.stack : undefined,
            },
          },
          'covalent_result_jq failed'
        );

        return `❌ Failed to extract: ${errorMessage}${hint ? `\n\n💡 Hint: ${hint}` : ''}`;
      }
    },
  });
}

function normalizeDataPath(path: string): string {
  let normalized = path.trim();

  if (normalized === 'data' || normalized === '.data') {
    return '.';
  }

  normalized = normalized.replace(/^\.?data(?=\.|\[|$)/, '');
  if (!normalized) {
    return '.';
  }

  if (normalized.startsWith('.')) {
    return normalized;
  }

  if (normalized.startsWith('[')) {
    return `.${normalized}`;
  }

  const rootTokenMatch = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
  if (!rootTokenMatch) {
    return normalized;
  }

  const [rootToken] = rootTokenMatch;
  return JQ_BUILTINS.has(rootToken) ? normalized : `.${normalized}`;
}

type JqRunResult = {
  exitCode?: number;
  stderr: string;
  stdout: string;
};

function toJqInput(input: unknown): string[] | JsonValue {
  if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (Array.isArray(input)) {
    return input as JsonValue[];
  }

  if (typeof input === 'object') {
    return input as {[key: string]: JsonValue};
  }

  throw new Error('Saved payload is not valid JSON input for jq');
}

function ensureNodeJqPath(): void {
  if (process.env.JQ_PATH) {
    return;
  }

  const nodeJqPackagePath = require.resolve('node-jq/package.json');
  const bundledJqPath = join(dirname(nodeJqPackagePath), 'bin', 'jq');

  if (!existsSync(bundledJqPath)) {
    process.env.JQ_PATH = 'jq';
  }
}

async function runJqRawCli(input: unknown, filter: string): Promise<JqRunResult> {
  try {
    ensureNodeJqPath();
    const jqModule = await import('node-jq');
    const stdout = await jqModule.run(filter, toJqInput(input), {
      input: 'json',
      output: 'pretty',
    });

    return {
      stderr: '',
      stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout, null, 2),
    };
  } catch (error) {
    const jqError = error as {
      code?: number | string;
      message?: string;
      stderr?: string;
      stdout?: string;
    };

    const exitCode = typeof jqError.code === 'number' ? jqError.code : undefined;

    return {
      ...(exitCode !== undefined ? {exitCode} : {}),
      stderr: jqError.stderr || jqError.message || 'jq execution failed',
      stdout: jqError.stdout || '',
    };
  }
}

function getJqErrorHint(filter: string, errorMessage: string): string | null {
  if (errorMessage.includes('cannot be negated')) {
    return `A numeric field in the filter is null. Use a default value, for example \`${filter.replace(/-\s*\.quote/g, '-(.quote // 0)').replace(/\(\.quote\s*\|\|\s*0\)/g, '(.quote // 0)')}\` or explicitly write \`(.quote // 0)\`.`;
  }

  if (errorMessage.includes('Cannot iterate over null')) {
    return 'Part of the filter is iterating over a null value. Guard it with `// []` for arrays or `// 0` for numbers.';
  }

  if (errorMessage.includes('is not defined')) {
    return 'The filter is referencing a field without jq root access. Use `.items`, `.pagination`, or `.[0]` instead of bare identifiers when needed.';
  }

  return null;
}
