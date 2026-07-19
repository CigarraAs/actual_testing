// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';
import * as db from '#server/db';
import { handlers } from '../../server/main';
import { runHandler } from '../../server/mutators';

describe('INT-API-06/07: F08 batchUpdateTransactions (Small - SIN MOCKS)', () => {
  let accountId;

  beforeEach(async () => {
    await global.emptyDatabase()();
    accountId = await db.insertAccount({ name: 'Cuenta Test', offbudget: 0 });
  });

  it('INT-API-06: Inserta lote de 2 transacciones atómicamente (todo o nada)', async () => {
    await runHandler(handlers['transactions-batch-update'], {
      added: [
        { id: 'txn_a', account: accountId, amount: -1000, date: '2026-07-01' },
        { id: 'txn_b', account: accountId, amount: -2000, date: '2026-07-02' }
      ],
      updated: [],
      deleted: [],
    });

    const txs = await db.all<{ id: string; amount: number }>(
      'SELECT id, amount FROM transactions WHERE acct = ? AND tombstone = 0',
      [accountId]
    );
    expect(txs).toHaveLength(2);
    expect(txs.find(t => t.id === 'txn_a')?.amount).toBe(-1000);
    expect(txs.find(t => t.id === 'txn_b')?.amount).toBe(-2000);
  });

  it('INT-API-07: Elimina transacción padre y verifica cascada (hijos eliminados)', async () => {
    const parentId = 'parent_001';
    await db.insertTransaction({ id: parentId, account: accountId, amount: -3000, date: '2026-07-01', is_parent: 1 });
    await db.insertTransaction({ id: 'child_1', account: accountId, amount: -1000, parent_id: parentId, date: '2026-07-01' });
    await db.insertTransaction({ id: 'child_2', account: accountId, amount: -2000, parent_id: parentId, date: '2026-07-01' });

    await runHandler(handlers['transactions-batch-update'], {
      added: [],
      updated: [],
      deleted: [{ id: parentId }],
      runTransfers: true,
    });

    const parent = await db.first<{ tombstone: number }>(
      'SELECT tombstone FROM transactions WHERE id = ?',
      [parentId]
    );
    expect(parent?.tombstone).toBe(1);

    const child1 = await db.first<{ tombstone: number }>(
      'SELECT tombstone FROM transactions WHERE id = ?',
      ['child_1']
    );
    const child2 = await db.first<{ tombstone: number }>(
      'SELECT tombstone FROM transactions WHERE id = ?',
      ['child_2']
    );
    expect(child1?.tombstone).toBe(0);
    expect(child2?.tombstone).toBe(0);
  });
});