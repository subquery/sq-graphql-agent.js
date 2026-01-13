import {DynamicStructuredTool} from '@langchain/core/tools';
import { parse } from "graphql";
import type { Logger } from "pino";
import {z} from 'zod';
import type {GraphQLService} from '../graphql.service.js';
import type { GraphQLProjectConfig } from "../types.js";

export function createGraphQLValidatorTool(
  config: GraphQLProjectConfig,
  graphQLService?: GraphQLService,
  logger?: Logger,
  ) {
  const schema = z.object({
      query: z.string().describe('The GraphQL query to validate')
    });

  return new DynamicStructuredTool({
    name: 'graphql_query_validator',
    description: `Validate a GraphQL query string for syntax and basic structure.
    Input: Pass the GraphQL query as plain text without any formatting.

    CORRECT: { indexers(first: 1) { nodes { id } } }
    WRONG: \`{ indexers(first: 1) { nodes { id } } }\`
    WRONG: \`\`\`{ indexers(first: 1) { nodes { id } } }\`\`\`

    The tool will automatically clean code blocks, backticks, and quotes.`,
    schema,
    func: async (input: z.infer<typeof schema>) => {
      let { query } = input;
      const startTime = Date.now();
      logger?.info({
        originalQueryLength: query.length,
        queryPreview: query.substring(0, 100) + (query.length > 100 ? '...' : '')
      }, 'Starting query validation');

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
        cleanedQueryLength: query.length
      }, 'Query cleaned');

        // Basic syntax validation
        const validationErrors: string[] = [];

        // Check for basic GraphQL structure
        if (!query) {
          logger?.warn({}, 'Empty query provided');
          return "❌ Validation failed: Empty query";
        }

        // Check for balanced braces
        const openBraces = (query.match(/\{/g) || []).length;
        const closeBraces = (query.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
          validationErrors.push(`Unbalanced braces: ${openBraces} opening, ${closeBraces} closing`);
        }

        // Check for balanced parentheses
        const openParens = (query.match(/\(/g) || []).length;
        const closeParens = (query.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          validationErrors.push(`Unbalanced parentheses: ${openParens} opening, ${closeParens} closing`);
        }

        logger?.debug({
        openBraces,
        closeBraces,
        openParens,
        closeParens,
        basicValidationErrors: validationErrors.length
      }, 'Basic validation');

        // Early return if basic syntax errors found
        if (validationErrors.length > 0) {
          logger?.error({ errors: validationErrors }, 'Basic syntax validation failed');
          return `❌ Basic syntax validation failed:\n` + validationErrors.map((error: string) => `- ${error}`).join('\n');
        }

        // Advanced validation with GraphQL parser
        try {
          logger?.debug({}, 'Performing GraphQL parsing validation');

          // Parse the query to check for syntax errors
          const document = parse(query);

          // Perform schema validation if GraphQL service is available
          let schemaValidationErrors: string[] = [];
          if (graphQLService) {
            try {
              const validationResult = await graphQLService.validate(query);
              if (validationResult.length > 0) {
                schemaValidationErrors = validationResult;
              }
            } catch (schemaError: any) {
              // logger?.warn({ error: schemaError.message }, `Schema validation failed, falling back to syntax validation only`);
            }
          }

          const validationTime = Date.now() - startTime;
          logger?.info({
            validationTime: `${validationTime}ms`,
            hasDefinitions: !!(document && document.definitions),
            definitionCount: document?.definitions?.length || 0,
            schemaValidationErrors: schemaValidationErrors.length
          }, `Query validation completed`);

          // If schema validation errors found, return them
          if (schemaValidationErrors.length > 0) {
            logger?.error({ errors: schemaValidationErrors }, `Schema validation failed`);
            return `❌ Schema validation failed:\n` + schemaValidationErrors.map((error: string) => `- ${error}`).join('\n');
          }

          // If we have GraphQL service but no cached schema, try to fetch and cache it
          if (graphQLService) {
            try {
              // Trigger schema fetch to populate cache for future validations
              graphQLService.fetchSchema().catch((error: any) => {
                logger?.warn({ error: error.message }, `Failed to fetch schema for caching`);
              });
            } catch (fetchError: any) {
              logger?.debug({ error: fetchError.message }, `Schema fetch attempt completed`);
            }
          }

          return `✅ Query is valid and matches schema:\n\n${query}`;

        } catch (parseError: any) {
          const validationTime = Date.now() - startTime;
          logger?.error(parseError, `Query parsing failed after ${validationTime}ms`);
          return `❌ Query parsing failed: ${parseError.message || String(parseError)}`;
        }

      } catch (error: any) {
        const validationTime = Date.now() - startTime;
        logger?.error(error, `Unexpected error after ${validationTime}ms`);
        return `Error validating query: ${error.message || String(error)}`;
      }
    }
  });
}
