# SQ GraphQL Agent

A TypeScript/Node.js GraphQL agent for SubQuery Network that uses LangChain and OpenAI to query GraphQL endpoints intelligently.

## Features

- 🤖 AI-powered GraphQL query generation
- 🔍 Automatic schema introspection
- 📊 Smart query optimization with pagination
- 🔧 Support for multiple GraphQL providers (SubQuery, The Graph)
- 🔑 Custom authentication headers support
- 📝 Comprehensive logging and error handling

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

## Usage

### Basic Example

```typescript
import { runLangChainGraphQLAgent } from './src/langchain-agent.js';
import type { GraphQLProjectConfig } from './src/types.js';

const config: GraphQLProjectConfig = {
  cid: "example-project",
  schemaContent: `
    type Query {
      hello: String!
    }
  `,
  nodeType: GraphqlProvider.SUBQL,
  updatedAt: new Date().toISOString(),
  domainName: "Example Project",
  domainCapabilities: ["Query data", "Analyze results"],
  declineMessage: "I can only answer questions about this GraphQL project."
};

const answer = await runLangChainGraphQLAgent(
  config,
  "What data is available?",
  "https://api.example.com/graphql"
);

console.log(answer);
```

### Development

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

## License

ISC