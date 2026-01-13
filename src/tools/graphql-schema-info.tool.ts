import {DynamicStructuredTool} from '@langchain/core/tools';
import {z} from 'zod';
import { type GraphQLProjectConfig, GraphqlProvider } from '../types.js';
import type { Logger } from "pino";

export function createGraphQLSchemaInfoTool(
  config: GraphQLProjectConfig,
  logger?: Logger,
) {
  return new DynamicStructuredTool({
    name: 'graphql_schema_info',
    description: `Get the raw GraphQL entity schema with automatic node type detection and appropriate query patterns.

    Use this tool ONCE at the start, then use the raw schema to:
    1. Identify @entity types and infer their query patterns
    2. See all fields and their types to determine relationships
    3. Apply node-specific patterns (SubQL/PostGraphile or The Graph) to construct valid queries

    DO NOT call this tool multiple times. The raw schema contains everything needed.`,
    schema: z.object({}),
    func: async () => {
      try {
        logger?.info({
          domainName: config.domainName,
          nodeType: config.nodeType,
          schemaLength: config.schemaContent.length
        }, `Executing for config`);

        const schemaContent = config.schemaContent;

        if (config.nodeType === GraphqlProvider.THE_GRAPH) {
          logger?.debug(`Using The Graph protocol schema generation`);
          const result = generateTheGraphSchemaInfo(schemaContent);
          logger?.info({ resultLength: result.length }, `Successfully generated The Graph schema info`);
          return result;
        } else if (config.nodeType === GraphqlProvider.SUBQL) {
          logger?.debug(`Using SubQL (PostGraphile) schema generation`);
          const result = generateSubQLSchemaInfo(schemaContent);
          logger?.info({ resultLength: result.length }, `Successfully generated SubQL schema info`);
          return result;
        } else {
          logger?.warn({ nodeType: config.nodeType }, `Unknown node type`);
          return `Error: Unknown node type ${config.nodeType}`;
        }
      } catch (error) {
        logger?.error(error, `Error executing schema info tool`);
        return `Error reading schema info: ${(error as any).message}`;
      }
    }
  });
}

