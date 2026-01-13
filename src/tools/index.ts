import type { Logger } from "pino";
import { createGraphQLSchemaInfoTool } from './graphql-schema-info.tool.js';
import { createGraphQLValidatorAndExecuteTool } from './graphql-validate-excute.tool.js';
import type { GraphQLService } from '../graphql.service.js';
import type { GraphQLProjectConfig } from "../types.js";

export function createGraphQLTools(service: GraphQLService, config: GraphQLProjectConfig,
                                   logger?: Logger,) {
  return [
    createGraphQLSchemaInfoTool(config,logger),
    createGraphQLValidatorAndExecuteTool(config, service,logger),
    // createGraphQLValidatorTool(config, service),
    // createGraphQLExecuteTool(config, service)
  ];
}
