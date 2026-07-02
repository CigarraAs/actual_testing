import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { secretsService } from '#services/secrets-service';

vi.mock('#services/secrets-service', () => ({
  SecretName: {
    pluggyai_clientId: 'pluggyai_clientId',
    pluggyai_clientSecret: 'pluggyai_clientSecret',
    pluggyai_itemIds: 'pluggyai_itemIds',
  },
  secretsService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

const {
  mockFetchAccounts,
  mockFetchAccount,
  mockFetchTransactions,
  MockPluggyClient,
} = vi.hoisted(() => {
  const fetchAccounts = vi.fn();
  const fetchAccount = vi.fn();
  const fetchTransactions = vi.fn();

  function MockPluggyClientCtor(this: Record<string, unknown>) {
    this.fetchAccounts = fetchAccounts;
    this.fetchAccount = fetchAccount;
    this.fetchTransactions = fetchTransactions;
  }

  return {
    mockFetchAccounts: fetchAccounts,
    mockFetchAccount: fetchAccount,
    mockFetchTransactions: fetchTransactions,
    MockPluggyClient: MockPluggyClientCtor,
  };
});

vi.mock('pluggy-sdk', () => ({
  PluggyClient: MockPluggyClient,
}));

import {
  mockPluggyAccount,
  mockPluggyPaginatedPage1,
  mockPluggyPaginatedPage2,
  mockPluggyPaginatedPage3,
  mockPluggyPendingTransaction,
  mockPluggySandboxAccount,
  mockPluggyTransaction,
  mockPluggyCreditTransaction,
  mockPluggyTransactionsResponse,
} from './fixtures';

import { SecretName as SecretNames } from '#services/secrets-service';

function setSecrets({
  clientId = 'test-client-id',
  clientSecret = 'test-client-secret',
  itemIds = 'item-001,item-002',
}: {
  clientId?: string | null;
  clientSecret?: string | null;
  itemIds?: string | null;
} = {}) {
  vi.mocked(secretsService.get).mockImplementation((name: string) => {
    if (name === SecretNames.pluggyai_clientId) return clientId;
    if (name === SecretNames.pluggyai_clientSecret) return clientSecret;
    if (name === SecretNames.pluggyai_itemIds) return itemIds;
    return null;
  });
}

describe('pluggyaiService', () => {
  let pluggyaiService: typeof import('#app-pluggyai/pluggyai-service').pluggyaiService;

  beforeEach(async () => {
    vi.resetModules();
    setSecrets();
    mockFetchAccounts.mockClear();
    mockFetchAccount.mockClear();
    mockFetchTransactions.mockClear();
    vi.mocked(secretsService.get).mockClear();

    const mod = await import('#app-pluggyai/pluggyai-service');
    pluggyaiService = mod.pluggyaiService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('#isConfigured', () => {
    it('returns true when all credentials are set', () => {
      expect(pluggyaiService.isConfigured()).toBe(true);
    });

    it('returns false when clientId is missing', () => {
      setSecrets({ clientId: null });

      expect(pluggyaiService.isConfigured()).toBe(false);
    });

    it('returns false when clientSecret is missing', () => {
      setSecrets({ clientSecret: null });

      expect(pluggyaiService.isConfigured()).toBe(false);
    });

    it('returns false when itemIds is missing', () => {
      setSecrets({ itemIds: null });

      expect(pluggyaiService.isConfigured()).toBe(false);
    });
  });

  describe('#getAccountsByItemId', () => {
    it('fetches accounts for a given item ID', async () => {
      mockFetchAccounts.mockResolvedValueOnce({
        results: [mockPluggyAccount],
        total: 1,
      });

      const result = await pluggyaiService.getAccountsByItemId('item-001');

      expect(result.results).toEqual([mockPluggyAccount]);
      expect(result.total).toBe(1);
      expect(result.hasError).toBe(false);
      expect(result.errors).toEqual({});
      expect(mockFetchAccounts).toHaveBeenCalledWith('item-001');
    });

    it('throws error on API failure', async () => {
      mockFetchAccounts.mockRejectedValueOnce(new Error('API error'));

      await expect(
        pluggyaiService.getAccountsByItemId('item-001'),
      ).rejects.toThrow('API error');
    });
  });

  describe('#getAccountById', () => {
    it('fetches a single account by ID', async () => {
      mockFetchAccount.mockResolvedValueOnce(mockPluggyAccount);

      const result = await pluggyaiService.getAccountById('acc-pluggy-001');

      expect(result).toMatchObject({
        ...mockPluggyAccount,
        hasError: false,
        errors: {},
      });
      expect(mockFetchAccount).toHaveBeenCalledWith('acc-pluggy-001');
    });

    it('throws error on API failure', async () => {
      mockFetchAccount.mockRejectedValueOnce(new Error('Not found'));

      await expect(
        pluggyaiService.getAccountById('nonexistent'),
      ).rejects.toThrow('Not found');
    });
  });

  describe('#getTransactionsByAccountId', () => {
    it('fetches transactions for an account', async () => {
      mockFetchAccount.mockResolvedValueOnce(mockPluggyAccount);
      mockFetchTransactions.mockResolvedValueOnce(mockPluggyTransactionsResponse);

      const result = await pluggyaiService.getTransactionsByAccountId(
        'acc-pluggy-001',
        '2024-01-01',
        500,
        1,
      );

      expect(result.results).toEqual(mockPluggyTransactionsResponse.results);
      expect(result.hasError).toBe(false);
      expect(result.errors).toEqual({});
      expect(mockFetchTransactions).toHaveBeenCalledWith('acc-pluggy-001', {
        from: '2024-01-01',
        pageSize: 500,
        page: 1,
      });
    });

    it('overrides startDate for sandbox accounts (John Doe)', async () => {
      mockFetchAccount.mockResolvedValueOnce(mockPluggySandboxAccount);
      mockFetchTransactions.mockResolvedValueOnce({
        results: [],
        total: 0,
        totalPages: 0,
      });

      await pluggyaiService.getTransactionsByAccountId(
        'acc-pluggy-sandbox',
        '2025-01-01',
        500,
        1,
      );

      expect(mockFetchTransactions).toHaveBeenCalledWith(
        'acc-pluggy-sandbox',
        {
          from: '2000-01-01',
          pageSize: 500,
          page: 1,
        },
      );
    });

    it('marks results as sandbox for sandbox accounts', async () => {
      mockFetchAccount.mockResolvedValueOnce(mockPluggySandboxAccount);
      mockFetchTransactions.mockResolvedValueOnce({
        results: [{ id: 'sandbox-tx', amount: 100 }],
        total: 1,
        totalPages: 1,
      });

      const result = await pluggyaiService.getTransactionsByAccountId(
        'acc-pluggy-sandbox',
        '2025-01-01',
        500,
        1,
      );

      expect(result.results[0]).toHaveProperty('sandbox', true);
    });

    it('throws error on API failure', async () => {
      mockFetchAccount.mockResolvedValueOnce(mockPluggyAccount);
      mockFetchTransactions.mockRejectedValueOnce(new Error('API error'));

      await expect(
        pluggyaiService.getTransactionsByAccountId(
          'acc-pluggy-001',
          '2024-01-01',
          500,
          1,
        ),
      ).rejects.toThrow('API error');
    });
  });

  describe('#getTransactions', () => {
    it('fetches all pages of transactions', async () => {
      mockFetchAccount
        .mockResolvedValueOnce(mockPluggyAccount)
        .mockResolvedValueOnce(mockPluggyAccount)
        .mockResolvedValueOnce(mockPluggyAccount);

      mockFetchTransactions
        .mockResolvedValueOnce(mockPluggyPaginatedPage1)
        .mockResolvedValueOnce(mockPluggyPaginatedPage2)
        .mockResolvedValueOnce(mockPluggyPaginatedPage3);

      const result = await pluggyaiService.getTransactions(
        'acc-pluggy-001',
        '2024-01-01',
      );

      expect(result).toHaveLength(3);
      expect(result).toMatchObject([
        expect.objectContaining({ id: mockPluggyTransaction.id }),
        expect.objectContaining({ id: mockPluggyCreditTransaction.id }),
        expect.objectContaining({ id: mockPluggyPendingTransaction.id }),
      ]);
      expect(mockFetchTransactions).toHaveBeenCalledTimes(3);
    });

    it('handles single page response', async () => {
      mockFetchAccount.mockResolvedValueOnce(mockPluggyAccount);
      mockFetchTransactions.mockResolvedValueOnce({
        results: [mockPluggyTransaction],
        total: 1,
        totalPages: 1,
        page: 1,
      });

      const result = await pluggyaiService.getTransactions(
        'acc-pluggy-001',
        '2024-01-01',
      );

      expect(result).toHaveLength(1);
    });
  });
});
