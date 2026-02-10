// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

/**
 * Codex Schema Cache
 *
 * Caches the query-only schema, full introspection schema, and parsed IntrospectionQuery
 * to avoid reading from filesystem on every request.
 */

import {readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {buildSchema, introspectionFromSchema, type IntrospectionQuery} from 'graphql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Schema cache
let querySchemaCache: string | null = null;
let fullSchemaCache: string | null = null;
let introspectionSchemaCache: IntrospectionQuery | null = null;

/**
 * Get the query-only schema for Codex
 * This is used by graphql_schema_info tool for LLM consumption
 * Cached after first read
 */
export function getCodexQuerySchema(): string {
  if (querySchemaCache === null) {
    const querySchemaPath = join(__dirname, 'query.graphql');
    querySchemaCache = readFileSync(querySchemaPath, 'utf-8');
  }
  return querySchemaCache;
}

/**
 * Get the full introspection schema for Codex (raw SDL)
 * This is used by graphql_type_detail tool for type extraction
 * Cached after first read
 */
export function getCodexFullSchema(): string {
  if (fullSchemaCache === null) {
    const fullSchemaPath = join(__dirname, 'full_schema.graphql');
    fullSchemaCache = readFileSync(fullSchemaPath, 'utf-8');
  }
  return fullSchemaCache;
}

/**
 * Get the parsed IntrospectionQuery for Codex
 * This is used by GraphQLService for validation and introspection
 * Parses the full_schema.graphql SDL and converts to IntrospectionQuery
 * Cached after first read
 */
export function getCodexIntrospectionSchema(): IntrospectionQuery {
  if (introspectionSchemaCache === null) {
    const fullSchema = getCodexFullSchema();
    const schema = buildSchema(fullSchema);
    introspectionSchemaCache = introspectionFromSchema(schema);
  }
  return introspectionSchemaCache;
}

/**
 * Clear the schema cache
 * Useful for testing or when schemas need to be reloaded
 */
export function clearCodexSchemaCache(): void {
  querySchemaCache = null;
  fullSchemaCache = null;
  introspectionSchemaCache = null;
}
