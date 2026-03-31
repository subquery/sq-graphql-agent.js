// Copyright 2020-2026 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: PolyForm-Shield-1.0.0

import {writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, rmSync} from 'fs';
import {tmpdir} from 'os';
import {join} from 'path';
import type {Logger} from 'pino';

export interface SavedResult {
  id: string;
  data: unknown;
  size: number;
  createdAt: Date;
  sourcePath: string;
}

/**
 * Singleton manager for temporary files holding large API responses
 * All tools share the same instance to access saved results
 */
export class ResultFileManager {
  private static instance: ResultFileManager | null = null;
  private readonly tempDir: string;
  private latestResult: SavedResult | null = null;
  private logger: Logger | undefined;

  private constructor(logger?: Logger) {
    this.logger = logger;
    // Create temp directory for this session
    this.tempDir = join(tmpdir(), 'covalent-agent', process.pid.toString());
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, {recursive: true});
    }
    this.logger?.debug({tempDir: this.tempDir}, 'ResultFileManager initialized');
  }

  /**
   * Get the singleton instance
   */
  static getInstance(logger?: Logger): ResultFileManager {
    if (!ResultFileManager.instance) {
      ResultFileManager.instance = new ResultFileManager(logger);
    }
    return ResultFileManager.instance;
  }

  /**
   * Reset the singleton (useful for testing)
   */
  static resetInstance(): void {
    if (ResultFileManager.instance) {
      ResultFileManager.instance.cleanup();
      ResultFileManager.instance = null;
    }
  }

  /**
   * Save result to memory and return metadata
   */
  saveResult(data: unknown, sourcePath: string): SavedResult {
    const id = this.generateId();
    const content = JSON.stringify(data, null, 2);

    // Save to disk for potential recovery
    const filePath = join(this.tempDir, `${id}.json`);
    writeFileSync(filePath, content, 'utf-8');

    const result: SavedResult = {
      id,
      data,
      size: Buffer.byteLength(content, 'utf-8'),
      createdAt: new Date(),
      sourcePath,
    };

    this.latestResult = result;
    this.logger?.debug({id, size: result.size, filePath}, 'Result saved');

    return result;
  }

  /**
   * Get the most recent saved result
   */
  getLatestResult(): SavedResult | null {
    return this.latestResult;
  }

  /**
   * Check if there's a saved result available
   */
  hasResult(): boolean {
    return this.latestResult !== null;
  }

  /**
   * Load a specific result by ID from disk
   */
  loadResult(id: string): SavedResult | null {
    const filePath = join(this.tempDir, `${id}.json`);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return {
        id,
        data,
        size: Buffer.byteLength(content, 'utf-8'),
        createdAt: new Date(),
        sourcePath: '',
      };
    } catch (error) {
      this.logger?.error({id, error}, 'Failed to load result');
      return null;
    }
  }

  /**
   * Delete a result file
   */
  deleteResult(id: string): boolean {
    const filePath = join(this.tempDir, `${id}.json`);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
        this.logger?.debug({id}, 'Result deleted');
        return true;
      } catch (error) {
        this.logger?.error({id, error}, 'Failed to delete result');
        return false;
      }
    }
    return false;
  }

  /**
   * Generate a unique ID for a result
   */
  private generateId(): string {
    return `result_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Clean up all temp files
   */
  cleanup(): void {
    if (existsSync(this.tempDir)) {
      try {
        rmSync(this.tempDir, {recursive: true, force: true});
        this.logger?.debug({tempDir: this.tempDir}, 'Temp directory cleaned up');
      } catch (error) {
        this.logger?.error({error}, 'Failed to clean up temp directory');
      }
    }
  }
}
