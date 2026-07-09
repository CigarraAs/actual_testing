// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import { applyActions } from '#server/transactions/transaction-rules';
import { loadMappings } from '#server/db/mappings';

describe('Rules Integration Tests - applyActions', () => {
  let accountId;
  let catId;
  let splitCatId;

  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();

    accountId = await db.insertAccount({ name: 'Bank' });
    const groupId = await db.insertCategoryGroup({ name: 'General' });
    catId = await db.insertCategory({ name: 'Needs', cat_group: groupId });
    splitCatId = await db.insertCategory({ name: 'Wants', cat_group: groupId });
  });

  /**
   * INT-DB-F13.1: Aplicar acciones sobre múltiples transacciones exitosamente
   */
  it('INT-DB-F13.1: Aplicar acciones sobre múltiples transacciones y persisten en BD', async () => {
    const tx1Id = await db.insertTransaction({
      account: accountId, amount: -1000, date: '2026-07-01', notes: 'Initial 1',
    });
    const tx2Id = await db.insertTransaction({
      account: accountId, amount: -2000, date: '2026-07-02', notes: 'Initial 2',
    });

    const transactions = await db.getTransactions(accountId);
    
    const actions = [
      { op: 'set', field: 'category', value: catId },
      { op: 'set', field: 'notes', value: 'Updated via applyActions' }
    ];

    const result = await applyActions(transactions, actions);
    expect(result).toBeDefined();

    const updatedTransactions = await db.getTransactions(accountId);
    
    const tx1 = updatedTransactions.find(t => t.id === tx1Id);
    expect(tx1?.category).toBe(catId);
    expect(tx1?.notes).toBe('Updated via applyActions');

    const tx2 = updatedTransactions.find(t => t.id === tx2Id);
    expect(tx2?.category).toBe(catId);
    expect(tx2?.notes).toBe('Updated via applyActions');
  });

  /**
   * INT-DB-F13.2: Enviar acciones vacías o transacciones vacías
   */
  it('INT-DB-F13.2: Si no hay transacciones o acciones, no falla', async () => {
    const tx1Id = await db.insertTransaction({
      account: accountId, amount: -1000, date: '2026-07-01', notes: 'Initial 1',
    });
    
    let transactions = await db.getTransactions(accountId);
    let result = await applyActions(transactions, []);
    expect(result).toBeDefined();
    
    let updatedTransactions = await db.getTransactions(accountId);
    let tx1 = updatedTransactions.find(t => t.id === tx1Id);
    expect(tx1?.notes).toBe('Initial 1');

    result = await applyActions([], [{ op: 'set', field: 'notes', value: 'Test' }]);
    expect(result).toBeDefined();
  });

  /**
   * INT-DB-F13.3: Aplicar acción destructiva (delete-transaction)
   */
  it('INT-DB-F13.3: Aplicar delete-transaction borra físicamente de la base de datos', async () => {
    await db.insertTransaction({
      account: accountId, amount: -1000, date: '2026-07-01', notes: 'To Be Deleted',
    });

    const transactions = await db.getTransactions(accountId);
    expect(transactions.length).toBe(1);

    const actions = [{ op: 'delete-transaction' }];

    await applyActions(transactions, actions);

    const updatedTransactions = await db.getTransactions(accountId);
    expect(updatedTransactions.length).toBe(0);
  });

  /**
   * INT-DB-F13.4: Aplicar acción de split transaction (set-split-amount)
   * Prueba que el motor integra bien la lógica de desdoblar transacciones (crear hijos).
   */
  it('INT-DB-F13.4: Transforma transacción en split transaction', async () => {
    const txId = await db.insertTransaction({
      account: accountId, amount: -5000, date: '2026-07-01', notes: 'Base Transaction',
    });

    const transactions = await db.getTransactions(accountId);
    expect(transactions.length).toBe(1);

    // Acción para convertir a split: asigna $20.00 a un split con categoría específica, 
    // y el resto ($30.00) se calcula usando method: 'remainder' o 'fixed-amount'
    const actions = [
      {
        op: 'set-split-amount',
        field: null,
        value: -2000, // Split de $20
        options: { splitIndex: 1, method: 'fixed-amount' },
      },
      {
        op: 'set',
        field: 'category',
        value: splitCatId,
        options: { splitIndex: 1 },
      }
    ];

    await applyActions(transactions, actions);

    // Obtener las transacciones: el padre se convirtió en split, y se generaron los sub-splits
    const updatedTransactions = await db.getTransactions(accountId);
    
    const parent = updatedTransactions.find(t => t.id === txId);
    expect(parent).toBeDefined();
    expect(parent?.is_parent).toBe(true);

    const children = updatedTransactions.filter(t => t.parent_id === txId);
    expect(children.length).toBeGreaterThan(0);
    
    // Verificamos que al menos un hijo tenga la categoría asignada por el action de split
    const splitChild = children.find(c => c.category === splitCatId);
    expect(splitChild).toBeDefined();
    expect(splitChild?.amount).toBe(-2000);
  });
});
