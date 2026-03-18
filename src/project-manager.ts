// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {type Logger} from 'pino';
import yaml from 'yaml';
import {getCodexQuerySchema} from './codex/schema.js';
import type {GraphQLService} from './graphql.service.js';
import {analyzeProjectWithLLM} from './llm.js';
import {
  type GraphQLAgentConfig,
  type GraphQLAnalysisResult,
  type GraphQLProjectConfig,
  GraphqlProvider,
  type ProjectManifest,
} from './types.js';
import {fetchFromIPFS} from './utils.js';

export class ProjectManager {
  constructor(
    private readonly graphqlService: GraphQLService,
    private readonly llmConfig: GraphQLAgentConfig['llm'],
    private logger?: Logger
  ) {}

  // Enrich GraphQL project config with analysis data
  async enrichGraphQLConfig(
    config: GraphQLProjectConfig,
    force = false,
    logger?: Logger
  ): Promise<GraphQLProjectConfig> {
    if (!this.shouldAttemptAnalysis(config, force)) {
      return config;
    }

    // Check for Codex FIRST - skip IPFS logic
    if (this.isCodexEndpoint(config.endpoint)) {
      return this.enrichCodexConfig(config, logger);
    }

    try {
      // Load project resources (now returns GraphQLProjectConfig)
      let [updated, manifest] = await this.loadProjectResources(config);

      // We need to get the manifest for analysis, but we won't store it
      const analysis = await this.obtainGraphQLAnalysis(manifest, updated.schemaContent);

      if (analysis) {
        updated = {
          ...updated,
          domainName: analysis.domainName,
          domainCapabilities: analysis.domainCapabilities,
          declineMessage: analysis.declineMessage,
          suggestedQuestions: analysis.suggestedQuestions,
          lastAnalyzedAt: new Date().toISOString(),
        };
        delete updated.lastAnalysisError;
      } else {
        updated.lastAnalysisError = 'LLM analysis returned no result.';
      }

      if (!updated.introspectionSchema) {
        try {
          const introspectionSchema = await this.graphqlService.fetchIntrospectionSchema();

          if (introspectionSchema) {
            updated.introspectionSchema = introspectionSchema;
            logger?.info({cid: updated.cid}, 'Cached introspection schema');
          }
        } catch (error) {
          logger?.warn(
            {
              cid: updated.cid,
              error: error instanceof Error ? error.message : String(error),
              errorType: 'introspection_cache_failed',
            },
            'Failed to cache introspection schema'
          );
        }
      }

      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.warn(
        {
          cid: config.cid,
          error: message,
          errorType: 'graphql_analysis_failed',
        },
        'GraphQL analysis failed'
      );
      return {
        ...config,
        lastAnalysisError: message,
      };
    }
  }

  private isCodexEndpoint(endpoint: string): boolean {
    try {
      const hostname = new URL(endpoint).hostname.toLowerCase();
      return hostname.includes('codex.io') || hostname.includes('codex');
    } catch {
      return false;
    }
  }

  private enrichCodexConfig(config: GraphQLProjectConfig, logger?: Logger): GraphQLProjectConfig {
    logger?.info({endpoint: config.endpoint}, 'Detected Codex endpoint, using embedded schema');

    return {
      ...config,
      schemaContent: getCodexQuerySchema(),
      nodeType: GraphqlProvider.CODEX,
      domainName: 'Codex GraphQL API',
      domainCapabilities: [
        'NFT pool queries and analytics',
        'NFT collection metadata and stats',
        'Token prices and market data',
        'Wallet tracking and balances',
        'DEX pair and exchange data',
        'Chain & Block information',
      ],
      declineMessage: 'This query is outside the scope of Codex API capabilities.',
      suggestedQuestions: [
        'What block information can I get for specific block numbers or timestamps?',
        'Which blockchain networks are supported and what are their basic details?',
        'What information is available about specific NFT pools, including their current state and liquidity?',
        'Can I see events like swaps, mints, or burns for NFT pools based on various filters?',
        'How do I get aggregated statistics for an NFT collection within specific marketplaces?',
        'What collections have active liquidity pools on particular marketplaces?',
        'How can I find all pools for a specific collection or owned by a specific wallet?',
        'Can I get time-series statistics for NFT pools and collections over custom time ranges?',
        'How can I search and filter NFT collections using various criteria like network, type, or trading volume?',
        'What metadata is available for specific NFT collections, including images and market statistics?',
        'How do I retrieve assets within a collection and optionally fetch missing on-chain data?',
        'Can I get bucketed time-series statistics for NFT collections for charting purposes?',
        'What transaction events (sales, transfers) are available for NFTs across marketplaces?',
        'How can I batch-fetch metadata for multiple NFT collections at once?',
        'What filtering options exist for Parallel NFT assets based on their unique attributes?',
        'Can I track historical changes to Parallel card metadata over time?',
        'How do I get information about staked assets and events in Prime gaming pools?',
        'Who holds specific NFT collections and how many do they own?',
        'What NFTs does a particular wallet own, across collections or within specific collections?',
        'Can I see token balances for a wallet and who holds specific tokens?',
        'How can I filter and search tokens based on metrics like price, volume, or liquidity?',
        'What trading pairs exist and how can I filter them by network, exchange, or token?',
        'Which DEX exchanges are supported and how can I search/filter them?',
        'Can I get time-series charting data for tokens and pairs with customizable timeframes?',
        'What real-time and historical price data is available for multiple tokens?',
        'How do I retrieve recent swap, mint, and burn events for tokens and pairs?',
        'What information is available about liquidity locks for tokens and pairs?',
      ],
      lastAnalyzedAt: new Date().toISOString(),
    };
  }

