// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import type {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import type {GraphQLService} from '../graphql.service.js';
import type {GraphQLProjectConfig} from '../types.js';
import {createGraphQLSchemaInfoTool} from './graphql-schema-info.tool.js';
import {createGraphQLTypeDetailTool} from './graphql-type-detail.tool.js';
import {createGraphQLValidatorAndExecuteTool} from './graphql-validate-excute.tool.js';

export function createGraphQLTools(
  service: GraphQLService,
  config: GraphQLProjectConfig,
  logger?: Logger
): DynamicStructuredTool[] {
  const tools: DynamicStructuredTool[] = [
    createGraphQLSchemaInfoTool(config, logger),
    createGraphQLValidatorAndExecuteTool(config, service, logger),
  ];

  // Add type detail tool only for Codex
  const typeDetailTool = createGraphQLTypeDetailTool(config, logger);
  if (typeDetailTool) {
    tools.push(typeDetailTool);
  }

  return tools;
}
