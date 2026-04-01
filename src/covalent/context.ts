// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

export interface CachedResult {
  id: string;
  data: unknown;
  size: number;
  createdAt: Date;
  sourcePath: string;
}

/**
 * Per-session context for Covalent agent tools
 * Passed to all tools to share state within a session
 */
export class CovalentContext {
  private latestResult: CachedResult | null = null;

  setResult(data: unknown, sourcePath: string): CachedResult {
    const id = this.generateId();
    const content = JSON.stringify(data);
    const size = Buffer.byteLength(content, 'utf-8');

    const result: CachedResult = {
      id,
      data,
      size,
      createdAt: new Date(),
      sourcePath,
    };

    this.latestResult = result;
    return result;
  }

  getResult(): CachedResult | null {
    return this.latestResult;
  }

  hasResult(): boolean {
    return this.latestResult !== null;
  }

  private generateId(): string {
    return `result_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
