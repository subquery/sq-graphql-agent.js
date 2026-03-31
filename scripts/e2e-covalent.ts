// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import 'dotenv/config';
import pino from 'pino';
import {createCovalentAgent} from '../src/covalent/index.js';
import type {CovalentAgentConfig, CovalentConfig} from '../src/covalent/types.js';

const logger = pino({level: process.env.LOG_LEVEL || 'info'});

const COVALENT_BASE_URL = 'https://api.covalenthq.com';

async function main() {
  const question = process.argv[2];

  if (!question) {
    console.error('Usage: npx tsx scripts/e2e-covalent.ts "your question here"');
    console.error('\nExample:');
    console.error('  npx tsx scripts/e2e-covalent.ts "What tokens does vitalik.eth own on Ethereum?"');
    console.error('  npx tsx scripts/e2e-covalent.ts "Show me recent transactions for vitalik.eth on Polygon"');
    console.error('  npx tsx scripts/e2e-covalent.ts "What NFTs does vitalik.eth own on Base?"');
    process.exit(1);
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const covalentApiKey = process.env.COVALENT_API_KEY;
  if (!covalentApiKey) {
    console.error('Error: COVALENT_API_KEY environment variable is required');
    console.error('Get your API key at https://goldrush.dev/platform/');
    process.exit(1);
  }

  const covalentConfig: CovalentConfig = {
    baseUrl: COVALENT_BASE_URL,
    authorization: `Bearer ${covalentApiKey}`,
  };

  const agentConfig: CovalentAgentConfig = {
    llm: {
      model: process.env.LLM_MODEL || 'gpt-4o',
      apiKey: openaiApiKey,
      temperature: 0,
      ...(process.env.OPENAI_API_BASE ? {baseUrl: process.env.OPENAI_API_BASE} : {}),
    },
    verbose: parseInt(process.env.VERBOSE ?? '1', 10),
  };

  console.log(`Initializing Covalent agent...`);
  console.log(`Model: ${agentConfig.llm.model}`);

  const agent = createCovalentAgent(covalentConfig, agentConfig, logger);

  console.log(`\n[Question]: ${question}\n`);
  console.log('[Agent]: Thinking...\n');

  try {
    const result = await agent.invoke(question);
    console.log('[Answer]:');
    console.log(result);
  } catch (error) {
    console.error('[Error]:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
