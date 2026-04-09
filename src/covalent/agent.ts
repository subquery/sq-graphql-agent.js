// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {BaseMessage, HumanMessage, isAIMessage, SystemMessage} from '@langchain/core/messages';
import {createReactAgent} from '@langchain/langgraph/prebuilt';
import {ChatOpenAI} from '@langchain/openai';
import type {Logger} from 'pino';
import {CovalentContext} from './context.js';
import {buildCovalentSystemPrompt} from './prompts.js';
import {createCovalentTools} from './tools/index.js';
import type {CovalentAgent, CovalentAgentConfig, CovalentConfig} from './types.js';

type AgentResult = {
  messages?: BaseMessage[];
};

type ContentEntry = {
  text?: string;
  [key: string]: unknown;
};

function extractTextFromResult(result: AgentResult): string | null {
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

  return null;
}

/**
 * Create a Covalent (GoldRush) REST API agent
 *
 * @param config - Covalent API configuration (baseUrl, authorization)
 * @param agentConfig - Agent configuration (LLM settings, verbosity)
 * @param logger - Optional logger instance
 * @returns CovalentAgent with invoke() method
 */
export function createCovalentAgent(
  config: CovalentConfig,
  agentConfig: CovalentAgentConfig,
  logger?: Logger
): CovalentAgent {
  // Create LLM instance
  const llm = new ChatOpenAI({
    model: agentConfig.llm.model,
    temperature: agentConfig.llm.temperature ?? 0,
    apiKey: agentConfig.llm.apiKey ?? '',
    configuration: {
      baseURL: agentConfig.llm.baseUrl,
    },
  });

  return {
    async invoke(question: string): Promise<string> {
      // Create per-invocation context so cached jq/head state is never shared across requests.
      const context = new CovalentContext();
      const tools = createCovalentTools(config, context, logger);
      const agent = createReactAgent({llm, tools}).withConfig({
        recursionLimit: 30,
      });

      const systemPrompt = buildCovalentSystemPrompt(agentConfig);
      const messages = [new SystemMessage(systemPrompt), new HumanMessage(question)];

      try {
        logger?.debug({questionLength: question.length}, 'Starting agent invocation');
        const result = await agent.invoke({messages});
        logger?.debug({hasMessages: !!result?.messages, questionLength: question.length}, 'Agent invocation completed');
        const text = extractTextFromResult(result);
        return text || 'Agent completed without producing a final response.';
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        let errorDetails: string | undefined;
        if (error instanceof Error && 'response' in error) {
          const errorResponse = (error as Record<string, unknown>).response;
          try {
            errorDetails = JSON.stringify(errorResponse, null, 2);
          } catch {
            errorDetails = errorResponse !== undefined ? String(errorResponse) : '[unserializable error response]';
          }
        }

        logger?.error(
          {
            error: errorMessage,
            stack: errorStack,
            details: errorDetails,
          },
          'Agent invocation failed'
        );

        throw error;
      }
    },
  };
}