  private detectProvider(manifest: ProjectManifest): GraphqlProvider {
    const runner = manifest.runner as Record<string, unknown> | undefined;
    const nodeName = this.extractName(runner?.node);
    const queryName = this.extractName(runner?.query);

    // Check for SubQL runner
    if (nodeName.startsWith('@subql/') || queryName.startsWith('@subql/')) {
      return GraphqlProvider.SUBQL;
    }

    // Check schema file for provider hints
    const schemaProvider = this.detectProviderFromSchema(manifest.schema);
    if (schemaProvider) {
      return schemaProvider;
    }

    // Default to The Graph if no runner but has schema
    if (!runner && manifest.schema) {
      return GraphqlProvider.THE_GRAPH;
    }

    throw new Error('Unable to determine GraphQL provider (expected subql or thegraph project metadata).');
  }

  private extractName(field: unknown): string {
    if (typeof field === 'string') {
      return field;
    }
    if (typeof field === 'object' && field && 'name' in field && typeof field.name === 'string') {
      return field.name;
    }
    return '';
  }

  private detectProviderFromSchema(schema: ProjectManifest['schema']): GraphqlProvider | null {
    if (!schema || typeof schema !== 'object') {
      return null;
    }

    const fileInfo = (schema as Record<string, unknown>).file;
    if (typeof fileInfo === 'string' && fileInfo.startsWith('ipfs://')) {
      return GraphqlProvider.SUBQL;
    }

    if (typeof fileInfo === 'object' && fileInfo) {
      const fileRecord = fileInfo as Record<string, unknown>;
      if (typeof fileRecord['/'] === 'string') {
        const pointer = fileRecord['/'];
        if (typeof pointer === 'string' && pointer.startsWith('/ipfs/')) {
          return GraphqlProvider.THE_GRAPH;
        }
      }
    }

    return null;
  }

  // Resolve schema content based on manifest and CID
  private async resolveSchemaContent(cid: string, manifest: ProjectManifest): Promise<string> {
    const schemaInfo = manifest.schema;
    if (!schemaInfo) {
      throw new Error('Manifest does not declare a schema.');
    }

    if (typeof schemaInfo === 'string') {
      if (schemaInfo.startsWith('ipfs://')) {
        return fetchFromIPFS(schemaInfo);
      }
      const schemaPath = schemaInfo.startsWith('/') ? schemaInfo.slice(1) : schemaInfo;
      return fetchFromIPFS(`${cid}/${schemaPath}`);
    }

    if (typeof schemaInfo === 'object') {
      const file = (schemaInfo as Record<string, unknown>).file;
      if (typeof file === 'string') {
        if (file.startsWith('ipfs://')) {
          return fetchFromIPFS(file);
        }
        const normalized = file.startsWith('/ipfs/') ? file.replace('/ipfs/', '') : `${cid}/${file.replace(/^\//, '')}`;
        return fetchFromIPFS(normalized);
      }
      if (file && typeof file === 'object' && typeof (file as Record<string, unknown>)['/'] === 'string') {
        const pointer = (file as Record<string, unknown>)['/'] as string;
        const normalized = pointer.startsWith('/ipfs/')
          ? pointer.replace('/ipfs/', '')
          : pointer.replace(/^ipfs:\/\//, '');
        return fetchFromIPFS(normalized);
      }
    }

    throw new Error('Unsupported schema definition in manifest.');
  }

  private parseManifest(content: string): ProjectManifest {
    try {
      return JSON.parse(content);
    } catch {
      try {
        return yaml.parse(content) as ProjectManifest;
      } catch (error) {
        throw new Error(`Manifest is neither valid JSON nor YAML: ${(error as Error).message}`);
      }
    }
  }

  // Load project resources and return graphql schema and provider type
  private async loadProjectResources(config: GraphQLProjectConfig): Promise<[GraphQLProjectConfig, ProjectManifest]> {
    const manifestContent = await fetchFromIPFS(config.cid);
    const manifest = this.parseManifest(manifestContent);
    const schema = await this.resolveSchemaContent(config.cid, manifest);
    const provider = this.detectProvider(manifest);

    return [
      {
        ...config,
        schemaContent: schema,
        nodeType: provider,
      },
      manifest,
    ];
  }

  private async obtainGraphQLAnalysis(
    manifest: ProjectManifest,
    schema: string,
    customHeaders?: Record<string, string>
  ): Promise<GraphQLAnalysisResult> {
    return analyzeProjectWithLLM(manifest, schema, this.llmConfig, customHeaders);
  }

  private shouldAttemptAnalysis(config: GraphQLProjectConfig, force: boolean): boolean {
    if (force) {
      return true;
    }

    return (
      !config.domainName ||
      !config.domainCapabilities ||
      config.domainCapabilities.length === 0 ||
      !config.schemaContent
    );
  }
}
