import { DynamicStructuredTool } from '@langchain/core/tools';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { GraphQLService } from '../graphql.service.js';
import type { GraphQLProjectConfig } from "../types.js";

// Create logger for GraphQL execute tool
// const logger = getLogger('graphql-execute-tool');

export function createGraphQLExecuteTool(
  config: GraphQLProjectConfig,
  graphqlService: GraphQLService,
  logger?: Logger,
) {

  const schema = z.object({
    query: z.string().describe('The GraphQL query to execute'),
    variables: z.record(z.string(), z.any()).optional().describe('Variables for the GraphQL query')
  });

  return new DynamicStructuredTool({
    name: 'graphql_execute',
    description: `Execute a GraphQL query against the API endpoint.
    Input: GraphQL query as plain text without any formatting markers.

    CORRECT: { indexers(first: 2) { nodes { id } } }
    WRONG:
    - \`{ indexers... }\` (with backticks)
    - \`\`\`{ indexers... }\`\`\` (with code blocks)
    - "{ indexers... }" (with quotes)
    - {"query": "{ indexers... }"} (JSON wrapped)

    The tool will automatically clean formatting issues.`,
    schema,
    func: async (input: z.infer<typeof schema>) => {
      let {query, variables} = input;
      const startTime = Date.now();
      logger?.info({
        domainName: config.domainName,
        originalQueryLength: query.length,
        hasVariables: !!variables
      }, 'Starting query execution');

      try {
        // Clean up common formatting issues first
        const originalQuery = query;
        query = query.trim();

        // Remove code block markers (```...```)
        if (query.startsWith('```') && query.endsWith('```')) {
          query = query.slice(3, -3).trim();
          // Also remove language identifier if present (e.g., ```graphql)
          const lines = query.split('\n');
          if (lines && lines[0] && lines[0].trim() && !lines[0].trim().startsWith('{')) {
            query = lines.slice(1).join('\n').trim();
          }
        }

        // Remove single backticks if present
        if (query.startsWith('`') && query.endsWith('`')) {
          query = query.slice(1, -1).trim();
        }

        // Remove quotes if present
        if ((query.startsWith('"') && query.endsWith('"')) || (query.startsWith("'") && query.endsWith("'"))) {
          query = query.slice(1, -1).trim();
        }

        logger?.debug({
          wasModified: originalQuery !== query,
          cleanedQueryLength: query.length,
          queryPreview: query.substring(0, 100) + (query.length > 100 ? '...' : '')
        }, 'Query cleaned');

        // Prepare headers
        const headers: Record<string, string> = {};
        if (config.authorization) {
          headers['Authorization'] = config.authorization;
          logger?.debug({}, 'Using authorization header');
        }

        logger?.debug({}, 'Sending request to GraphQL endpoint');

        // Execute the query
        const result = await graphqlService.execute(
          query,
          variables,
        );

        const executionTime = Date.now() - startTime;
        logger?.info({
          executionTime,
          hasData: !!result.data,
          hasErrors: !!(result.errors && result.errors.length > 0),
          errorCount: result.errors?.length || 0
        }, 'Query completed');

        // Handle errors in the response
        if (result.errors && result.errors.length > 0) {
          const errorMessages = result.errors.map((error: any) => error.message || String(error));
          logger?.error({errors: errorMessages}, 'Query execution failed');
          return `❌ Query execution failed:\n` + errorMessages.map((msg: string) => `- ${msg}`).join('\n');
        }

        // Format the response
        if (result.data) {
          const formattedData = JSON.stringify(result.data, null, 2);
          const dataSize = new Blob([formattedData]).size;
          logger?.info({
            dataSizeKB: (dataSize / 1024).toFixed(2),
            responseLength: formattedData.length,
            executionTime
          }, 'Query executed successfully');
          return `✅ Query executed successfully:\n\n${formattedData}`;
        }

        logger?.warn({result}, 'Unexpected response format');
        return `⚠️ Unexpected response format:\n${JSON.stringify(result, null, 2)}`;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger?.error({
          error: error instanceof Error ? error.message : String(error),
          executionTime
        }, 'Error executing query');
        return `Error executing query: ${(error as any).message}`;
      }
    }
  });
}

