# SubQL GraphQL Agent

A TypeScript/Node.js GraphQL agent for SubQuery Network that uses LangChain and OpenAI to query GraphQL endpoints intelligently with natural language.

## Overview

This toolkit provides LLM agents with the ability to interact with any GraphQL API built with SubQuery SDK through natural language, automatically understanding schemas, validating queries, and executing complex GraphQL operations.

### Key Features

- **Natural Language Interface**: Ask questions about blockchain data in plain English
- **Automatic Schema Understanding**: Agents learn PostGraphile v4 patterns and SubQuery entity schemas
- **Query Generation & Validation**: Converts natural language to valid GraphQL queries with built-in validation
- **SubQuery SDK Optimized**: Works with any project built using SubQuery SDK (Ethereum, Polkadot, Cosmos, etc.)

## Design Philosophy

### Solving the GraphQL Schema Size Problem

Traditional GraphQL agents face a fundamental challenge: **schema size exceeds LLM context limits**. Most GraphQL APIs have introspection schemas that are tens of thousands of tokens, making them:

- **Too large** for most commercial LLMs (exceeding context windows)
- **Too expensive** for cost-effective query generation
- **Too noisy** for reliable query construction (low signal-to-noise ratio)

### Our Innovative Approach: Entity Schema + Rules

Instead of using raw GraphQL introspection schemas, we developed a **compressed, high-density schema representation**:

#### Entity Schema as Compressed Knowledge
- **Compact Format**: 100x smaller than full introspection schemas
- **Domain-Specific**: Contains project-specific entities and relationships
- **High Information Density**: Only essential types, relationships, and patterns
- **Rule-Based**: Combined with PostGraphile v4 patterns for query construction

#### Size Comparison
```
Traditional Approach:
├── Full GraphQL Introspection: ~50,000+ tokens
├── Context Window Usage: 80-95%
└── Result: Often fails or generates invalid queries

Our Approach:
├── Entity Schema: ~500-1,000 tokens
├── PostGraphile Rules: ~200-300 tokens
├── Context Window Usage: 5-10%
└── Result: Reliable, cost-effective query generation
```

#### Benefits

- **Cost Effective**: 10-20x lower token usage than traditional approaches
- **Higher Accuracy**: Domain-specific knowledge reduces errors
- **Faster Responses**: Smaller context means faster processing
- **Scalable**: Works consistently across different LLM models

## Architecture

### Core Components

1. **GraphQLSource** - Connection wrapper for GraphQL endpoints with entity schema support
2. **GraphQLToolkit** - LangChain-compatible toolkit providing all GraphQL tools
3. **GraphQL Agent Tools** - Individual tools for specific GraphQL operations

### Available Tools

1. **`graphql_schema_info`** - Get raw entity schema with PostGraphile v4 rules
2. **`graphql_query_validator_execute`** - Combined validation and execution tool (validates queries, then executes them if valid)

## Installation

```bash
# Install dependencies
pnpm install
```

## Configuration

Copy the environment example file:

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your-openai-api-key

# Optional
LLM_MODEL=gpt-4o  # Default model
PORT=8000         # Server port (if running API server)
```

## Usage

### Basic Example

```typescript
import { runLangChainGraphQLAgent } from './src/langchain-agent.js';
import type { GraphQLProjectConfig } from './src/types.js';

// Load entity schema (learn more: https://subquery.network/doc/indexer/build/graphql.html)
// This example uses SubQuery Network's schema - replace with your own project's schema
const entitySchema = `
type Indexer implements Entity {
  id: ID!
  ownerId: String!
  active: Boolean!
  rewards: [Reward!]!
  projects: [Project!]!
}

type Project implements Entity {
  id: ID!
  owner: String!
  metadata: String!
}
`;

const config: GraphQLProjectConfig = {
  cid: "subquery-network",
  schemaContent: entitySchema,
  nodeType: GraphqlProvider.SUBQL,
  updatedAt: new Date().toISOString(),
  domainName: "SubQuery Network",
  domainCapabilities: [
    "Indexer information and performance metrics",
    "Project registration and metadata",
    "Staking rewards and delegation data",
    "Network statistics and era information"
  ],
  declineMessage: "I'm specialized in SubQuery Network data queries. I can help you with indexers, projects, staking rewards, and network statistics, but I cannot assist with cooking. Please ask me about SubQuery Network data instead."
};

// Note: This example uses SubQuery Network's API - replace with your own project's endpoint
const endpoint = "https://index-api.onfinality.io/sq/subquery/subquery-mainnet";

// Query with natural language
const answer = await runLangChainGraphQLAgent(
  config,
  "Show me the top 3 indexers with their project information",
  endpoint
);

