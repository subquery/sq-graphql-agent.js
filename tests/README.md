# GraphQL Agent E2E Tests

This directory contains end-to-end tests for the GraphQL Agent functionality.

## Prerequisites

Before running the e2e tests, you need to:

1. Create a `.env` file in the `sq-graphql-agent` directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

2. Add your OpenAI API key to the `.env` file:

```
OPENAI_API_KEY=your_openai_api_key_here
```

3. (Optional) Specify a custom LLM model:

```
LLM_MODEL=gpt-4o-mini
```

4. (Optional) Test with a different model:

```
TEST_LLM_MODEL=gpt-4
```

## Running the Tests

```bash
# Run all tests
pnpm test

# Run with verbose output
pnpm test -- --verbose

# Run a specific test
pnpm test -- --testNamePattern="should initialize project config"
```

## Test Cases

The e2e tests cover:

1. **Project Config Initialization**
   - Fetches CID from the GraphQL endpoint
   - Analyzes the schema using LLM
   - Enriches configuration with domain capabilities

2. **Agent Creation and Invocation**
   - Creates a GraphQL agent with real configuration
   - Tests various questions about the API
   - Validates response structure and content

3. **Data Query Testing**
   - Tests actual GraphQL queries through the agent
   - Validates tool usage and query execution

4. **Multi-Model Support** (Optional)
   - Tests with different LLM models if specified

## Notes

- Tests use the The Graph endpoint: `https://gateway.thegraph.com/api/97286193487e32b3c710c511ecdeb1c2/subgraphs/id/HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1`
- Each test has a 2-minute timeout to accommodate real API calls
- In-memory persistent service is used to avoid external dependencies
- All network requests use the native fetch API (replaced axios)

## Debugging

To enable debug logging, set the following environment variables:

```bash
DEBUG=* pnpm test
```

Or for GraphQL-specific debugging:

```bash
DEBUG=graphql:* pnpm test
```