function generateTheGraphSchemaInfo(schemaContent: string): string {
  return `📖 THE GRAPH PROTOCOL SCHEMA & RULES:

🔍 RAW ENTITY SCHEMA:
${schemaContent}

📋 SUBGRAPH INFERENCE RULES:
- Each @entity type → database table with 2 queries: singular(id) & plural(filter/pagination)
- Fields with @derivedFrom → relationship fields, need subfield selection
- Foreign key fields is not accessible directly, must use relationship field
- System tables (_meta) → ignore these

📖 SUBGRAPH QUERY PATTERNS:
1. 📊 ENTITY QUERIES:
   - Single query: entityName(id: ID!,subgraphError: _SubgraphErrorPolicy_! = deny) → EntityType
   - Collection query: entityNames(skip: Int, first: Int, where: EntityFilter, orderBy: EntityOrderBy, orderDirection: OrderDirection, subgraphError: _SubgraphErrorPolicy_! = deny) → [EntityType]

2. 🔗 RELATIONSHIP QUERIES:
   - Direct field access: entity { field { id, otherFields } }
   - Direct array access for one-to-many relationships

3. 📝 FILTER PATTERNS (SubGraph Format - <field>_<op>):

   ID FILTERS:
   - Direct field comparisons: id: "0x123"
   - id_not: String! - not equal to
   - id_gt, id_lt, id_gte, id_lte: String! - comparison operators
   - id_in: [ID!] - match any value in list
   - id_not_in: [ID!] - not match any value in list

   STRING FILTERS:
   - Direct field comparisons: name: "alice"
   - name_contains, name_contains_nocase: String! - substring matching
   - name_not_contains, name_not_contains_nocase: String! - not contains substring
   - name_starts_with, name_starts_with_nocase: String! - prefix matching
   - name_not_starts_with, name_not_starts_with_nocase: String! - not starts with
   - name_ends_with, name_ends_with_nocase: String! - suffix matching
   - name_not_ends_with, name_not_ends_with_nocase: String! - not ends with
   - name_gt, name_lt, name_gte, name_lte: String! - lexicographic comparison
   - name_in: [String!] - match any value in list
   - name_not_in: [String!] - not match any value in list
   - name_not: String! - not equal to

   NUMBER FILTERS (Int, BigInt, BigDecimal):
   - Direct field comparisons: amount: "100"
   - amount_gt, amount_gte, amount_lt, amount_lte: String! - numeric comparisons (values as strings)
   - amount_in: [String!] - match any value in list (BigInt/BigDecimal as strings)
   - amount_not_in: [String!] - not match any value in list
   - amount_not: String! - not equal to

   BOOLEAN FILTERS:
   - Direct field comparisons: active: true
   - active_not: Boolean! - not equal to
   - active_in: [Boolean!] - match any value in list
   - active_not_in: [Boolean!] - not match any value in list

   NESTED FILTERS (AND/OR Logic):
   - and: [EntityFilter!] - all conditions must be true
   - or: [EntityFilter!] - at least one condition must be true
   - Can be nested arbitrarily deep for complex logic

   EXAMPLES:
   - { id: "0x123" } - direct ID match
   - { id_in: ["0x123", "0x456"] } - ID in list
   - { status_in: ["active", "pending"] } - string in list
   - { amount_gt: "100" } - BigInt greater than
   - { name_contains_nocase: "alice" } - case-insensitive substring
   - { symbol_starts_with: "UNI" } - prefix matching
   - { balance_gte: "1000000000000000000" } - BigInt >= 1 ETH
   - { and: [{ active: true }, { balance_gt: "0" }] } - AND logic
   - { or: [{ symbol: "ETH" }, { symbol: "BTC" }] } - OR logic

4. 📈 ORDER BY PATTERNS:
   - orderBy: field_name (camelCase field names)
   - orderDirection: asc | desc
   - Examples: orderBy: id, orderBy: createdAt, orderBy: amount

5. 📄 PAGINATION:
   - first: Int (limit results)
   - skip: Int (offset results)
   - No cursor-based pagination (unlike SubQL)

⚠️ CRITICAL THE GRAPH ENTITY RULES:
- Entity fields are accessed directly without @derivedFrom complexity
- No "nodes" wrapper for collections (unlike SubQL)
- Use direct field access: entity { relatedField { id, otherField } }
- Collections return arrays directly: entities { field }

⚠️ CRITICAL SCALAR RULES:
- ID fields are strings, not integers: "0x123abc"
- Int fields are regular integers: 42
- BigInt fields stored as strings: "12345678901234567890"
- BigDecimal fields stored as strings for precise decimals: "123.456789"
- Bytes for hex-encoded byte arrays: "0x1234abcd"
- All number comparisons in filters use string values for BigInt/BigDecimal

🔍 ENTITY IDENTIFICATION:
- Look at @entity directive to identify entities
- Field types determine relationships - no @derivedFrom needed
- Direct field references indicate relationships
- Example: user: User → Look for @entity User, query user { id, address }

📝 TYPE MAPPING EXAMPLES (The Graph):
- user: User → Find @entity User, query user { id, address }
- token: Token → Find @entity Token, query token { id, symbol, decimals }
- id: ID → Query as string: "0x123abc"
- count: Int → Query as integer: 42
- amount: BigInt → Query as string: "1000000000000000000" (1 ETH in wei)
- price: BigDecimal → Query as string: "1234.567890123456789"
- timestamp: BigInt → Query as string: "1640995200"
- data: Bytes → Query as hex string: "0x1234abcd"
- active: Boolean → Query as boolean: true/false

📋 RELATIONSHIP QUERY EXAMPLES:
✅ { user(id: "0x123") { id, tokens { id, symbol, balance } } }
✅ { tokens { id, symbol, holder { id, address } } }
✅ { transfers(first: 10) { id, from { address }, to { address }, amount } }
❌ { tokens { nodes { id, symbol } } } (no "nodes" wrapper needed)

📊 FILTERING QUERY EXAMPLES:
✅ { users(where: { balance_gt: "1000" }) { id, address, balance } }
✅ { transfers(where: { amount_gte: "100", token: "0x123" }) { id, amount } }
✅ { tokens(where: { symbol_in: ["ETH", "BTC"] }) { id, symbol } }
✅ { tokens(where: { name_contains_nocase: "uniswap" }) { id, name, symbol } }
✅ { users(where: { id_not_in: ["0x123", "0x456"] }) { id, address } }
✅ { pairs(where: { and: [{ token0: "0x123" }, { reserve0_gt: "1000" }] }) { id, token0, token1 } }
✅ { swaps(where: { or: [{ amount0_gt: "100" }, { amount1_gt: "100" }] }) { id, amount0, amount1 } }
✅ { tokens(where: { symbol_starts_with_nocase: "uni" }) { id, symbol, name } }
✅ { positions(where: { owner_not: "0x0000", liquidity_gt: "0" }) { id, owner, liquidity } }

💡 NOW USE THE RAW SCHEMA ABOVE TO:
1. Find @entity types (e.g., User, Token, Transfer)
2. Construct queries using The Graph patterns
3. Use direct field access for relationships
4. Apply The Graph-specific filtering and pagination
5. Validate the query, then execute it

LIMITATION:
- The Graph does NOT support aggregates, if there is a need for aggregation, and no aggregation entity is present, inform the user that aggregation is not supported and suggest some alternatives questions that can be answered with the available data.

DO NOT call graphql_schema_info again - everything needed is above.`;
}

