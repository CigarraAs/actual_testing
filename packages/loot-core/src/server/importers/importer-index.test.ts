/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '#platform/server/log';
import { handlers } from '#server/main';

import { importActual } from './actual';
import * as YNAB4 from './ynab4';
import * as YNAB5 from './ynab5';

import { handleBudgetImport } from './index';

vi.mock('#platform/server/log', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('#server/main', () => ({
  handlers: {
    'api/start-import': vi.fn(),
    'api/abort-import': vi.fn(),
    'api/finish-import': vi.fn(),
  },
}));

vi.mock('./actual', () => ({
  importActual: vi.fn(),
}));

vi.mock('./ynab4', () => ({
  parseFile: vi.fn(),
  getBudgetName: vi.fn(),
  doImport: vi.fn(),
}));

vi.mock('./ynab5', () => ({
  parseFile: vi.fn(),
  getBudgetName: vi.fn(),
  doImport: vi.fn(),
}));

describe('handleBudgetImport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('delegates directly to importActual for "actual" budget type', async () => {
    // Arrange
    const filepath = 'my-budget.actual';
    const buffer = Buffer.from('data');
    vi.mocked(importActual).mockResolvedValue(undefined as any);

    // Act
    await handleBudgetImport('actual', filepath, buffer);

    // Assert
    expect(importActual).toHaveBeenCalledWith(filepath, buffer);
    expect(handlers['api/start-import']).not.toHaveBeenCalled();
  });

  it('handles successful import for ynab4/ynab5', async () => {
    // Arrange
    const filepath = 'budget.zip';
    const buffer = Buffer.from('zipdata');
    const mockData = { some: 'ynab4-data' };

    vi.mocked(YNAB4.parseFile).mockReturnValue(mockData as any);
    vi.mocked(YNAB4.getBudgetName).mockReturnValue('My YNAB4 Budget');
    vi.mocked(handlers['api/start-import']).mockResolvedValue(undefined as any);
    vi.mocked(YNAB4.doImport).mockResolvedValue(undefined as any);
    vi.mocked(handlers['api/finish-import']).mockResolvedValue(
      undefined as any,
    );

    // Act
    const result = await handleBudgetImport('ynab4', filepath, buffer);

    // Assert
    expect(YNAB4.parseFile).toHaveBeenCalledWith(buffer);
    expect(YNAB4.getBudgetName).toHaveBeenCalledWith(filepath, mockData);
    expect(handlers['api/start-import']).toHaveBeenCalledWith({
      budgetName: 'My YNAB4 Budget',
    });
    expect(YNAB4.doImport).toHaveBeenCalledWith(mockData);
    expect(handlers['api/finish-import']).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it('returns error when budget name cannot be resolved', async () => {
    // Arrange
    const filepath = 'invalid.zip';
    const buffer = Buffer.from('invalid');
    vi.mocked(YNAB5.parseFile).mockReturnValue({} as any);
    vi.mocked(YNAB5.getBudgetName).mockReturnValue(null as any);

    // Act
    const result = await handleBudgetImport('ynab5', filepath, buffer);

    // Assert
    expect(result).toEqual({ error: 'not-ynab5' });
    expect(handlers['api/start-import']).not.toHaveBeenCalled();
  });

  it('returns error when parseFile throws an exception', async () => {
    // Arrange
    const filepath = 'corrupted.zip';
    const buffer = Buffer.from('corrupted');
    vi.mocked(YNAB4.parseFile).mockImplementation(() => {
      throw new Error('Parse error');
    });

    // Act
    const result = await handleBudgetImport('ynab4', filepath, buffer);

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      'failed to parse file',
      expect.any(Error),
    );
    expect(result).toEqual({ error: 'not-ynab4' });
    expect(handlers['api/start-import']).not.toHaveBeenCalled();
  });

  it('aborts import and returns unknown error when api/start-import throws', async () => {
    // Arrange
    const filepath = 'budget.zip';
    const buffer = Buffer.from('data');
    vi.mocked(YNAB4.parseFile).mockReturnValue({} as any);
    vi.mocked(YNAB4.getBudgetName).mockReturnValue('Budget');
    vi.mocked(handlers['api/start-import']).mockRejectedValue(
      new Error('DB locked'),
    );

    // Act
    const result = await handleBudgetImport('ynab4', filepath, buffer);

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      'failed to start import',
      expect.any(Error),
    );
    expect(handlers['api/abort-import']).not.toHaveBeenCalled(); // since start-import failed, it throws outside the inner try
    expect(result).toEqual({ error: 'unknown' });
  });

  it('aborts import and returns unknown error when doImport throws', async () => {
    // Arrange
    const filepath = 'budget.zip';
    const buffer = Buffer.from('data');
    vi.mocked(YNAB4.parseFile).mockReturnValue({} as any);
    vi.mocked(YNAB4.getBudgetName).mockReturnValue('Budget');
    vi.mocked(handlers['api/start-import']).mockResolvedValue(undefined as any);
    vi.mocked(YNAB4.doImport).mockRejectedValue(
      new Error('Import execution failed'),
    );
    vi.mocked(handlers['api/abort-import']).mockResolvedValue(undefined as any);

    // Act
    const result = await handleBudgetImport('ynab4', filepath, buffer);

    // Assert
    expect(handlers['api/abort-import']).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'failed to run import',
      expect.any(Error),
    );
    expect(result).toEqual({ error: 'unknown' });
  });
});