console.log(answer);
```

### Example Natural Language Queries

**Note**: These examples are for the SubQuery Network demo. For your own project, the queries would be specific to your indexed blockchain data.

#### Basic Data Retrieval
- "Show me the first 5 indexers and their IDs"
- "What projects are available? Show me their owners"
- "List all indexers with their project information"

#### Staking & Rewards
- "What are my staking rewards for wallet 0x123...?"
- "Show me rewards for the last era"
- "Find delegations for a specific indexer"

#### Performance & Analytics
- "Which indexers have the highest rewards?"
- "Show me project performance metrics"
- "List top performing indexers by era"

## PostGraphile v4 Query Patterns

The agent understands PostGraphile v4 patterns automatically:

### Entity Queries
- **Single**: `entityName(id: ID!)` -> Full entity object
- **Collection**: `entityNames(first: Int, filter: EntityFilter)` -> Connection with pagination

### Filtering
```graphql
filter: {
  fieldName: { equalTo: "value" }
  amount: { greaterThan: 100 }
  status: { in: ["active", "pending"] }
}
```

### Ordering
```graphql
orderBy: [FIELD_NAME_ASC, CREATED_AT_DESC]
```

### Pagination
```graphql
{
  entities(first: 10, after: "cursor") {
    nodes { id, field }
    pageInfo { hasNextPage, endCursor }
  }
}
```

## Agent Workflow

The agent follows this intelligent workflow:

1. **Relevance Check**: Determines if the question relates to the project data
2. **Schema Analysis**: Loads entity schema and PostGraphile rules (once per session)
3. **Query Construction**: Builds GraphQL queries using PostGraphile patterns
4. **Validation**: Validates queries against the live GraphQL schema
5. **Execution**: Executes validated queries to get real data
6. **Summarization**: Provides user-friendly responses based on actual results

## Development

```bash
# Development mode with auto-reload
pnpm dev

# Build the project
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck
```

## Scripts

- `dev` - Run in development mode with file watching
- `build` - Compile TypeScript to JavaScript
- `build:watch` - Compile with file watching
- `start` - Run the compiled application
- `test` - Run tests
- `test:watch` - Run tests in watch mode
- `typecheck` - Run TypeScript type checking
- `lint` - Run ESLint (if configured)
- `clean` - Clean build output

## Project Structure

```
sq-graphql-agent/
├── src/                    # Source code
│   ├── langchain-agent.ts  # Main agent implementation
│   ├── tools.ts            # GraphQL tools
│   ├── types.ts            # TypeScript type definitions
│   └── utils.ts            # Utility functions
├── examples/               # Usage examples
├── tests/                  # Test files
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

## Dependencies

### Runtime Dependencies
- `@langchain/community` - LangChain community tools
- `@langchain/core` - LangChain core utilities
- `@langchain/langgraph` - LangGraph for agent workflows
- `@langchain/openai` - OpenAI integration
- `graphql` - GraphQL query library
- `openai` - OpenAI API client
- `pino` - Fast JSON logger
- `zod` - Schema validation

### Development Dependencies
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution tool
- `jest` - Testing framework
- `ts-jest` - Jest TypeScript preset
- `@types/node` - Node.js type definitions

## Error Handling

The toolkit includes comprehensive error handling:

### Network Issues
- GraphQL endpoint connectivity problems
- Timeout handling for long-running queries
- Automatic retry for transient failures

### Schema Introspection Issues
- Authorization error detection (e.g., missing headers)
- Invalid endpoint error handling
- Prevents caching of failed introspection results

### Query Issues
- Invalid GraphQL syntax detection
- Schema validation with detailed error messages
- Field existence verification

## Performance Considerations

### Query Optimization
- Always use pagination (`first: N`) for collection queries
- Limit nested relationship depth to avoid expensive queries
- Use specific field selection rather than querying all fields

### Caching Strategy
- GraphQL schema introspection results are cached (configurable TTL)
- Entity schema is loaded once per toolkit instance
- No query result caching (always fresh data)

### Resource Management
- Connection pooling for HTTP requests
- Automatic cleanup of resources
- Memory-efficient schema processing

## Model Performance Comparison

Based on comprehensive testing, here's how different LLM models perform with this GraphQL agent:

| Model              | Performance | Query Accuracy | Complex Reasoning | Cost Efficiency | Recommendation |
|--------------------|-------------|----------------|-------------------|-----------------|----------------|
| **Gemini-3-flash(openrouter)** | Excellent | Excellent | Excellent | Good | **Recommended** |
| **GLM-4.6**        | Very Good | Very Good | Excellent | Excellent | **Cost-Effective** |
| **Kimi-k2**   | Good | Fair | Fair | Very Good | **Cost-Effective** |

### Recommendation Guidelines

**For Production Use:**
```bash
export LLM_MODEL="gpt-4o"  # Best reliability and accuracy
```

**For Cost-Conscious Production:**
```bash
export LLM_MODEL="deepseek-v3"  # Excellent value proposition
```

**For Development/Testing:**
```bash
export LLM_MODEL="gpt-4.1-mini"  # Good balance for non-production
```

## Comparison with Alternatives

| Feature | SubQL GraphQL Agent | LangChain GraphQL | LangChain SQL Agents       |
|---------|---------------------|-------------------|----------------------------|
| **Schema Size Handling** | Entity compression (500 tokens) | Full schema per query (50k+ tokens) | Table schemas (compact)  |
| **Domain Flexibility** | SubQuery SDK only | Any GraphQL API | Any SQL database         |
| **Schema Learning** | Learns once, reasons multiple queries | Requires schema in every query | Learns schema structure     |
| **Natural Language** | Full support | Limited by context size | Full support             |
| **Query Construction** | PostGraphile rules | Pattern matching only | Mature SQL generation    |
| **Cost Efficiency** | Low token usage | Very high token usage | Very efficient           |
| **Security & Access** | API-only, no DB access | API-only, no DB access | Requires DB credentials  |
| **Setup Complexity** | Simple for SubQuery | Schema management overhead | DB access + permissions |

## License

Apache-2.0
