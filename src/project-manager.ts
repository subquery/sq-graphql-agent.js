// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {type Logger} from 'pino';
import yaml from 'yaml';
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
