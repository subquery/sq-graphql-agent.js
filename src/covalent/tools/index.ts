// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import type {DynamicStructuredTool} from '@langchain/core/tools';
import type {Logger} from 'pino';
import type {CovalentConfig} from '../types.js';
import {createCovalentApiInfoTool} from './api-info.tool.js';
import {createCovalentQueryTool, createCovalentResultHeadTool, createCovalentResultJqTool} from './query.tool.js';

/**
 * Create Covalent REST API tools for the agent
 */
export function createCovalentTools(config: CovalentConfig, logger?: Logger): DynamicStructuredTool[] {
  return [
    createCovalentApiInfoTool(logger),
    createCovalentQueryTool(config, logger),
    createCovalentResultHeadTool(logger),
    createCovalentResultJqTool(logger),
  ];
}
