// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {readFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const referencesDir = join(__dirname, 'references');

/**
 * Read a reference file content
 */
function readReference(filename: string): string {
  try {
    return readFileSync(join(referencesDir, filename), 'utf-8');
  } catch {
    return `// File ${filename} not found`;
  }
}

function getWorkflowsDoc(): string {
  return readReference('workflows.md');
}

/**
 * Get available endpoint categories
 */
export function getEndpointCategories(): string {
  return `## Available Endpoint Categories

Call this tool with a specific category to get detailed documentation:

| Category | Description |
|----------|-------------|
| \`workflows\` | Common usage patterns and best practices |
| \`balances\` | Token balances, transfers, holders, portfolio |
| \`transactions\` | Transaction history, blocks, summaries |
| \`nft-security-crosschain\` | NFTs, approvals, multi-chain activity |
| \`utility\` | Pricing, gas, events, chains status |

Example: Call with \`category: "balances"\` to get balance endpoint docs.`;
}

/**
 * Chain names quick reference
 */
export function getChainNamesRef(): string {
  return `## Chain Names (CASE-SENSITIVE)

| Common Name | Chain Name | Chain ID |
|-------------|------------|----------|
| Ethereum | eth-mainnet | 1 |
| Polygon | matic-mainnet | 137 |
| Base | base-mainnet | 8453 |
| BSC | bsc-mainnet | 56 |
| Arbitrum | arbitrum-mainnet | 42161 |
| Optimism | optimism-mainnet | 10 |
| Avalanche | avalanche-mainnet | 43114 |
| Bitcoin | btc-mainnet | 20090103 |
| Solana | solana-mainnet | 1399811149 |
| Fantom | fantom-mainnet | 250 |
| zkSync Era | zksync-mainnet | 324 |
| Linea | linea-mainnet | 59144 |
| Scroll | scroll-mainnet | 534352 |
| Mantle | mantle-mainnet | 5000 |

## Common Query Parameters

| Parameter | Description |
|-----------|-------------|
| quote-currency | USD, CAD, EUR, SGD, INR, JPY, VND, CNY, KRW, RUB, TRY, NGN, ARS, AUD, CHF, GBP |
| page-size | Number of items (default 100) |
| page-number | 0-indexed page number |
| no-spam | true to filter spam tokens |

## Important Notes

- **Balance values**: Raw strings - divide by 10^contract_decimals for human-readable
- **ENS names**: Supported for eth-mainnet (e.g., vitalik.eth)
- **Page numbers**: 0-indexed (first page is 0)`;
}

/**
 * Get category-specific documentation
 */
export function getCategoryDoc(category: string): string {
  const categoryMap: Record<string, {file: string; title: string}> = {
    workflows: {file: 'workflows.md', title: 'Common Workflows'},
    balances: {file: 'endpoints-balances.md', title: 'Balance Endpoints'},
    transactions: {file: 'endpoints-transactions.md', title: 'Transaction Endpoints'},
    'nft-security-crosschain': {
      file: 'endpoints-nft-security-crosschain.md',
      title: 'NFT, Security & Cross-Chain Endpoints',
    },
    utility: {file: 'endpoints-utility.md', title: 'Utility Endpoints'},
  };

  const mapping = categoryMap[category.toLowerCase()];
  if (!mapping) {
    return `Unknown category: ${category}. Available: ${Object.keys(categoryMap).join(', ')}`;
  }

  const workflows = getWorkflowsDoc();
  const content = readReference(mapping.file);

  if (mapping.file === 'workflows.md') {
    return `# ${mapping.title}

${content}`;
  }

  return `# Shared Workflow Rules

Keep this workflow reference in context while using the category-specific endpoint docs below.

${workflows}

---

# ${mapping.title}

${content}`;
}

/**
 * Get initial API info (workflows + categories overview)
 */
export function getInitialApiInfo(): string {
  const workflows = getWorkflowsDoc();
  const categories = getEndpointCategories();
  const chains = getChainNamesRef();

  return `# Covalent (GoldRush) Blockchain Data API

${chains}

---

${categories}

---

# Common Workflows

${workflows}

---

💡 TIP: Call this tool again with a specific category (e.g., \`category: "balances"\`) to get detailed endpoint documentation for that category.`;
}

/**
 * Legacy function for backwards compatibility - returns initial info only
 */
export function getCovalentApiSpec(): string {
  return getInitialApiInfo();
}
