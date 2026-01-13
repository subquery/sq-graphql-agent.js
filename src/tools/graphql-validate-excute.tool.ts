import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { GraphQLService } from '../graphql.service.js';
import type { GraphQLProjectConfig } from '../types.js';
import { parse } from "graphql";
import type { Logger } from "pino";

export function createGraphQLValidatorAndExecuteTool(
  config: GraphQLProjectConfig, 
  graphQLService: GraphQLService,
  logger?: Logger,
  ) {
  const schema = z.object({
    query: z.string().describe('The GraphQL query to validate'),
    variables: z.record(z.string(), z.any()).optional().describe('Variables for the GraphQL query')
  });

  const _execute = async (query: string, variables?: Record<string, any>) => {
    const startTime = Date.now();
    logger?.info({
      domainName: config.domainName,
      hasVariables: !!variables
    }, 'Starting query execution');
    logger?.debug({query}, "Executing query");

    try {
      // Execute the query
      const result = await graphQLService.execute(
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
        logger?.error({ errors: errorMessages }, 'Query execution failed');
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

      logger?.warn({ result }, 'Unexpected response format');
      return `⚠️ Unexpected response format:\n${JSON.stringify(result, null, 2)}`;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger?.error({
        error: error instanceof Error ? error.message : String(error),
        executionTime
      }, 'Error executing query');
      return `Error executing query: ${(error as any).message}`;
    }
  };

  return new DynamicStructuredTool({
    name: 'graphql_query_validator',
    description: `Validate a GraphQL query string for syntax and basic structure and execute it if valid.
    Input: Pass the GraphQL query as plain text without any formatting.

    🛑 CRITICAL RULES BEFORE USING THIS TOOL:
    1. After calling this tool, CHECK the result immediately
    2. If the result contains the answer to the question → DO NOT call this tool again
    3. If you used orderBy with DESC → The FIRST result is the maximum/highest value
    4. DO NOT call this tool again with different 'first' values (first: 5 → first: 1) - use what you got!
    5. DO NOT call this tool to "verify" or "double-check" - trust your first query result
    6. DO NOT incrementally adjust filters (>= 85 → >= 84 → >= 83) - use broader range from start!
    7. DO NOT randomly try filter values (>= -10 → >= 75 → >= 70) - THINK about logic first!
    8. If first query is empty → STOP, THINK about reasonable filter range, then query ONCE more
    9. DO NOT query same collection separately for nodes and aggregates - combine in ONE query!

    Example of CORRECT usage:
    Query: "Which deployment has highest amount?"
    1. Call tool with: deployments(first: 5, orderBy: AMOUNT_DESC) { nodes { id amount } }
    2. Result: [{ id: "0x1", amount: 1000 }, ...]
    3. Answer immediately: "Deployment 0x1 has the highest amount of 1000"
    4. DO NOT call tool again! ← Important!

    Example of WRONG usage (DO NOT DO THIS):
    1. Call tool with: deployments(first: 5, orderBy: DESC) → Get result
    2. Call tool again with: deployments(first: 1, orderBy: DESC) ← WRONG! Already got answer!
    
    3. Or incrementally adjust filters (FORBIDDEN):
       - First: indexers(filter: { commissionEra >= 85 }) → Empty
       - Then: indexers(filter: { commissionEra >= 84 }) ← WRONG!
       - Then: indexers(filter: { commissionEra >= 83 }) ← WRONG!
       
    4. Or randomly try values (ABSOLUTELY FORBIDDEN):
       - First: indexers(filter: { commissionEra >= -10 }) → Too broad/nonsensical
       - Then: indexers(filter: { commissionEra >= 75 }) ← Random guess!
       - Then: indexers(filter: { commissionEra >= 70 }) ← Still guessing!
       
    5. Or query same collection separately for nodes and aggregates (FORBIDDEN):
       - First: deploymentBoosterSummaries(first: 5) { nodes { id } }
       - Then: deploymentBoosterSummaries(first: 5) { groupedAggregates { ... } }
       ← WRONG! Query nodes AND aggregates together in ONE query!
       
    ✅ CORRECT: Think first, then query with reasonable range:
       indexers(filter: { commissionEra >= 50 }) or remove filter if unsure
    
    ✅ CORRECT: Query nodes and aggregates together:
       deploymentBoosterSummaries(first: 5) { nodes { id } groupedAggregates { ... } }

    CORRECT: { indexers(first: 1) { nodes { id } } }
    WRONG: \`{ indexers(first: 1) { nodes { id } } }\`
    WRONG: \`\`\`{ indexers(first: 1) { nodes { id } } }\`\`\`

    The tool will automatically clean code blocks, backticks, and quotes.`,
    schema,
    func: async (input: z.infer<typeof schema>) => {
      let { query, variables } = input;
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

          return await _execute(query, variables);

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
