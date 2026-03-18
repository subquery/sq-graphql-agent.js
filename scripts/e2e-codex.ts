// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import 'dotenv/config';
import pino from 'pino';
import {createGraphQLAgent, initializeProjectConfig} from '../src/index.js';
import {type GraphQLAgentConfig, type GraphQLProjectConfig, type PersistentService} from '../src/types.js';

const logger = pino({level: process.env.LOG_LEVEL || 'info'});

const CODEX_ENDPOINT = 'https://graph.codex.io/graphql';

// Simple in-memory persistent service (same as test)
class InMemoryPersistentService implements PersistentService {
  private storage = new Map<string, GraphQLProjectConfig>();

  async save(endpoint: string, config: GraphQLProjectConfig): Promise<void> {
    this.storage.set(endpoint, config);
  }

  async load(endpoint: string): Promise<GraphQLProjectConfig | undefined> {
    return this.storage.get(endpoint);
  }
}

async function main() {
  const question = process.argv[2];

  if (!question) {
    console.error('Usage: npx tsx scripts/e2e-codex.ts "your question here"');
    console.error('\nExample:');
    console.error('  npx tsx scripts/e2e-codex.ts "What is the current price of SQT?"');
    process.exit(1);
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const codexApiKey = process.env.CODEX_API_KEY;

  const llmConfig: GraphQLAgentConfig['llm'] = {
    model: process.env.LLM_MODEL || 'gpt-4o',
    apiKey: openaiApiKey,
    temperature: 0,
    ...(process.env.OPENAI_API_BASE ? {baseUrl: process.env.OPENAI_API_BASE} : {}),
  };

  const persistentService = new InMemoryPersistentService();

  console.log(`Initializing Codex config for endpoint: ${CODEX_ENDPOINT}`);

  // Use initializeProjectConfig like the test does
  const config = await initializeProjectConfig(CODEX_ENDPOINT, persistentService, llmConfig, undefined, logger);

  // Set authorization directly (same pattern as test)
  if (codexApiKey) {
    config.authorization = codexApiKey;
  }

  console.log(`Config initialized for: ${config.domainName}`);
  console.log(`Provider: ${config.nodeType}`);

  const agentConfig: GraphQLAgentConfig = {
    llm: llmConfig,
    verbose: 1,
  };

  console.log(`\n[Question]: ${question}\n`);
  console.log('[Agent]: Thinking...\n');

  try {
    const agent = createGraphQLAgent(config, agentConfig, logger);
    const result = await agent.invoke(question);
    console.log('[Answer]:');
    console.log(result);
  } catch (error) {
    console.error('[Error]:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
