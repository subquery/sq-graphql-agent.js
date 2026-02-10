// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {DynamicStructuredTool} from '@langchain/core/tools';
import {parse, type DefinitionNode, type DocumentNode, type FieldDefinitionNode, type TypeNode} from 'graphql';
import type {Logger} from 'pino';
import {z} from 'zod';
import {type GraphQLProjectConfig, GraphqlProvider} from '../types.js';

export function createGraphQLTypeDetailTool(
  config: GraphQLProjectConfig,
  logger?: Logger
): DynamicStructuredTool | null {
  // Only return tool for CODEX nodeType
  if (config.nodeType !== GraphqlProvider.CODEX) {
    return null;
  }

  // Load FULL schema from cache (reads from src/codex/full_schema.graphql on first call)
  const fullSchema = config.fullSchema;
  if (!fullSchema) {
    logger?.error('Codex config is missing fullSchema');
    return null;
  }

  // Parse the schema once for reuse
  let documentNode: DocumentNode;
  try {
    documentNode = parse(fullSchema);
  } catch (error) {
    logger?.error(error, 'Failed to parse GraphQL schema');
    return null;
  }

  return new DynamicStructuredTool({
    name: 'graphql_type_detail',
    description: `Get type definitions for multiple GraphQL types with configurable depth.

IMPORTANT: Only use this tool as a FALLBACK when query validation fails and you need
to check specific type definitions. Prefer using the raw schema from graphql_schema_info.

Input:
- typeNames (array of strings): Exact type names to examine (e.g., ["NftPoolResponse", "TokenFilterConnection"])
- depth (number): Depth for nested type extraction (default: 2, max: 99)
  - depth=0: Only the type definition itself
  - depth=1: Type + immediate nested types
  - depth=2: Type + nested types + their children (recommended default)
  - depth=99: Full type tree (use when deep understanding needed)`,
    schema: z.object({
      typeNames: z
        .array(z.string())
        .min(1)
        .describe('Names of the GraphQL types to examine (e.g., ["NftPoolResponse", "TokenFilterConnection"])'),
      depth: z
        .number()
        .min(0)
        .max(99)
        .default(2)
        .describe(
          'How many levels deep to extract nested types. Default 2 (type + direct children). Increase to 99 for full type tree.'
        ),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    func: async ({depth, typeNames}) => {
      try {
        logger?.debug({typeNames, depth}, 'Extracting GraphQL type details');

        const results: string[] = [];

        for (const typeName of typeNames) {
          const result = extractTypeWithDepth(typeName, depth, documentNode);

          if (!result) {
            results.push(
              `## Type '${typeName}'\n❌ Not found in schema. Check type name spelling or use graphql_schema_info to see available types.`
            );
          } else {
            results.push(`## Type '${typeName}' (depth=${depth})\n\n${result}`);
          }
        }

        return results.join('\n\n---\n\n');
      } catch (error) {
        logger?.error(error, 'Error extracting type details');
        return `Error getting type details: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

type TypeDefinition = {
  node: DefinitionNode;
  raw: string;
  typeName: string;
};

// Cache for type definitions to avoid repeated string extraction
const typeCache = new Map<string, TypeDefinition>();

function getAllTypeDefinitions(documentNode: DocumentNode): Map<string, TypeDefinition> {
  if (typeCache.size > 0) {
    return typeCache;
  }

  for (const definition of documentNode.definitions) {
    if (definition.kind === 'ObjectTypeDefinition') {
      const name = definition.name.value;
      typeCache.set(name, {
        node: definition,
        raw: definitionNodeToString(definition),
        typeName: name,
      });
    } else if (definition.kind === 'InterfaceTypeDefinition') {
      const name = definition.name.value;
      typeCache.set(name, {
        node: definition,
        raw: definitionNodeToString(definition),
        typeName: name,
      });
    } else if (definition.kind === 'InputObjectTypeDefinition') {
      const name = definition.name.value;
      typeCache.set(name, {
        node: definition,
        raw: definitionNodeToString(definition),
        typeName: name,
      });
    } else if (definition.kind === 'EnumTypeDefinition') {
      const name = definition.name.value;
      typeCache.set(name, {
        node: definition,
        raw: definitionNodeToString(definition),
        typeName: name,
      });
    } else if (definition.kind === 'UnionTypeDefinition') {
      const name = definition.name.value;
      typeCache.set(name, {
        node: definition,
        raw: definitionNodeToString(definition),
        typeName: name,
      });
    }
  }

  return typeCache;
}

function definitionNodeToString(node: DefinitionNode): string {
  const parts: string[] = [];

  if (node.kind === 'ObjectTypeDefinition' || node.kind === 'InterfaceTypeDefinition') {
    if (node.description) {
      parts.push(`"""${node.description.value}"""`);
    }
    if (node.kind === 'ObjectTypeDefinition') {
      parts.push(`type ${node.name.value}`);
    } else {
      parts.push(`interface ${node.name.value}`);
    }

    if (node.interfaces && node.interfaces.length > 0) {
      parts.push(` implements ${node.interfaces.map((i) => i.name.value).join(' & ')}`);
    }

    parts.push(' {');

    if (node.fields) {
      for (const field of node.fields) {
        const fieldStr = fieldNodeToString(field);
        parts.push(`  ${fieldStr}`);
      }
    }

    parts.push('}');
  } else if (node.kind === 'InputObjectTypeDefinition') {
    if (node.description) {
      parts.push(`"""${node.description.value}"""`);
    }
    parts.push(`input ${node.name.value} {`);

    if (node.fields) {
      for (const field of node.fields) {
        const fieldStr = inputFieldNodeToString(field);
        parts.push(`  ${fieldStr}`);
      }
    }

    parts.push('}');
  } else if (node.kind === 'EnumTypeDefinition') {
    if (node.description) {
      parts.push(`"""${node.description.value}"""`);
    }
    parts.push(`enum ${node.name.value} {`);

    if (node.values) {
      for (const value of node.values) {
        if (value.description) {
          parts.push(`  """${value.description.value}"""`);
        }
        parts.push(`  ${value.name.value}`);
      }
    }

    parts.push('}');
  } else if (node.kind === 'UnionTypeDefinition') {
    if (node.description) {
      parts.push(`"""${node.description.value}"""`);
    }
    parts.push(`union ${node.name.value} = ${(node.types ?? []).map((t) => t.name.value).join(' | ')}`);
  }

  return parts.join('\n');
}

function fieldNodeToString(field: FieldDefinitionNode): string {
  const parts: string[] = [];

  if (field.description) {
    parts.push(`"""${field.description.value}"""`);
  }

  parts.push(field.name.value);

  if (field.arguments && field.arguments.length > 0) {
    parts.push('(');
    const args = field.arguments.map((arg) => {
      const argParts: string[] = [];
      if (arg.description) {
        argParts.push(`"""${arg.description.value}""" `);
      }
      argParts.push(`${arg.name.value}: ${typeNodeToString(arg.type)}`);
      if (arg.defaultValue) {
        argParts.push(` = ${valueNodeToString(arg.defaultValue)}`);
      }
      return argParts.join('');
    });
    parts.push(args.join(', '));
    parts.push(')');
  }

  parts.push(`: ${typeNodeToString(field.type)}`);

  return parts.join('');
}

function inputFieldNodeToString(field: {name: {value: string}; type: TypeNode; description?: {value: string}}): string {
  const parts: string[] = [];

  if (field.description) {
    parts.push(`"""${field.description.value}"""`);
  }

  parts.push(`${field.name.value}: ${typeNodeToString(field.type)}`);

  return parts.join('');
}

function typeNodeToString(type: TypeNode): string {
  if (type.kind === 'NamedType') {
    return type.name.value;
  } else if (type.kind === 'ListType') {
    return `[${typeNodeToString(type.type)}]`;
  } else if (type.kind === 'NonNullType') {
    return `${typeNodeToString(type.type)}!`;
  }
  return '';
}

function valueNodeToString(value: {value?: boolean | string | number; kind?: string}): string {
  // Handle NullValueNode (kind: 'NullValue') which has no value property
  if ('kind' in value && value.kind === 'NullValue') {
    return 'null';
  }
  // Handle other ConstValueNode types
  if ('value' in value && value.value !== undefined) {
    return String(value.value);
  }
  return '';
}

function extractTypeWithDepth(
  typeName: string,
  maxDepth: number,
  documentNode: DocumentNode,
  visited: Set<string> = new Set(),
  currentDepth = 0
): string | null {
  if (visited.has(typeName) || currentDepth > maxDepth) {
    return null;
  }

  // Skip built-in scalars and introspection types
  if (
    [
      'ID',
      'String',
      'Int',
      'Float',
      'Boolean',
      'Int',
      'Query',
      'Mutation',
      'Subscription',
      '__Schema',
      '__Type',
      '__TypeKind',
      '__Field',
      '__InputValue',
      '__EnumValue',
      '__Directive',
      '__DirectiveLocation',
    ].includes(typeName)
  ) {
    return null;
  }

  visited.add(typeName);

  const typeDefs = getAllTypeDefinitions(documentNode);
  const typeDef = typeDefs.get(typeName);

  if (!typeDef) {
    return null;
  }

  let result = typeDef.raw;

  if (currentDepth < maxDepth) {
    const referencedTypes = extractReferencedTypes(typeDef.node);
    const nestedTypes: string[] = [];

    for (const refType of referencedTypes) {
      const nested = extractTypeWithDepth(refType, maxDepth, documentNode, visited, currentDepth + 1);
      if (nested) {
        nestedTypes.push(nested);
      }
    }

    if (nestedTypes.length > 0) {
      result += `\n\n${nestedTypes.join('\n\n')}`;
    }
  }

  return result;
}

function extractReferencedTypes(node: DefinitionNode): string[] {
  const types = new Set<string>();

  function extractFromTypeNode(typeNode: TypeNode): void {
    if (typeNode.kind === 'NamedType') {
      types.add(typeNode.name.value);
    } else if (typeNode.kind === 'ListType') {
      extractFromTypeNode(typeNode.type);
    } else if (typeNode.kind === 'NonNullType') {
      extractFromTypeNode(typeNode.type);
    }
  }

  if (node.kind === 'ObjectTypeDefinition' || node.kind === 'InterfaceTypeDefinition') {
    if (node.interfaces) {
      for (const iface of node.interfaces) {
        types.add(iface.name.value);
      }
    }

    if (node.fields) {
      for (const field of node.fields) {
        extractFromTypeNode(field.type);

        // Also extract from arguments
        if (field.arguments) {
          for (const arg of field.arguments) {
            extractFromTypeNode(arg.type);
          }
        }
      }
    }
  } else if (node.kind === 'InputObjectTypeDefinition') {
    if (node.fields) {
      for (const field of node.fields) {
        extractFromTypeNode(field.type);
      }
    }
  } else if (node.kind === 'UnionTypeDefinition') {
    if (node.types) {
      for (const type of node.types) {
        types.add(type.name.value);
      }
    }
  }

  return Array.from(types);
}
