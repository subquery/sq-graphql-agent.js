import OpenAI from "openai";
import type { GraphQLAgentConfig, GraphQLAnalysisResult, ProjectManifest } from "./types.js";

function buildAnalysisPrompt(
  manifest: ProjectManifest,
  schemaContent: string
): string {
  const projectName = manifest.name || "Unknown Project";
  const description = manifest.description || "";
  const network =
    manifest.network?.chainId ||
    manifest.network?.endpoint ||
    "Unknown network";
  const dataSources =
    manifest.dataSources?.map((ds) => ds.kind || "unknown").join(", ") ||
    "Unknown";

  return `Analyze this GraphQL indexing project and generate agent configuration metadata.

PROJECT INFO:
- Name: ${projectName}
- Description: ${description}
- Network: ${network}
- Data sources: ${dataSources}

GRAPHQL SCHEMA:
\`\`\`graphql
${schemaContent}
\`\`\`

Respond with JSON matching:
{
  "domain_name": "Project name",
  "domain_capabilities": ["..."], // A list of specific capabilities or topics this project can answer questions about.
  "decline_message": "A message explaining what is out of scope for this project."
}

Ensure capabilities reference actual schema entities.`;
}

export async function analyzeProjectWithLLM(
  manifest: ProjectManifest,
  schemaContent: string,
  llmConfig: GraphQLAgentConfig["llm"],
  customHeaders?: Record<string, string>
): Promise<GraphQLAnalysisResult> {
  const client = createOpenAIClient(llmConfig.apiKey, llmConfig.baseUrl, customHeaders);
  const prompt = buildAnalysisPrompt(manifest, schemaContent);
  const response = await client.chat.completions.create({
    model: llmConfig.model,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content:
          "You produce concise JSON metadata describing GraphQL indexing projects.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  return parseAnalysis(raw);
}

function parseAnalysis(text: string): GraphQLAnalysisResult {
  try {
    const json = extractJSON(text);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Parsed analysis is not an object");
    }

    const domainName =
      typeof parsed.domain_name === "string"
        ? parsed.domain_name.trim()
        : undefined;
    const declineMessage =
      typeof parsed.decline_message === "string"
        ? parsed.decline_message.trim()
        : undefined;
    const domainCapabilities = Array.isArray(parsed.domain_capabilities)
      ? parsed.domain_capabilities.filter(
          (item: unknown) => typeof item === "string"
        )
      : [];
    const suggestedQuestions = Array.isArray(parsed.suggested_questions)
      ? parsed.suggested_questions.filter(
          (item: unknown) => typeof item === "string"
        )
      : [];

    if (!domainName || !declineMessage || domainCapabilities.length === 0) {
      throw new Error("Incomplete analysis data");
    }

    return {
      domainName,
      domainCapabilities,
      declineMessage,
    };
  } catch (error) {
    // logger?.warn(
    //   {
    //     error: error instanceof Error ? error.message : String(error),
    //     errorType: "analysis_parsing_failed",
    //   },
    //   "Failed to parse GraphQL analysis result"
    // );
    throw error;
  }
}


export function extractJSON(response: string): string {
  let cleaned = response.replace(/```json\s*/gi, "").replace(/```/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }
  return cleaned.trim() || "{}";
}


export function createOpenAIClient(
  apiKey?: string,
  baseUrl?: string,
  customHeaders?: Record<string, string>
): OpenAI {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is required to use OpenAI client.");
  }
  const options: Record<string, unknown> = { apiKey: key };

  // Use AI_GATEWAY_URL if configured, otherwise fall back to OPENAI_API_BASE
  const baseURL = baseUrl ?? (process.env.OPENAI_API_BASE);
  if (baseURL) {
    options.baseURL = baseURL;
  }

  // Add custom headers (e.g., x-user-id for token tracking)
  if (customHeaders && Object.keys(customHeaders).length > 0) {
    options.defaultHeaders = customHeaders;
  }

  // Comprehensive debug log with full header details
  try {
    const safeHeaders: Record<string, string> = {};
    const headerDetails: Array<{name: string, value: string, isSensitive: boolean}> = [];

    for (const [h, v] of Object.entries(customHeaders || {})) {
      const isSensitive = /api-key|authorization|secret|token|password/i.test(h);
      const safeValue = isSensitive ? '***' : v;
      safeHeaders[h] = safeValue;
      headerDetails.push({
        name: h,
        value: safeValue,
        isSensitive
      });
    }

    // logger.info({
    //   config: {
    //     baseURL,
    //     usingAiGateway: Boolean(process.env.AI_GATEWAY_URL),
    //     usingOpenaiBase: Boolean(process.env.OPENAI_API_BASE),
    //     hasApiKey: Boolean(key),
    //   },
    //   headers: {
    //     count: Object.keys(customHeaders || {}).length,
    //     keys: Object.keys(customHeaders || {}),
    //     details: headerDetails,
    //     safe: safeHeaders,
    //   },
    //   environment: {
    //     AI_GATEWAY_URL: process.env.AI_GATEWAY_URL || 'not-set',
    //     OPENAI_API_BASE: process.env.OPENAI_API_BASE || 'not-set',
    //     LLM_MODEL: process.env.LLM_MODEL || 'not-set',
    //   }
    // }, 'OpenAI client created with configuration');
  } catch (logError) {
    // const logger = getLogger('llm-client');
    // logger.warn({error: logError instanceof Error ? logError.message : String(logError)}, 'Failed to log OpenAI client creation details');
    throw logError;
  }

  return new OpenAI(options);
}
