// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

const IPFS_GATEWAY_POOL: Array<{url: string; method: string}> = [
  {
    url: 'https://unauthipfs.subquery.network/ipfs/api/v0/cat?arg=',
    method: 'POST',
  },
  {url: 'https://ipfs.thegraph.com/ipfs/', method: 'GET'},
];

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

export async function fetchFromIPFS(rawPath: string): Promise<string> {
  const normalizedPath = rawPath
    .replace(/^ipfs:\/\//, '')
    .replace(/^\/?ipfs\//, '')
    .replace(/^\/+/, '');

  // Get gateway pool from environment or use default
  let gatewayPool = IPFS_GATEWAY_POOL;
  if (process.env.IPFS_CONFIG) {
    try {
      gatewayPool = JSON.parse(process.env.IPFS_CONFIG);
    } catch {
      // Failed to parse IPFS_CONFIG, using default gateway pool
    }
  }

  const errors: Array<{url: string; error: string}> = [];

  // Create a promise for each gateway
  const fetchPromises = gatewayPool.map(async (gateway) => {
    try {
      const requestUrl = `${gateway.url}${encodeURIComponent(normalizedPath)}`;
      const response = await fetchWithTimeout(requestUrl, {
        method: gateway.method,
      });

      if (!response.ok) {
        const text = await response.text();
        const errorMsg = `Gateway ${gateway.url} responded with ${response.status} ${response.statusText}: ${text}`;
        errors.push({url: gateway.url, error: errorMsg});
        // logger.debug(
        //   {gateway: gateway.url, status: response.status},
        //   "IPFS gateway request failed"
        // );
        throw new Error(errorMsg);
      }

      // Success - return the content
      // logger.debug(
      //   {gateway: gateway.url},
      //   "Successfully fetched from IPFS gateway"
      // );
      return await response.text();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({url: gateway.url, error: errorMsg});
      // logger.debug(
      //   {gateway: gateway.url, error: errorMsg},
      //   "IPFS gateway request error"
      // );
      throw error;
    }
  });

  try {
    // Race all promises - return first successful result
    return await Promise.race(fetchPromises);
  } catch {
    // If Promise.race throws, wait for all to complete to collect errors
    await Promise.allSettled(fetchPromises);

    // All gateways failed
    const errorSummary = errors.map((e) => `${e.url}: ${e.error}`).join('; ');
    throw new Error(
      `Failed to fetch ${normalizedPath} from all IPFS gateways (${errors.length} tried): ${errorSummary}`
    );
  }
}
