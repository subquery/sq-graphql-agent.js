// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import type {Logger} from 'pino';
import type {GraphQLAgentStreamChunk, GraphQLAgentStreamOptions} from '../types.js';

/**
 * Configuration for the Covalent (GoldRush) REST API agent
 */
export interface CovalentAgentConfig {
  llm: {
    model: string;
    baseUrl?: string;
    apiKey?: string;
    temperature?: number;
  };
  verbose: number; // 0 = compact, 1 = with reason, 2 = debug
  logger?: Logger;
}

/**
 * Covalent API configuration
 */
export interface CovalentConfig {
  baseUrl: string;
  authorization?: string;
}

/**
 * Covalent Agent interface
 */
export interface CovalentAgent {
  invoke: (question: string) => Promise<string>;
  stream: (question: string, options?: GraphQLAgentStreamOptions) => Promise<AsyncIterable<GraphQLAgentStreamChunk>>;
}
