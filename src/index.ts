import type { Logger } from 'pino';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
  type GraphQLAgent, type GraphQLAgentConfig,
  type GraphQLProjectConfig,
  type PersistentService
} from "./types.js";
import { GraphQLService } from "./graphql.service.js";
import { ProjectManager } from "./project-manager.js";
import { createGraphQLTools } from "./tools/index.js";
import { BaseMessage, HumanMessage, isAIMessage, SystemMessage } from "@langchain/core/messages";
import { buildSystemPrompt } from "./prompts.js";
import { ChatOpenAI } from "@langchain/openai";

export async function createGraphQLAgent(
  project: GraphQLProjectConfig,
  agentConfig: GraphQLAgentConfig,
  logger?: Logger
): Promise<GraphQLAgent> {
  const llm = new ChatOpenAI({
    model: agentConfig.llm.model,
    temperature: agentConfig.llm.temperature ?? 0,
    apiKey: agentConfig.llm.apiKey ?? '',
    configuration: {
      baseURL: agentConfig.llm.baseUrl,
    }
  });
  const service = new GraphQLService(project, true,logger);
  const tools = createGraphQLTools(service, project, logger);
  const agent = createReactAgent({ llm, tools }).withConfig({
    recursionLimit: 10,
  });

  return {
    async invoke(question: string): Promise<string> {
      const systemPrompt = buildSystemPrompt(project, agentConfig.verbose);
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(question),
      ];

      const result = await agent.invoke({ messages });
      const text = extractText(result);

      return text || "Agent completed without producing a final response.";
    }
  }
}

export async function initializeProjectConfig(
  endpoint: string,
  persistentService: PersistentService,
  llmConfig: GraphQLAgentConfig['llm'],
  customHeaders?: Record<string, string>,
  logger?: Logger
): Promise<GraphQLProjectConfig> {
  const authorization = customHeaders?.['Authorization'];
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

  const enriched = await pm.enrichGraphQLConfig(
    config,
    false,
    logger,
  );
  await persistentService.save(endpoint, enriched);
  return enriched;

}

function extractText(result: any): string | null {
  if (!result) {
    return null;
  }
  if (Array.isArray(result.messages)) {
    const msgs = result.messages as BaseMessage[];
    const aiMessages = msgs.filter((msg) => isAIMessage(msg));

    if (aiMessages.length > 0) {
      const last = aiMessages[aiMessages.length - 1];
      if (typeof last?.content === "string") {
        return last.content;
      }
      if (Array.isArray(last?.content)) {
        return last.content
          .map((entry: any) =>
            entry && typeof entry.text === "string" ? entry.text : ""
          )
          .join("\n");
      }
    }
  }

  if (typeof result.output === "string") {
    return result.output;
  }

  return null;
}





