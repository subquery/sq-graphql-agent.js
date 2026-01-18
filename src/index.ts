// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {BaseMessage, HumanMessage, isAIMessage, SystemMessage} from '@langchain/core/messages';
import {createReactAgent} from '@langchain/langgraph/prebuilt';
import {ChatOpenAI} from '@langchain/openai';
import type {Logger} from 'pino';
import {GraphQLService} from './graphql.service.js';
import {ProjectManager} from './project-manager.js';
import {buildSystemPrompt} from './prompts.js';
import {createGraphQLTools} from './tools/index.js';
import {
  type GraphQLAgent,
  type GraphQLAgentConfig,
  type GraphQLProjectConfig,
  type PersistentService,
} from './types.js';

export function createGraphQLAgent(
  project: GraphQLProjectConfig,
  agentConfig: GraphQLAgentConfig,
  logger?: Logger
): GraphQLAgent {
  const llm = new ChatOpenAI({
    model: agentConfig.llm.model,
    temperature: agentConfig.llm.temperature ?? 0,
    apiKey: agentConfig.llm.apiKey ?? '',
    configuration: {
      baseURL: agentConfig.llm.baseUrl,
    },
  });
  const service = new GraphQLService(project, true, logger);
  const verbose = agentConfig.verbose > 0 ? String(agentConfig.verbose) : undefined;
  const tools = createGraphQLTools(service, project, logger, verbose);
  const agent = createReactAgent({llm, tools}).withConfig({
    recursionLimit: 10,
  });

  return {
    async invoke(question: string): Promise<string> {
      const systemPrompt = buildSystemPrompt(project, agentConfig.verbose);
      const messages = [new SystemMessage(systemPrompt), new HumanMessage(question)];

      const result = await agent.invoke({messages});
      const text = extractText(result);

      return text || 'Agent completed without producing a final response.';
    },
  };
}

export async function initializeProjectConfig(
  endpoint: string,
  persistentService: PersistentService,
  llmConfig: GraphQLAgentConfig['llm'],
  customHeaders?: Record<string, string>,
  logger?: Logger
): Promise<GraphQLProjectConfig> {
  const authorization = customHeaders?.Authorization;
  const graphqlService = new GraphQLService({endpoint, authorization} as GraphQLProjectConfig);
  const cid = await graphqlService.fetchCidFromEndpoint(endpoint);

  let config = await persistentService.load(endpoint, cid);
  if (!config) {
    // Create minimal config without endpoint - endpoint will be read from headers
    config = {
      cid,
      endpoint,
      authorization,
    } as GraphQLProjectConfig;
  }

  const pm = new ProjectManager(graphqlService, llmConfig, logger);

  const enriched = await pm.enrichGraphQLConfig(config, false, logger);
  await persistentService.save(endpoint, enriched);
  return enriched;
}

type AgentResult = {
  messages?: BaseMessage[];
  output?: string;
};

type ContentEntry = {
  text?: string;
  [key: string]: unknown;
};

function extractText(result: AgentResult): string | null {
  if (!result) {
    return null;
  }
  if (Array.isArray(result.messages)) {
    const msgs = result.messages as BaseMessage[];
    const aiMessages = msgs.filter((msg) => isAIMessage(msg));

    if (aiMessages.length > 0) {
      const last = aiMessages[aiMessages.length - 1];
      if (typeof last?.content === 'string') {
        return last.content;
      }
      if (Array.isArray(last?.content)) {
        return last.content
          .map((entry: ContentEntry) => (entry && typeof entry.text === 'string' ? entry.text : ''))
          .join('\n');
      }
    }
  }

  if (typeof result.output === 'string') {
    return result.output;
  }

  return null;
}
