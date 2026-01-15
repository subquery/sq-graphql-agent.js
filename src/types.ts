// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import type {IntrospectionQuery} from 'graphql';
import type {Logger} from 'pino';

export type GraphQLAgent = {
  invoke: (question: string) => Promise<string>;
};

export enum GraphqlProvider {
  SUBQL = 'subql',
  THE_GRAPH = 'thegraph',
  UNKNOWN = 'unknown',
}

export interface ProjectManifest {
  name?: string;
  description?: string;
  network?: {
    chainId?: string;
    endpoint?: string;
  };
  dataSources?: Array<{
    kind?: string;
    [key: string]: unknown;
  }>;
  schema?:
    | string
    | {
        file?: string | {'/': string};
      };
  runner?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GraphQLAnalysisResult {
  domainName: string;
  domainCapabilities: string[];
  declineMessage: string;
  // suggestedQuestions: string[];
}

export interface GraphQLProjectConfigInput {
  endpoint: string;
  authorization?: string | undefined;
  cid?: string;
}

export interface GraphQLProjectConfig extends GraphQLProjectConfigInput {
  cid: string;
  schemaContent: string;
  nodeType: GraphqlProvider;
  updatedAt: string;
  lastAnalyzedAt?: string;
  lastAnalysisError?: string;
  domainName: string;
  domainCapabilities: string[];
  declineMessage: string;
  // Cached introspection schema from endpoint
  introspectionSchema?: IntrospectionQuery;
}

export type PersistentService = {
  save(endpoint: string, config: GraphQLProjectConfig, namespace?: string): Promise<void>;
  load(endpoint: string, cid?: string, namespace?: string): Promise<GraphQLProjectConfig | undefined>;
};

export type GraphQLAgentConfig = {
  llm: {
    model: string;
    baseUrl?: string; // must put into env variable OPENAI_API_BASE
    apiKey?: string;
    temperature?: number;
  };
  verbose: number; // 0 = compact, 1 = with reason, 2 = debug
  logger?: Logger;
};