function generateSubQLSchemaInfo(schemaContent: string): string {
  return `📖 SUBQL (POSTGRAPHILE v4) SCHEMA & RULES:

🔍 RAW ENTITY SCHEMA:
${schemaContent}

📋 POSTGRAPHILE v4 INFERENCE RULES:
- Each @entity type → database table with 2 queries: singular(id) & plural(filter/pagination)
- Fields with @derivedFrom → relationship fields, need subfield selection
- Foreign key fields ending in 'Id' → direct ID access
- System tables (_pois, _metadatas, _metadata) → ignore these

📖 POSTGRAPHILE v4 QUERY PATTERNS:
1. 📊 ENTITY QUERIES:
   - Single query: entityName(id: ID!) → EntityType
   - Collection query: entityNames(first: Int, filter: EntityFilter, orderBy: [EntityOrderBy!]) → EntityConnection

2. 🔗 RELATIONSHIP QUERIES:
   - Foreign key ID: fieldNameId (returns ID directly)
   - Single entity: fieldName { id, otherFields }
   - Collection relationships: fieldName { nodes { id, otherFields }, pageInfo { hasNextPage, endCursor }, totalCount }
   - With filters: fieldName(filter: { ... }) { nodes { ... }, totalCount }

3. 📝 FILTER PATTERNS (PostGraphile Format):

   STRING FILTERS:
   - equalTo, notEqualTo, distinctFrom, notDistinctFrom
   - in: [String!], notIn: [String!]
   - lessThan, lessThanOrEqualTo, greaterThan, greaterThanOrEqualTo
   - Case insensitive: equalToInsensitive, inInsensitive, etc.
   - isNull: Boolean

   BIGINT/NUMBER FILTERS:
   - equalTo, notEqualTo, distinctFrom, notDistinctFrom
   - lessThan, lessThanOrEqualTo, greaterThan, greaterThanOrEqualTo
   - in: [BigInt!], notIn: [BigInt!]
   - isNull: Boolean

   BOOLEAN FILTERS:
   - equalTo, notEqualTo, distinctFrom, notDistinctFrom
   - in: [Boolean!], notIn: [Boolean!]
   - isNull: Boolean

   EXAMPLES:
   - { id: { equalTo: "0x123" } }
   - { status: { in: ["active", "pending"] } }
   - { count: { greaterThan: 100 } }
   - { name: { equalToInsensitive: "alice" } }

4. 📈 ORDER BY PATTERNS:
   - Format: Convert fieldName to UPPER_CASE with underscores, then add _ASC/_DESC
   - Conversion: camelCase → UPPER_SNAKE_CASE
   - Examples: id → ID_ASC, createdAt → CREATED_AT_DESC, projectId → PROJECT_ID_ASC

5. 📄 PAGINATION:
   - Forward: first: 10, after: "cursor"
   - Backward: last: 10, before: "cursor"
   - Offset: offset: 20, first: 10

6. 📊 AGGREGATION (PostGraphile Aggregation Plugin):

   GLOBAL AGGREGATES (all data):
   - aggregates { sum { fieldName }, distinctCount { fieldName }, min { fieldName }, max { fieldName } }
   - aggregates { average { fieldName }, stddevSample { fieldName }, stddevPopulation { fieldName } }
   - aggregates { varianceSample { fieldName }, variancePopulation { fieldName }, keys }

   GROUPED AGGREGATES (group by):
   - groupedAggregates(groupBy: [FIELD_NAME], having: { ... }) { keys, sum { fieldName } }
   - groupBy: Required, uses UPPER_SNAKE_CASE format (same as orderBy)
   - having: Optional, uses same filter format as main query

   EXAMPLES:
   - { indexers { aggregates { sum { totalReward }, distinctCount { projectId } } } }
   - { indexers { groupedAggregates(groupBy: [PROJECT_ID]) { keys, sum { totalReward } } } }

🚨 CRITICAL AGENT RULES:
1. ALWAYS validate queries with graphql_query_validator before executing
2. For missing user info ("my rewards"), ASK for wallet/ID - NEVER fabricate data
3. Pass queries to graphql_execute as plain text (no backticks/quotes)
4. Only use graphql_type_detail as FALLBACK when validation fails - prefer raw schema

⚠️ CRITICAL FOREIGN KEY RULES:
- Fields with @derivedFrom CANNOT be queried alone - they need subfield selection
- Use: fieldName { id, otherField } NOT just fieldName
- Foreign key fields ending in 'Id' can be queried directly as they return ID values

⚠️ CRITICAL @jsonField RULES:
- Fields marked with @jsonField are stored as JSON and CANNOT be expanded
- Query @jsonField fields directly without subfield selection
- Example: metadata @jsonField → Use metadata NOT metadata { subfields }
- @jsonField fields return raw JSON data, treat as scalar values

🔍 FOREIGN KEY IDENTIFICATION:
- Look at field TYPE, not field name, to determine relationship
- If field type is @entity → it's a foreign key relationship
  - Physical storage: <fieldName>Id exists and can be used in filters
  - Query usage: fieldName { subfields } for object, fieldNameId for ID
  - Entity lookup: Use the TYPE name to find the @entity definition
- If field type is basic type/enum/@jsonField → NOT a foreign key
  - Query directly: fieldName (no subfield selection needed)
  - For @jsonField: Query as scalar, DO NOT expand subfields

⚠️ CRITICAL: Field type determines entity, NOT field name
- Field: project: Project → Look for @entity Project (not @entity project)
- Field: owner: Account → Look for @entity Account (not @entity owner)

📝 TYPE MAPPING EXAMPLES:
- project: Project → Find @entity Project, query project { id, owner } or projectId
- owner: Account → Find @entity Account, query owner { id, address } or ownerId
- delegator: Delegator → Find @entity Delegator, query delegator { id, amount }
- status: String → Basic type: use status directly
- metadata: JSON @jsonField → Query metadata directly (NOT metadata { subfields })
- type: IndexerType → Enum: use type directly

🎯 REMEMBER: Field name ≠ Entity name. Use TYPE to find the @entity definition!

📋 RELATIONSHIP QUERY EXAMPLES:
✅ { indexer(id: "0x123") { id, project { id, owner } } }
✅ { project(id: "0x456") { id, indexers { nodes { id, status }, totalCount } } }
✅ { indexers { nodes { id, projectId, project { id, owner } } } }
❌ { project { indexers { id, status } } } (missing nodes wrapper)

📋 @jsonField QUERY EXAMPLES:
✅ { project(id: "0x123") { id, metadata, config } } (query @jsonField directly)
✅ { indexers { nodes { id, metadata, settings } } } (@jsonField as scalar)
❌ { project { metadata { name, description } } } (@jsonField cannot be expanded)
❌ { indexer { config { threshold, timeout } } } (@jsonField cannot have subfields)

📊 AGGREGATION QUERY EXAMPLES:
✅ { indexers { aggregates { sum { totalReward }, distinctCount { projectId } } } }
✅ { projects { aggregates { average { totalBoost }, max { totalReward } } } }
✅ { indexers { groupedAggregates(groupBy: [PROJECT_ID]) { keys, sum { totalReward }, distinctCount { id } } } }
✅ { rewards { groupedAggregates(groupBy: [ERA, INDEXER_ID], having: { era: { greaterThan: 100 } }) { keys, sum { amount } } } }

💡 NOW USE THE RAW SCHEMA ABOVE TO:
1. Find @entity types (e.g., Project, Indexer)
2. Infer queries: project(id), projects(filter/pagination)
3. Identify field types to determine foreign key relationships
4. Construct your GraphQL query using the patterns above
5. Validate the query, then execute it

DO NOT call graphql_schema_info again - everything needed is above.`;
}
