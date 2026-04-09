// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import type {Logger} from 'pino';
import type {CovalentConfig} from './types.js';

const ABSOLUTE_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

interface CovalentResponse {
  data: unknown;
  error: boolean;
  error_message?: string | undefined;
  error_code?: number | undefined;
}

function resolveCovalentUrl(path: string, baseUrl: string): URL {
  if (path.startsWith('//')) {
    throw new Error('Protocol-relative URLs are not allowed');
  }

  if (ABSOLUTE_SCHEME_PATTERN.test(path)) {
    throw new Error('Absolute URLs are not allowed');
  }

  const base = new URL(baseUrl);
  const resolvedUrl = new URL(path, base);

  if (resolvedUrl.origin !== base.origin) {
    throw new Error('Cross-origin requests are not allowed');
  }

  return resolvedUrl;
}

/**
 * Covalent REST API Service
 *
 * Handles REST API requests to Covalent (GoldRush) endpoints.
 */
export class CovalentService {
  constructor(
    private readonly config: CovalentConfig,
    private readonly logger?: Logger
  ) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.authorization) {
      headers.Authorization = this.config.authorization;
    }
    return headers;
  }

  /**
   * Execute a REST API request to Covalent
   *
   * @param path - API path (e.g., /v1/eth-mainnet/address/0x.../balances_v2/)
   * @param params - Optional query parameters
   * @returns Parsed JSON response
   */
  async execute(path: string, params?: Record<string, string | number | boolean>): Promise<CovalentResponse> {
    const baseUrl = this.config.baseUrl || 'https://api.covalenthq.com';
    const url = resolveCovalentUrl(path, baseUrl);

    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    this.logger?.debug({url: url.toString()}, 'Executing Covalent REST request');

    try {
      const response = await fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger?.error({status: response.status, body: text}, 'Covalent API error');
        return {
          data: null,
          error: true,
          error_message: `HTTP ${response.status}: ${response.statusText}`,
          error_code: response.status,
        };
      }

      const result: unknown = await response.json();

      // Type guard for Covalent response
      if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'boolean') {
        const covalentResult = result as {
          data: unknown;
          error: boolean;
          error_message?: string | undefined;
          error_code?: number | undefined;
        };

        if (covalentResult.error) {
          this.logger?.warn({error: covalentResult.error_message}, 'Covalent API returned error');
          const errorResponse: CovalentResponse = {
            data: null,
            error: true,
          };
          if (covalentResult.error_message !== undefined) {
            errorResponse.error_message = covalentResult.error_message;
          }
          if (covalentResult.error_code !== undefined) {
            errorResponse.error_code = covalentResult.error_code;
          }
          return errorResponse;
        }

        if (covalentResult.data === null || covalentResult.data === undefined) {
          this.logger?.warn(
            {error: covalentResult.error_message || 'Missing data in Covalent response'},
            'Covalent API returned success without data'
          );
          const errorResponse: CovalentResponse = {
            data: null,
            error: true,
            error_message: 'Missing data in Covalent response',
          };
          if (covalentResult.error_code !== undefined) {
            errorResponse.error_code = covalentResult.error_code;
          }
          return errorResponse;
        }

        this.logger?.debug({hasData: !!covalentResult.data}, 'Covalent request successful');
        return {
          data: covalentResult.data,
          error: false,
        };
      }

      // Unexpected response format
      this.logger?.warn({result}, 'Unexpected response format');
      return {
        data: result,
        error: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error({error: errorMessage}, 'Covalent request failed');
      return {
        data: null,
        error: true,
        error_message: errorMessage,
      };
    }
  }
}
