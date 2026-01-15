// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {GraphQLSchema, buildClientSchema, parse, validate, type IntrospectionQuery} from 'graphql';
import {type Logger} from 'pino';
import type {GraphQLProjectConfig} from './types.js';

// // Create logger for GraphQL service operations
// const logger = getLogger('graphql-service');

async function fetchJSON(
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs = 30000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(`GraphQL request failed (${response.status} ${response.statusText}): ${text}`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enhanced fetch function with security features for CID fetching
 * Supports redirect validation, timeout, and size limits
 */
async function secureFetch(
  endpoint: string,
  body: Record<string, unknown>,
  options: {
    headers: Record<string, string>;
    timeoutMs?: number;
    maxRedirects?: number;
    maxContentLength?: number;
    validateRedirect?: (url: string) => void;
  }
): Promise<unknown> {
  const {headers, maxContentLength = 10 * 1024 * 1024, maxRedirects = 3, timeoutMs = 10000, validateRedirect} = options;

  let redirectCount = 0;
  let currentUrl = endpoint;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (redirectCount <= maxRedirects) {
      const response = await fetch(currentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Handle redirects manually if needed
      if (response.status >= 300 && response.status < 400 && response.headers.get('Location')) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error(`Too many redirects (max: ${maxRedirects})`);
        }

        const redirectUrl = response.headers.get('Location');
        if (!redirectUrl) {
          throw new Error('Redirect location header is missing');
        }
        const absoluteUrl = new URL(redirectUrl, currentUrl).toString();

        // Validate redirect security
        if (validateRedirect) {
          validateRedirect(absoluteUrl);
        }

        currentUrl = absoluteUrl;
        continue;
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxContentLength) {
        throw new Error(`Response too large: ${contentLength} bytes (max: ${maxContentLength})`);
      }

      // Read response with size limit
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Unable to read response body');
      }

      let receivedLength = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        receivedLength += value.length;
        if (receivedLength > maxContentLength) {
          void reader.cancel();
          throw new Error(`Response too large: ${receivedLength} bytes (max: ${maxContentLength})`);
        }

        chunks.push(value);
      }

      // Combine chunks and parse
      const responseBody = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        responseBody.set(chunk, position);
        position += chunk.length;
      }

      const text = new TextDecoder().decode(responseBody);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      // Validate status
      if (!response.ok) {
        throw new Error(`Request failed (${response.status} ${response.statusText}): ${text}`);
      }

      return data;
    }
  } finally {
    clearTimeout(timer);
  }
  return undefined;
}

export class GraphQLService {
  private schemaCache = new Map<string, GraphQLSchema>();

  constructor(
    private readonly config: GraphQLProjectConfig,
    private readonly allowLocalhost = true,
    private readonly logger?: Logger
  ) {}

