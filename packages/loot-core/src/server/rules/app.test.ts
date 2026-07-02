/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as sync from '#server/sync';
import * as rules from '#server/transactions/transaction-rules';

import { app } from './app';

vi.mock('#server/transactions/transaction-rules', () => ({
  insertRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  applyActions: vi.fn(),
  updatePayeeRenameRule: vi.fn(),
  getRules: vi.fn(),
  runRules: vi.fn(),
}));

vi.mock('#server/sync', () => ({
  batchMessages: vi.fn(cb => cb()),
}));

describe('Rules App Layer', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    // Initialize the in-memory SQLite database so mutators can run without context errors
    await global.emptyDatabase()();
  });

  describe('rule-validate', () => {
    const handler = app.handlers['rule-validate'];

    it('returns null error for a completely valid rule', async () => {
      // Arrange
      const rule = {
        conditions: [{ op: 'is', field: 'date', value: '2026-06-01' }],
        actions: [{ op: 'set', field: 'notes', value: 'hello' }],
      };

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(result).toEqual({ error: null });
    });

    it('returns validation errors when Condition validation fails with RuleError', async () => {
      // Arrange
      const rule = {
        conditions: [{ op: 'isapprox', field: 'date', value: 'invalid-date' }],
        actions: [{ op: 'set', field: 'notes', value: 'hello' }],
      };

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(result.error).toEqual({
        conditionErrors: ['date-format'],
        actionErrors: null,
      });
    });

    it('returns validation errors when Action validation fails with RuleError', async () => {
      // Arrange
      const rule = {
        conditions: [{ op: 'is', field: 'date', value: '2026-06-01' }],
        actions: [{ op: 'set', field: 'account', value: null }],
      };

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(result.error).toEqual({
        conditionErrors: null,
        actionErrors: ['no-null'],
      });
    });

    it('propagates unexpected errors thrown during Condition validation', async () => {
      // Arrange
      const rule = {
        conditions: [null],
        actions: [{ op: 'set', field: 'notes', value: 'hello' }],
      };

      // Act & Assert
      await expect(handler(rule as any)).rejects.toThrow();
    });

    it('propagates unexpected errors thrown during Action validation', async () => {
      // Arrange
      const rule = {
        conditions: [{ op: 'is', field: 'date', value: '2026-06-01' }],
        actions: [null],
      };

      // Act & Assert
      await expect(handler(rule as any)).rejects.toThrow();
    });

    it('correctly maps and constructs different Action types during validation', async () => {
      // Arrange
      const rule = {
        conditions: [],
        actions: [
          { op: 'delete-transaction' },
          { op: 'set-split-amount', value: 100, options: { splitIndex: 1 } },
          { op: 'link-schedule', value: 'sched-1' },
          { op: 'prepend-notes', value: 'prefix' },
          { op: 'append-notes', value: 'suffix' },
          {
            op: 'set',
            field: 'payee',
            value: 'payee-1',
            options: { splitIndex: 2 },
          },
        ],
      };

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(result).toEqual({ error: null });
    });
  });

  describe('rule-add', () => {
    const handler = app.handlers['rule-add'];

    it('adds rule successfully if valid', async () => {
      // Arrange
      const rule = {
        conditions: [{ op: 'is', field: 'date', value: '2026-06-01' }],
        actions: [{ op: 'set', field: 'notes', value: 'hello' }],
      };
      vi.mocked(rules.insertRule).mockResolvedValue('inserted-rule-id');

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(rules.insertRule).toHaveBeenCalledWith(rule);
      expect(result).toEqual({ id: 'inserted-rule-id', ...rule });
    });

    it('returns validation error and does not insert if invalid', async () => {
      // Arrange
      const rule = {
        conditions: [{ op: 'isapprox', field: 'date', value: 'invalid-date' }],
        actions: [],
      };

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(rules.insertRule).not.toHaveBeenCalled();
      expect(result).toEqual({
        error: {
          conditionErrors: ['date-format'],
          actionErrors: null,
        },
      });
    });
  });

  describe('rule-update', () => {
    const handler = app.handlers['rule-update'];

    it('updates rule successfully if valid', async () => {
      // Arrange
      const rule = {
        id: 'rule-id',
        conditions: [{ op: 'is', field: 'date', value: '2026-06-01' }],
        actions: [{ op: 'set', field: 'notes', value: 'hello' }],
      };
      vi.mocked(rules.updateRule).mockResolvedValue(undefined);

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(rules.updateRule).toHaveBeenCalledWith(rule);
      expect(result).toEqual(rule);
    });

    it('returns validation error and does not update if invalid', async () => {
      // Arrange
      const rule = {
        id: 'rule-id',
        conditions: [],
        actions: [{ op: 'set', field: 'account', value: null }],
      };

      // Act
      const result = await handler(rule as any);

      // Assert
      expect(rules.updateRule).not.toHaveBeenCalled();
      expect(result).toEqual({
        error: {
          conditionErrors: null,
          actionErrors: ['no-null'],
        },
      });
    });
  });

  describe('rule-delete', () => {
    const handler = app.handlers['rule-delete'];

    it('deletes rule using transaction rules layer', async () => {
      // Arrange
      vi.mocked(rules.deleteRule).mockResolvedValue(true);

      // Act
      const result = await handler('rule-id-123');

      // Assert
      expect(rules.deleteRule).toHaveBeenCalledWith('rule-id-123');
      expect(result).toBe(true);
    });
  });

  describe('rule-delete-all', () => {
    const handler = app.handlers['rule-delete-all'];

    it('returns someDeletionsFailed: false if all deletions succeed', async () => {
      // Arrange
      vi.mocked(rules.deleteRule).mockResolvedValue(true);

      // Act
      const result = await handler(['id1', 'id2']);

      // Assert
      expect(sync.batchMessages).toHaveBeenCalledTimes(1);
      expect(rules.deleteRule).toHaveBeenCalledWith('id1');
      expect(rules.deleteRule).toHaveBeenCalledWith('id2');
      expect(result).toEqual({ someDeletionsFailed: false });
    });

    it('returns someDeletionsFailed: true if one or more deletions return false', async () => {
      // Arrange
      vi.mocked(rules.deleteRule).mockImplementation(async id => {
        return id !== 'id2';
      });

      // Act
      const result = await handler(['id1', 'id2', 'id3']);

      // Assert
      expect(result).toEqual({ someDeletionsFailed: true });
    });
  });

  describe('rule-apply-actions', () => {
    const handler = app.handlers['rule-apply-actions'];

    it('applies rules actions to transactions', async () => {
      // Arrange
      const transactions = [{ id: 'tx-1' } as any];
      const actions = [{ op: 'set', field: 'notes', value: 'test' } as any];
      const mockResponse = {
        added: [],
        updated: ['tx-1'],
        errors: [],
        deleted: [],
      } as any;
      vi.mocked(rules.applyActions).mockResolvedValue(mockResponse);

      // Act
      const result = await handler({ transactions, actions });

      // Assert
      expect(rules.applyActions).toHaveBeenCalledWith(transactions, actions);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('rule-add-payee-rename', () => {
    const handler = app.handlers['rule-add-payee-rename'];

    it('creates rename rule', async () => {
      // Arrange
      vi.mocked(rules.updatePayeeRenameRule).mockResolvedValue(
        'rename-rule-id',
      );

      // Act
      const result = await handler({
        fromNames: ['payee-old'],
        to: 'payee-new',
      });

      // Assert
      expect(rules.updatePayeeRenameRule).toHaveBeenCalledWith(
        ['payee-old'],
        'payee-new',
      );
      expect(result).toBe('rename-rule-id');
    });
  });

  describe('rule-get', () => {
    const handler = app.handlers['rule-get'];

    it('returns serialized rule if found', async () => {
      // Arrange
      const mockRule = {
        id: 'rule-123',
        conditions: [],
        serialize: vi.fn(() => ({ id: 'rule-123', serialized: true })),
      };
      vi.mocked(rules.getRules).mockReturnValue([mockRule] as any);

      // Act
      const result = await handler({ id: 'rule-123' });

      // Assert
      expect(mockRule.serialize).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'rule-123', serialized: true });
    });

    it('returns null if rule is not found', async () => {
      // Arrange
      vi.mocked(rules.getRules).mockReturnValue([] as any);

      // Act
      const result = await handler({ id: 'non-existent' });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('rules-get', () => {
    const handler = app.handlers['rules-get'];

    it('returns ranked and serialized rules list', async () => {
      // Arrange
      const mockRules = [
        {
          id: 'rule-1',
          conditions: [],
          serialize: vi.fn(() => ({ id: 'rule-1', serialized: true })),
        },
      ];
      vi.mocked(rules.getRules).mockReturnValue(mockRules as any);

      // Act
      const result = await handler();

      // Assert
      expect(mockRules[0].serialize).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 'rule-1', serialized: true }]);
    });
  });

  describe('rules-run', () => {
    const handler = app.handlers['rules-run'];

    it('runs rule engine for single transaction', async () => {
      // Arrange
      const tx = { id: 'tx-1', amount: 100 } as any;
      const expectedTx = { id: 'tx-1', amount: 100, payee: 'mapped' } as any;
      vi.mocked(rules.runRules).mockResolvedValue(expectedTx);

      // Act
      const result = await handler({ transaction: tx });

      // Assert
      expect(rules.runRules).toHaveBeenCalledWith(tx);
      expect(result).toEqual(expectedTx);
    });
  });
});
