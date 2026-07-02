/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as fs from '#platform/server/fs';
import * as sqlite from '#platform/server/sqlite';
import * as cloudStorage from '#server/cloud-storage';
import { handlers } from '#server/main';
import { waitOnSpreadsheet } from '#server/sheet';

import { importActual } from './actual';

vi.mock('#platform/server/fs', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  getBudgetDir: vi.fn((id: string) => `/budgets/${id}`),
}));

vi.mock('#platform/server/sqlite', () => ({
  openDatabase: vi.fn(),
  execQuery: vi.fn(),
  closeDatabase: vi.fn(),
}));

vi.mock('#server/cloud-storage', () => ({
  importBuffer: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('#server/main', () => ({
  handlers: {
    'close-budget': vi.fn(),
    'load-budget': vi.fn(),
    'get-budget-bounds': vi.fn(),
  },
}));

vi.mock('#server/sheet', () => ({
  waitOnSpreadsheet: vi.fn(),
}));

describe('importActual', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cloudStorage.upload).mockResolvedValue(undefined);
    vi.mocked(waitOnSpreadsheet).mockResolvedValue(undefined);
  });

  it('imports actual budget successfully', async () => {
    // Arrange
    const buffer = Buffer.from('dummy actual budget database content');
    const mockId = 'actual-budget-123';
    vi.mocked(cloudStorage.importBuffer).mockResolvedValue({ id: mockId });
    vi.mocked(sqlite.openDatabase).mockResolvedValue({ db: 'sqlite' } as any);

    // Act
    await importActual('my-budget.actual', buffer);

    // Assert
    expect(handlers['close-budget']).toHaveBeenCalledTimes(1);
    expect(cloudStorage.importBuffer).toHaveBeenCalledWith(
      { cloudFileId: null, groupId: null },
      buffer,
    );
    expect(fs.getBudgetDir).toHaveBeenCalledWith(mockId);
    expect(sqlite.openDatabase).toHaveBeenCalledWith(
      `/budgets/${mockId}/db.sqlite`,
    );
    expect(sqlite.execQuery).toHaveBeenCalledWith(
      { db: 'sqlite' },
      expect.stringContaining('DELETE FROM kvcache;'),
    );
    expect(sqlite.closeDatabase).toHaveBeenCalledWith({ db: 'sqlite' });
    expect(handlers['load-budget']).toHaveBeenCalledWith({ id: mockId });
    expect(handlers['get-budget-bounds']).toHaveBeenCalledTimes(1);
    expect(waitOnSpreadsheet).toHaveBeenCalledTimes(1);
    expect(cloudStorage.upload).toHaveBeenCalledTimes(1);
  });

  it('returns file download error when importBuffer throws FileDownloadError', async () => {
    // Arrange
    const buffer = Buffer.from('dummy');
    const downloadError = {
      type: 'FileDownloadError',
      reason: 'Network failed',
    };
    vi.mocked(cloudStorage.importBuffer).mockRejectedValue(downloadError);

    // Act
    const result = await importActual('my-budget.actual', buffer);

    // Assert
    expect(handlers['close-budget']).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: 'Network failed' });
    expect(sqlite.openDatabase).not.toHaveBeenCalled();
    expect(handlers['load-budget']).not.toHaveBeenCalled();
  });

  it('re-throws other errors when importBuffer throws unexpected error', async () => {
    // Arrange
    const buffer = Buffer.from('dummy');
    const unexpectedError = new Error('Out of memory');
    vi.mocked(cloudStorage.importBuffer).mockRejectedValue(unexpectedError);

    // Act & Assert
    await expect(importActual('my-budget.actual', buffer)).rejects.toThrow(
      'Out of memory',
    );
    expect(sqlite.openDatabase).not.toHaveBeenCalled();
  });

  it('handles cloudStorage.upload failure gracefully without propagating error', async () => {
    // Arrange
    const buffer = Buffer.from('dummy');
    const mockId = 'actual-budget-upload-fail';
    vi.mocked(cloudStorage.importBuffer).mockResolvedValue({ id: mockId });
    vi.mocked(cloudStorage.upload).mockRejectedValue(
      new Error('Cloud sync failed'),
    );

    // Act & Assert
    await expect(
      importActual('my-budget.actual', buffer),
    ).resolves.not.toThrow();
    expect(cloudStorage.upload).toHaveBeenCalledTimes(1);
  });
});