  private buildHeaders(_headers?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.authorization) {
      headers.Authorization = this.config.authorization;
    }
    if (_headers) {
      Object.assign(headers, _headers);
    }
    return headers;
  }

  private cacheKey(): string {
    return `${this.config.endpoint}:introspection`;
  }

  async fetchSchema(): Promise<GraphQLSchema> {
    const key = this.cacheKey();
    const cached = this.schemaCache.get(key);
    if (cached) {
      return cached;
    }

    let schema: GraphQLSchema;
    let introspectionData = this.config.introspectionSchema;
    if (!introspectionData) {
      introspectionData = await this.fetchIntrospectionSchema();
    }

    schema = buildClientSchema(introspectionData);

    this.schemaCache.set(key, schema);
    return schema;
  }

  // New method to fetch and return introspection schema for caching
  async fetchIntrospectionSchema(): Promise<IntrospectionQuery> {
    if (this.config.introspectionSchema) {
      return this.config.introspectionSchema;
    }

    try {
      const data = (await fetchJSON(this.config.endpoint, {query: INTROSPECTION_QUERY}, this.buildHeaders())) as {
        data: IntrospectionQuery;
      };

      return data.data;
    } catch (error) {
      this.logger?.warn(
        {
          endpoint: this.config.endpoint,
          error: error instanceof Error ? error.message : String(error),
          errorType: 'introspection_fetch_failed',
        },
        'Failed to fetch introspection schema'
      );
      throw error;
    }
  }

  async execute(query: string, variables?: Record<string, unknown>): Promise<any> {
    return fetchJSON(this.config.endpoint, variables ? {query, variables} : {query}, this.buildHeaders());
  }

  async validate(query: string): Promise<string[]> {
    const issues: string[] = [];
    try {
      parse(query);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      return issues;
    }

    try {
      const schema = await this.fetchSchema();
      const validationErrors = validate(schema, parse(query));
      for (const err of validationErrors) {
        issues.push(err.message);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }

    return issues;
  }

  /**
   * Fetches CID from GraphQL endpoint with caching
   * @param endpoint - GraphQL endpoint URL
   * @returns CID string or empty string if not found
   */
  async fetchCidFromEndpoint(
    endpoint: string,
    cacheTtl = 604800 // 7 days
  ): Promise<string> {
    try {
      // 1. URL security validation
      this.validateEndpointSecurity(endpoint);

      // 2. Cid is cached with project config caching, so skipping Redis cache here
      // const cachedCid = await this.getCidFromRedis(endpoint);
      // if (cachedCid) {
      //   return cachedCid;
      // }

      // 4. Prepare secure request headers
      const headers = this.createSecureRequestHeaders();

      // 5. Try first method: _metadata.deployments
      let cid: string | undefined;

      try {
        const response1 = await secureFetch(
          endpoint,
          {
            query: `{
  _metadata {
    deployments
  }
}`,
          },
          {
            headers,
            timeoutMs: 10000,
            maxRedirects: 3,
            maxContentLength: 10 * 1024 * 1024,
            validateRedirect: (url) => this.validateEndpointSecurity(url),
          }
        );

        const deployments = response1?.data?._metadata?.deployments as Record<string, string> | undefined;
        cid = deployments ? Object.values(deployments).pop() : undefined;

        if (cid) {
          this.logger?.info(`Successfully fetched CID from _metadata.deployments: ${cid}`);
        }
      } catch (error) {
        this.logger?.debug(
          `Failed to fetch CID from _metadata.deployments: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      // 6. If the first method fails, try second method: _meta.deployment
      if (!cid) {
        try {
          const response2 = await secureFetch(
            endpoint,
            {
              query: `{
  _meta {
    deployment
  }
}`,
            },
            {
              headers,
              timeoutMs: 10000,
              maxRedirects: 3,
              maxContentLength: 10 * 1024 * 1024,
              validateRedirect: (url) => this.validateEndpointSecurity(url),
            }
          );

          cid = response2?.data?._meta?.deployment as string | undefined;

          if (cid) {
            this.logger?.info(`Successfully fetched CID from _meta.deployment: ${cid}`);
          }
        } catch (error) {
          this.logger?.debug(
            `Failed to fetch CID from _meta.deployment: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // 7. If both methods fail, return empty string
      if (!cid) {
        this.logger?.warn(
          `No valid CID found for endpoint: ${endpoint} using both _metadata.deployments and _meta.deployment`
        );
        return '';
      }

      // 8. Clean CID (remove ipfs:// prefix)
      const cleanCid = cid.replace('ipfs://', '');

      this.logger?.info(`Successfully fetched CID: ${cleanCid} from ${endpoint}`);
      return cleanCid;
    } catch (error) {
      // Handle different types of errors
      if (error instanceof Error && error.message.includes('Security validation failed')) {
        this.logger?.error(`Security validation failed for ${endpoint}: ${error.message}`);
        throw error;
      }

      this.logger?.warn(`Failed to fetch CID from ${endpoint}: ${error}`);
      return '';
    }
  }

  /**
   * Validates endpoint URL for security
   */
  private validateEndpointSecurity(endpoint: string): void {
    // 1. Basic format check
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('Invalid endpoint format');
    }

    endpoint = endpoint.trim();

    // 2. Length limit
    if (endpoint.length > 2048) {
      throw new Error('Endpoint URL too long');
    }

    // 3. Parse URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      throw new Error('Invalid endpoint URL');
    }

    // 4. Protocol check - only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP/HTTPS protocols are allowed');
    }

    // 5. Hostname check - prevent SSRF
    const hostname = parsedUrl.hostname.toLowerCase();

    // Blocked hostnames
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.169.254', // AWS metadata service
      'metadata.google.internal', // GCP metadata service
    ];

    if (!this.allowLocalhost && blockedHosts.includes(hostname)) {
      throw new Error('Access to local/internal hosts is forbidden');
    }

    // 6. IP address check - prevent private network access
    const privateIpPatterns = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^127\./, // 127.0.0.0/8
      /^169\.254\./, // 169.254.0.0/16 (Link-local)
      /^fc[0-9a-f]{2}:/i, // IPv6 fc00::/7 (ULA)
      /^fd[0-9a-f]{2}:/i, // IPv6 fd00::/8 (ULA)
      /^fe80:/i, // IPv6 fe80::/10 (Link-local)
      /^::1$/, // IPv6 loopback
      /^::$/, // IPv6 unspecified (exact match only)
    ];

    if (!this.allowLocalhost) {
      for (const pattern of privateIpPatterns) {
        if (pattern.test(hostname)) {
          throw new Error('Access to private IP ranges is forbidden');
        }
      }
    }

    // 7. Port check - allow common web ports explicitly, and any high port (>= 1024)
    const port = parsedUrl.port;
    if (port) {
      const portNum = parseInt(port, 10);
      // Block system ports (< 1024) unless explicitly allowed
      const allowedPorts = [80, 443, 8080, 8443];
      if (!allowedPorts.includes(portNum) && portNum < 1024) {
        throw new Error('Port not allowed');
      }
    }

    // 8. URL should not contain credentials
    if (parsedUrl.username || parsedUrl.password) {
      throw new Error('URL should not contain credentials');
    }
  }

  /**
   * Creates secure request headers
   */
  private createSecureRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'SubQuery-MCP-Service/1.0',
    };

    // Add token (if provided)
    if (this.config.authorization) {
      headers.Authorization = this.config.authorization;
    }

    return headers;
  }
}

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }

  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;
