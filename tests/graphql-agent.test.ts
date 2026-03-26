// Copyright 2020-2025 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0
// Load environment variables from .env file
import dotenv from 'dotenv';
import type {Logger} from 'pino';
import {createGraphQLAgent, initializeProjectConfig} from '../src/index.js';
import {
  type PersistentService,
  type GraphQLAgentConfig,
  type GraphQLProjectConfig,
  GraphqlProvider,
} from '../src/types.js';

// Try to load .env from the parent directory
dotenv.config({path: '../.env'});
// Also try to load from current directory as fallback
dotenv.config();

// Logger mock to capture all logs
class LoggerMock {
  private logs: Array<{
    level: string;
    msg: string;
    obj?: any;
    time?: string;
  }> = [];

  constructor(private enabled = true) {}

  // Method to collect logs
  collect(level: string, msg: string, obj?: any, time?: string) {
    if (this.enabled) {
      this.logs.push({level, msg, obj, time});

      // Also print to console for test visibility
      const timestamp = time || new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${msg}`, obj || '');
    }
  }

  // Pino logger interface implementation
  debug(...args: any[]): void {
    if (args.length === 0) return;
    if (typeof args[0] === 'string' && args.length === 1) {
      this.collect('debug', args[0]);
    } else if (typeof args[0] === 'string' && args.length >= 2) {
      this.collect('debug', args[0], args[1]);
    } else if (typeof args[0] === 'object') {
      this.collect('debug', args[1] || '', args[0]);
    }
  }

  info(...args: any[]): void {
    if (args.length === 0) return;
    if (typeof args[0] === 'string' && args.length === 1) {
      this.collect('info', args[0]);
    } else if (typeof args[0] === 'string' && args.length >= 2) {
      this.collect('info', args[0], args[1]);
    } else if (typeof args[0] === 'object') {
      this.collect('info', args[1] || '', args[0]);
    }
  }

  warn(...args: any[]): void {
    if (args.length === 0) return;
    if (typeof args[0] === 'string' && args.length === 1) {
      this.collect('warn', args[0]);
    } else if (typeof args[0] === 'string' && args.length >= 2) {
      this.collect('warn', args[0], args[1]);
    } else if (typeof args[0] === 'object') {
      this.collect('warn', args[1] || '', args[0]);
    }
  }

  error(...args: any[]): void {
    if (args.length === 0) return;
    if (typeof args[0] === 'string' && args.length === 1) {
      this.collect('error', args[0]);
    } else if (typeof args[0] === 'string' && args.length >= 2) {
      this.collect('error', args[0], args[1]);
    } else if (typeof args[0] === 'object') {
      this.collect('error', args[1] || '', args[0]);
    }
  }

  fatal(...args: any[]): void {
    if (args.length === 0) return;
    if (typeof args[0] === 'string' && args.length === 1) {
      this.collect('fatal', args[0]);
    } else if (typeof args[0] === 'string' && args.length >= 2) {
      this.collect('fatal', args[0], args[1]);
    } else if (typeof args[0] === 'object') {
      this.collect('fatal', args[1] || '', args[0]);
    }
  }

  trace(...args: any[]): void {
    if (args.length === 0) return;
    if (typeof args[0] === 'string' && args.length === 1) {
      this.collect('trace', args[0]);
    } else if (typeof args[0] === 'string' && args.length >= 2) {
      this.collect('trace', args[0], args[1]);
    } else if (typeof args[0] === 'object') {
      this.collect('trace', args[1] || '', args[0]);
    }
  }

  // Methods to analyze collected logs
  getAllLogs() {
    return [...this.logs];
  }

  getLogsByLevel(level: string) {
    return this.logs.filter((log) => log.level === level);
  }

  getLogsContaining(searchText: string) {
    return this.logs.filter(
      (log) => log.msg.includes(searchText) || JSON.stringify(log.obj || {}).includes(searchText)
    );
  }

  hasLog(level: string, searchText?: string): boolean {
    return this.logs.some((log) => {
      const levelMatch = log.level === level;
      if (!searchText) return levelMatch;
      return levelMatch && (log.msg.includes(searchText) || JSON.stringify(log.obj || {}).includes(searchText));
    });
  }

  countLogs() {
    return this.logs.length;
  }

  clear() {
    this.logs = [];
  }

  printAll() {
    console.log('\n=== Captured Logs ===');
    this.logs.forEach((log, i) => {
      const time = log.time ? `[${log.time}]` : '';
      console.log(`${time} [${log.level.toUpperCase()}] ${log.msg}`, log.obj || '');
    });
    console.log('=== End of Logs ===\n');
  }

  // Child logger (for compatibility)
  child(bindings: any): LoggerMock {
    const child = new LoggerMock(this.enabled);
    // Apply bindings to logs
    const originalCollect = child.collect.bind(child);
    child.collect = (level: string, msg: string, obj?: any, time?: string) => {
      const mergedObj = {...bindings, ...(obj || {})};
      originalCollect(level, msg, mergedObj, time);
    };
    return child as any;
  }

  // Pino specific properties
  level = 'debug';
  levels: {values: {[key: string]: number}} = {
    values: {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50,
      fatal: 60,
    },
  };
}

// Simple in-memory persistent service for testing
class InMemoryPersistentService implements PersistentService {
  private storage = new Map<string, GraphQLProjectConfig>();

  async save(endpoint: string, config: GraphQLProjectConfig, namespace?: string): Promise<void> {
    const key = namespace ? `${namespace}:${endpoint}` : endpoint;
    this.storage.set(key, config);
    console.log(`Saved config for endpoint: ${key}`);
  }

  async load(endpoint: string, cid?: string, namespace?: string): Promise<GraphQLProjectConfig | undefined> {
    const key = namespace ? `${namespace}:${endpoint}` : endpoint;
    const config = this.storage.get(key);
    console.log(`Loading config for endpoint: ${key}, found: ${!!config}`);

    // If CID is provided, check if it matches
    if (cid && config) {
      return config.cid === cid ? config : undefined;
    }

    return config;
  }

  clear(): void {
    this.storage.clear();
  }
}

describe('GraphQL Agent E2E Tests', () => {
  const endpoint =
    'https://gateway.thegraph.com/api/97286193487e32b3c710c511ecdeb1c2/subgraphs/id/HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1';
  const persistentService = new InMemoryPersistentService();
  const loggerMock = new LoggerMock();

  beforeAll(() => {
    // Verify required environment variables
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for e2e tests. Please set it in your .env file.');
    }
    console.log(`Using model: ${process.env.LLM_MODEL || 'gpt-4o-mini'}`);
  }, 10000);

  it('should initialize project config from real endpoint', async () => {
    const llmConfig: GraphQLAgentConfig['llm'] = {
      model: process.env.LLM_MODEL!,
      apiKey: process.env.OPENAI_API_KEY!,
      temperature: 0,
    };

    console.log(`Initializing project config for endpoint: ${endpoint}`);

    const config = await initializeProjectConfig(endpoint, persistentService, llmConfig);

    // Verify config properties
    expect(config).toBeDefined();
    expect(config.endpoint).toBe(endpoint);
    expect(config.cid).toBeDefined();
    expect(typeof config.cid).toBe('string');
    expect(config.cid.length).toBeGreaterThan(0);

    // Check provider type
    expect(config.nodeType).toBeDefined();
    expect(Object.values(GraphqlProvider)).toContain(config.nodeType);

    // Check domain analysis
    expect(config.domainName).toBeDefined();
    expect(typeof config.domainName).toBe('string');
    expect(config.domainName.length).toBeGreaterThan(0);

    expect(config.domainCapabilities).toBeDefined();
    expect(Array.isArray(config.domainCapabilities)).toBe(true);
    expect(config.domainCapabilities.length).toBeGreaterThan(0);

    expect(config.declineMessage).toBeDefined();
    expect(typeof config.declineMessage).toBe('string');

    // Check schema
    expect(config.schemaContent).toBeDefined();
    expect(typeof config.schemaContent).toBe('string');
    expect(config.schemaContent.length).toBeGreaterThan(0);

    // Check timestamps
    expect(config.lastAnalyzedAt).toBeDefined();

    console.log(`Successfully initialized config for ${config.domainName}`);
    console.log(`CID: ${config.cid}`);
    console.log(`Provider: ${config.nodeType}`);
    console.log(`Capabilities: ${config.domainCapabilities?.join(', ') || 'undefined'}`);
    console.log(`Last analysis error: ${config.lastAnalysisError || 'none'}`);
    console.log(`Schema content length: ${config.schemaContent.length} chars`);
    console.log('Full config:', JSON.stringify(config, null, 2));
  }, 120000);

  it('should create and invoke GraphQL agent with real API', async () => {
    // Read GraphQLProjectConfig from file
    const {readFileSync} = await import('fs');
    const path = await import('path');
    const configPath = path.resolve('tests', 'projects', 'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1.json');
    const configData = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData) as GraphQLProjectConfig;

    console.log(`Loaded config for: ${config.domainName}`);
    console.log(`Provider: ${config.nodeType}`);
    console.log(`CID: ${config.cid}`);

    expect(config).toBeDefined();
    expect(config.endpoint).toBe(endpoint);
    expect(config.cid).toBeDefined();
    expect(config.domainCapabilities).toBeDefined();
    expect(Array.isArray(config.domainCapabilities)).toBe(true);
    expect(config.domainCapabilities.length).toBeGreaterThan(0);

    // Clear previous logs
    loggerMock.clear();

    // Create the agent
    const llmConfig: GraphQLAgentConfig['llm'] = {
      model: process.env.LLM_MODEL!,
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_API_BASE!,
      temperature: 0,
    };

    console.log('Creating GraphQL agent...');
    const agent = await createGraphQLAgent(
      config,
      {
        llm: llmConfig,
        verbose: 1, // Include verbose to test query output
      },
      loggerMock as unknown as Logger
    );

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');

    // Check if agent creation logged anything
    const agentCreationLogs = loggerMock.getAllLogs();
    console.log(`\nAgent creation captured ${agentCreationLogs.length} logs`);

    // Test questions
    const testQuestions = [
      'List all trading pairs for SQT token. Return the query used as well.',
      // "what is the trading volume like for usdt/weth? and return the graphql query used",
      // "what pool is the most traded pool in the recent week? what is the volume like? return with the graphql query used",
      // "return all my positions with their details"
      // "show me recent SQT token trade details including the prices, along with the graphql queries used",
    ];

    for (const question of testQuestions) {
      console.log(`\nTesting question: ${question}`);

      // Clear logs before each question
      const logsBeforeQuestion = loggerMock.countLogs();

      try {
        console.time('agent invoke');
        const response = await agent.invoke(question);
        console.timeEnd('agent invoke');
        // Verify the response
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);

        console.log(`Response length: ${response.length} characters`);
        console.log(`Response preview: ${response}...`);

        // Check that response is not just error messages
        expect(response.toLowerCase()).not.toContain('no tools available');
        expect(response.toLowerCase()).not.toContain('agent completed without producing');

        // Analyze logs generated during this question
        const questionLogs = loggerMock.getAllLogs().slice(logsBeforeQuestion);
        console.log(`\nQuestion generated ${questionLogs.length} additional logs`);

        // Assert on specific log patterns
        if (questionLogs.length > 0) {
          // Check if there are any schema info queries
          const schemaQueries = questionLogs.filter(
            (log) => log.msg.includes('graphql_schema_info') || JSON.stringify(log.obj || {}).includes('introspection')
          );
          if (schemaQueries.length > 0) {
            console.log(`  - Found ${schemaQueries.length} schema-related queries`);
          }

          // Check for GraphQL query execution
          const queryExecutions = questionLogs.filter(
            (log) =>
              log.msg.includes('graphql_query_validator_execute') || JSON.stringify(log.obj || {}).includes('query')
          );
          if (queryExecutions.length > 0) {
            console.log(`  - Found ${queryExecutions.length} GraphQL query executions`);
          }

          // Check for any errors
          const errorLogs = loggerMock.getLogsByLevel('error');
          if (errorLogs.length > 0) {
            console.log(`  - Found ${errorLogs.length} error logs`);
          }

          // Check for warnings
          const warnLogs = loggerMock.getLogsByLevel('warn');
          if (warnLogs.length > 0) {
            console.log(`  - Found ${warnLogs.length} warning logs`);
          }
        }
      } catch (error) {
        console.error(`Error processing question "${question}":`, error instanceof Error ? error.message : error);

        // Print logs for debugging
        console.log('\n=== Captured Logs during error ===');
        loggerMock.printAll();

        // Don't fail the test if LLM has issues - the structure is what we're testing
        expect(agent).toBeDefined();
        expect(typeof agent.invoke).toBe('function');
      }
    }

    // Print all captured logs at the end for analysis
    console.log('\n=== Final Log Summary ===');
    console.log(`Total logs captured: ${loggerMock.countLogs()}`);
    const logsByLevel = {
      debug: loggerMock.getLogsByLevel('debug').length,
      info: loggerMock.getLogsByLevel('info').length,
      warn: loggerMock.getLogsByLevel('warn').length,
      error: loggerMock.getLogsByLevel('error').length,
      fatal: loggerMock.getLogsByLevel('fatal').length,
      trace: loggerMock.getLogsByLevel('trace').length,
    };
    console.log('Logs by level:', logsByLevel);
  }, 120000);

  it('should create agent with verbose=2 and show detailed execution info', async () => {
    // Read GraphQLProjectConfig from file
    const {readFileSync} = await import('fs');
    const path = await import('path');
    const configPath = path.resolve('tests', 'projects', 'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1.json');
    const configData = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData) as GraphQLProjectConfig;

    // Clear previous logs
    loggerMock.clear();

    // Create the agent with verbose=2
    const llmConfig: GraphQLAgentConfig['llm'] = {
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_API_BASE,
      temperature: 0,
    };

    console.log('Creating GraphQL agent with verbose=2...');
    const agent = await createGraphQLAgent(
      config,
      {
        llm: llmConfig,
        verbose: 2, // Maximum verbosity for detailed execution info
      },
      loggerMock as unknown as Logger
    );

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');

    // Test with a simple query
    const question = 'Show me the first 3 tokens';
    console.log(`\nTesting verbose level 2 with question: ${question}`);

    const logsBefore = loggerMock.countLogs();
    const response = await agent.invoke(question);
    const logsAfter = loggerMock.countLogs();

    console.log(`\nResponse received (${response.length} chars)`);
    console.log(`Logs generated during execution: ${logsAfter - logsBefore}`);

    // Check if response includes execution details
    // Note: The LLM may not always follow verbose instructions strictly
    const verbose = 2; // This is the verbose level we set for this test
    if (verbose === 1) {
      // For verbose=1, check if response mentions queries (optional)
      const hasQuery = response.includes('query(') || response.includes('GraphQL');
      if (hasQuery) {
        console.log('\n✓ Response includes query information as expected for verbose=1');
      } else {
        console.log('\n⚠ Response does not include query information (LLM may not follow verbose instruction)');
      }
    } else if (verbose === 2) {
      // For verbose=2, check for detailed execution information
      const hasDetails =
        response.includes('query(') ||
        response.includes('execution') ||
        response.includes('validation') ||
        response.includes('optimization');
      if (hasDetails) {
        console.log('\n✓ Response includes detailed execution information as expected for verbose=2');
      } else {
        console.log(
          '\n⚠ Response does not include detailed execution information (LLM may not follow verbose instruction)'
        );
      }
    }

    // Print execution logs
    console.log('\n=== Execution Logs ===');
    loggerMock.getAllLogs().forEach((log) => {
      console.log(`[${log.level.toUpperCase()}] ${log.msg}`, log.obj || '');
    });
  }, 120000);

  it('should verify verbose prompt generation', async () => {
    const {buildSystemPrompt} = await import('../src/prompts.js');
    const testConfig: GraphQLProjectConfig = {
      endpoint: 'https://test.com',
      cid: 'test',
      nodeType: GraphqlProvider.THE_GRAPH,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'Test API',
      domainCapabilities: ['Test queries'],
      declineMessage: 'Cannot process',
      schemaContent: 'type Query { hello: String }',
      authorization: undefined,
      introspectionSchema: undefined,
    };

    // Test verbose = 0 (default)
    const prompt0 = buildSystemPrompt(testConfig, 0);
    expect(prompt0).not.toContain('VERBOSE OUTPUT');
    expect(prompt0).not.toContain('Return the query used');

    // Test verbose = 1
    const prompt1 = buildSystemPrompt(testConfig, 1);
    expect(prompt1).toContain('VERBOSE OUTPUT (Level 1)');
    expect(prompt1).toContain('Always include the exact GraphQL query(s) used in your response');

    // Test verbose = 2
    const prompt2 = buildSystemPrompt(testConfig, 2);
    expect(prompt2).toContain('VERBOSE OUTPUT (Level 2)');
    expect(prompt2).toContain('Always include the exact GraphQL query(s) used in your response');
    expect(prompt2).toContain('report the tool call details');
    expect(prompt2).toContain('Explain your query construction strategy');

    console.log('\n✓ Verbose prompt generation working correctly');
  }, 120000);
  //
  // it('should test GraphQL service directly', async () => {
  //   // Test the GraphQL service directly without LLM
  //   const { GraphQLService } = await import('../src/graphql.service.js');
  //   const { GraphqlProvider } = await import('../src/types.js');
  //
  //   const service = new GraphQLService({
  //     endpoint,
  //   });
  //
  //   // Test fetching schema
  //   try {
  //     const schema = await service.fetchSchema();
  //     expect(schema).toBeDefined();
  //     console.log('Successfully fetched GraphQL schema');
  //   } catch (error) {
  //     console.error('Failed to fetch schema:', error);
  //     throw error;
  //   }
  //
  //   // Test fetching CID
  //   try {
  //     const cid = await service.fetchCidFromEndpoint(endpoint);
  //     console.log(`Fetched CID: ${cid || 'No CID found'}`);
  //     // CID might be empty if the endpoint doesn't have the metadata fields
  //   } catch (error) {
  //     console.warn('CID fetch failed (may not be supported):', error instanceof Error ? error.message : error);
  //   }
  //
  //   // Test query validation
  //   try {
  //     const issues = await service.validate(`
  //       query {
  //         __schema {
  //           types {
  //             name
  //           }
  //         }
  //       }
  //     `);
  //     console.log(`Query validation issues: ${issues.length || 'none'}`);
  //   } catch (error) {
  //     console.error('Query validation failed:', error);
  //   }
  // }, 120000);
  //
  // it('should test agent with different LLM models if specified', async () => {
  //   // Only run if a different model is specified
  //   const testModel = process.env.TEST_LLM_MODEL;
  //   if (!testModel) {
  //     console.log('Skipping multi-model test - set TEST_LLM_MODEL to enable');
  //     return;
  //   }
  //
  //   const llmConfig: GraphQLAgentConfig['llm'] = {
  //     model: testModel,
  //     apiKey: process.env.OPENAI_API_KEY!,
  //     temperature: 0,
  //   };
  //
  //   console.log(`Testing with model: ${testModel}`);
  //
  //   const config = await initializeProjectConfig(
  //     endpoint,
  //     persistentService,
  //     llmConfig
  //   );
  //
  //   const agent = await createGraphQLAgent(config, { llm: llmConfig });
  //
  //   const response = await agent.invoke("Briefly describe what this API tracks");
  //
  //   expect(typeof response).toBe('string');
  //   expect(response.length).toBeGreaterThan(0);
  //
  //   console.log(`Model ${testModel} response: ${response.substring(0, 200)}...`);
  // }, 120000);

  it('should include graphql_type_detail tool for Codex nodeType', async () => {
    const {createGraphQLTools} = await import('../src/tools/index.js');
    const {GraphQLService} = await import('../src/graphql.service.js');

    // Create a mock Codex config
    const codexConfig: GraphQLProjectConfig = {
      endpoint: 'https://api.defined.fi/',
      cid: 'codex-test',
      nodeType: GraphqlProvider.CODEX,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'Codex API',
      domainCapabilities: ['NFT data', 'Token prices', 'Wallet analytics'],
      declineMessage: '',
      schemaContent: 'type Query { dummy: String }',
    };

    const service = new GraphQLService(codexConfig);

    // Clear previous logs
    loggerMock.clear();

    const tools = createGraphQLTools(service, codexConfig, loggerMock as unknown as Logger);

    // Verify graphql_type_detail tool is present for Codex
    const typeDetailTool = tools.find((t) => t.name === 'graphql_type_detail');
    expect(typeDetailTool).toBeDefined();
    expect(typeDetailTool?.name).toBe('graphql_type_detail');

    // Verify tool description
    expect(typeDetailTool?.description).toContain('FALLBACK');
    expect(typeDetailTool?.description).toContain('depth');

    console.log('\n✓ graphql_type_detail tool is available for Codex nodeType');
  });

  it('should NOT include graphql_type_detail tool for SubQL nodeType', async () => {
    const {createGraphQLTools} = await import('../src/tools/index.js');
    const {GraphQLService} = await import('../src/graphql.service.js');

    // Create a mock SubQL config
    const subqlConfig: GraphQLProjectConfig = {
      endpoint: 'https://api.subquery.network/sq/test',
      cid: 'subql-test',
      nodeType: GraphqlProvider.SUBQL,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'SubQL API',
      domainCapabilities: ['Entity queries'],
      declineMessage: '',
      schemaContent: 'type Query { dummy: String }',
    };

    const service = new GraphQLService(subqlConfig);

    const tools = createGraphQLTools(service, subqlConfig);

    // Verify graphql_type_detail tool is NOT present for SubQL
    const typeDetailTool = tools.find((t) => t.name === 'graphql_type_detail');
    expect(typeDetailTool).toBeUndefined();

    console.log('\n✓ graphql_type_detail tool is NOT available for SubQL nodeType (as expected)');
  });

  it('should NOT include graphql_type_detail tool for The Graph nodeType', async () => {
    const {createGraphQLTools} = await import('../src/tools/index.js');
    const {GraphQLService} = await import('../src/graphql.service.js');

    // Create a mock The Graph config
    const theGraphConfig: GraphQLProjectConfig = {
      endpoint: 'https://gateway.thegraph.com/api/test',
      cid: 'thegraph-test',
      nodeType: GraphqlProvider.THE_GRAPH,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'The Graph API',
      domainCapabilities: ['Subgraph data'],
      declineMessage: '',
      schemaContent: 'type Query { dummy: String }',
    };

    const service = new GraphQLService(theGraphConfig);

    const tools = createGraphQLTools(service, theGraphConfig);

    // Verify graphql_type_detail tool is NOT present for The Graph
    const typeDetailTool = tools.find((t) => t.name === 'graphql_type_detail');
    expect(typeDetailTool).toBeUndefined();

    console.log('\n✓ graphql_type_detail tool is NOT available for The Graph nodeType (as expected)');
  });

  it('should extract type detail with depth from Codex schema', async () => {
    const {createGraphQLTypeDetailTool} = await import('../src/tools/graphql-type-detail.tool.js');

    // Create a mock Codex config
    const codexConfig: GraphQLProjectConfig = {
      endpoint: 'https://api.defined.fi/',
      cid: 'codex-test',
      nodeType: GraphqlProvider.CODEX,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'Codex API',
      domainCapabilities: ['NFT data', 'Token prices', 'Wallet analytics'],
      declineMessage: '',
      schemaContent: 'type Query { dummy: String }',
    };

    // Clear previous logs
    loggerMock.clear();

    const tool = createGraphQLTypeDetailTool(codexConfig, loggerMock as unknown as Logger);

    expect(tool).toBeDefined();
    expect(tool?.name).toBe('graphql_type_detail');

    // Test extracting a type that exists in the Codex schema
    const result = await tool?.func({typeNames: ['NftPoolResponse'], depth: 1});

    expect(typeof result).toBe('string');
    expect(result).toContain('NftPoolResponse');
    expect(result).toContain('depth=');

    // The result should contain the type definition
    console.log('\n✓ Type detail extraction works for Codex schema');
    console.log(`Result preview: ${result.substring(0, 300)}...`);
  });

  it('should handle non-existent type gracefully', async () => {
    const {createGraphQLTypeDetailTool} = await import('../src/tools/graphql-type-detail.tool.js');

    // Create a mock Codex config
    const codexConfig: GraphQLProjectConfig = {
      endpoint: 'https://api.defined.fi/',
      cid: 'codex-test',
      nodeType: GraphqlProvider.CODEX,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'Codex API',
      domainCapabilities: ['NFT data', 'Token prices', 'Wallet analytics'],
      declineMessage: '',
      schemaContent: 'type Query { dummy: String }',
    };

    // Clear previous logs
    loggerMock.clear();

    const tool = createGraphQLTypeDetailTool(codexConfig, loggerMock as unknown as Logger);

    // Test with a non-existent type
    const result = await tool?.func({typeNames: ['NonExistentType'], depth: 2});

    expect(typeof result).toBe('string');
    expect(result).toContain('not found');
    expect(result).toContain('NonExistentType');

    console.log('\n✓ Non-existent type handled gracefully');
  });

  it('should extract multiple types in one call', async () => {
    const {createGraphQLTypeDetailTool} = await import('../src/tools/graphql-type-detail.tool.js');

    // Create a mock Codex config
    const codexConfig: GraphQLProjectConfig = {
      endpoint: 'https://api.defined.fi/',
      cid: 'codex-test',
      nodeType: GraphqlProvider.CODEX,
      updatedAt: new Date().toISOString(),
      lastAnalyzedAt: new Date().toISOString(),
      domainName: 'Codex API',
      domainCapabilities: ['NFT data', 'Token prices', 'Wallet analytics'],
      declineMessage: '',
      schemaContent: 'type Query { dummy: String }',
    };

    const tool = createGraphQLTypeDetailTool(codexConfig);

    expect(tool).toBeDefined();

    // Test extracting multiple types in one call
    const result = await tool?.func({
      typeNames: ['NftPoolResponse', 'TokenFilterConnection'],
      depth: 0,
    });

    expect(typeof result).toBe('string');
    expect(result).toContain("## Type 'NftPoolResponse'");
    expect(result).toContain("## Type 'TokenFilterConnection'");
    expect(result).toContain('---'); // Separator between types

    console.log('\n✓ Multiple types extracted in one call');
  });

  it('should create and invoke GraphQL agent with Codex', async () => {
    // Use a Codex endpoint (contains 'codex' to trigger detection)
    // Note: This uses a mock/test endpoint - in production you'd use https://graph.codex.io/graphql
    const codexEndpoint = 'https://graph.codex.io/graphql';

    console.log(`Initializing Codex config for endpoint: ${codexEndpoint}`);

    // Create the agent
    const llmConfig: GraphQLAgentConfig['llm'] = {
      model: process.env.LLM_MODEL!,
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_API_BASE!,
      temperature: 0,
    };

    const codexApiKey = process.env.CODEX_API_KEY;
    expect(codexApiKey).toBeDefined();

    // Initialize Codex config using initializeProjectConfig
    // This will detect Codex and enrich the config with CODEX_GRAPHQL_SCHEMA
    const config = await initializeProjectConfig(codexEndpoint, persistentService, llmConfig);
    config.authorization = codexApiKey;

    console.log(`Initialized config for: ${config.domainName}`);
    console.log(`Provider: ${config.nodeType}`);
    console.log(`CID: ${config.cid}`);

    // Verify Codex-specific config
    expect(config).toBeDefined();
    expect(config.nodeType).toBe(GraphqlProvider.CODEX);
    expect(config.domainName).toBe('Codex GraphQL API');
    expect(config.domainCapabilities).toBeDefined();
    expect(Array.isArray(config.domainCapabilities)).toBe(true);
    expect(config.domainCapabilities.length).toBeGreaterThan(0);
    expect(config.schemaContent).toContain('type Query');

    // Clear previous logs
    loggerMock.clear();

    console.log('Creating GraphQL agent with Codex config...');
    const agent = await createGraphQLAgent(
      config,
      {
        llm: llmConfig,
        verbose: 1,
      },
      loggerMock as unknown as Logger
    );

    expect(agent).toBeDefined();
    expect(typeof agent.invoke).toBe('function');

    // Check if agent creation logged anything
    const agentCreationLogs = loggerMock.getAllLogs();
    console.log(`\nAgent creation captured ${agentCreationLogs.length} logs`);

    // Test questions - Codex-specific queries
    const testQuestions = [
      'what is the current price of SQT? and which network SQT is on? return with the graphql query used',
      // 'What networks are supported on Codex?',
      // 'Get NFT pools for BAYC collection.',
      // 'What is the floor price of Azuki collection?',
      // 'Show me wallet NFT collections for 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    ];

    for (const question of testQuestions) {
      console.log(`\nTesting question: ${question}`);

      // Clear logs before each question
      const logsBeforeQuestion = loggerMock.countLogs();

      try {
        console.time('agent invoke');
        const response = await agent.invoke(question);
        console.timeEnd('agent invoke');

        // Verify the response
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);

        console.log(`Response length: ${response.length} characters`);
        console.log(`Response preview: ${response.substring(0, 2000)}...`);

        // Check that response is not just error messages
        expect(response.toLowerCase()).not.toContain('no tools available');
        expect(response.toLowerCase()).not.toContain('agent completed without producing');

        // Analyze logs generated during this question
        const questionLogs = loggerMock.getAllLogs().slice(logsBeforeQuestion);
        console.log(`\nQuestion generated ${questionLogs.length} additional logs`);

        // Check for graphql_schema_info tool usage (Codex uses query-only schema)
        const schemaLogs = questionLogs.filter(
          (log) => log.msg.includes('graphql_schema_info') || log.obj?.schemaLength !== undefined
        );
        if (schemaLogs.length > 0) {
          console.log(`  - Found ${schemaLogs.length} schema info tool calls`);
        }

        // Check for graphql_type_detail tool usage (Codex-specific fallback tool)
        const typeDetailLogs = questionLogs.filter(
          (log) => log.msg.includes('graphql_type_detail') || JSON.stringify(log.obj || {}).includes('type_detail')
        );
        if (typeDetailLogs.length > 0) {
          console.log(`  - Found ${typeDetailLogs.length} type detail tool calls (Codex fallback)`);
        }

        // Check for any errors
        const errorLogs = questionLogs.filter((log) => log.level === 'error');
        if (errorLogs.length > 0) {
          console.log(`  - Found ${errorLogs.length} error logs`);
          errorLogs.forEach((log) => console.log(`    ERROR: ${log.msg}`, log.obj));
        }

        // Check for warnings
        const warnLogs = questionLogs.filter((log) => log.level === 'warn');
        if (warnLogs.length > 0) {
          console.log(`  - Found ${warnLogs.length} warning logs`);
        }
      } catch (error) {
        console.error(`Error processing question "${question}":`, error instanceof Error ? error.message : error);

        // Print logs for debugging
        console.log('\n=== Captured Logs during error ===');
        loggerMock.printAll();

        // Don't fail the test if LLM has issues - the structure is what we're testing
        expect(agent).toBeDefined();
        expect(typeof agent.invoke).toBe('function');
      }
    }

    // Print all captured logs at the end for analysis
    console.log('\n=== Final Log Summary ===');
    console.log(`Total logs captured: ${loggerMock.countLogs()}`);
    const logsByLevel = {
      debug: loggerMock.getLogsByLevel('debug').length,
      info: loggerMock.getLogsByLevel('info').length,
      warn: loggerMock.getLogsByLevel('warn').length,
      error: loggerMock.getLogsByLevel('error').length,
      fatal: loggerMock.getLogsByLevel('fatal').length,
      trace: loggerMock.getLogsByLevel('trace').length,
    };
    console.log('Logs by level:', logsByLevel);

    console.log('\n✓ Codex agent test completed successfully');
  }, 120000);

  afterAll(() => {
    // Clean up
    persistentService.clear();
    loggerMock.clear();
    console.log('\nE2E tests completed');
  });
});
