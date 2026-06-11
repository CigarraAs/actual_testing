// @ts-strict-ignore
import * as db from '#server/db';
import type { TransactionEntity } from '#types/models';

import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
  moveTransaction,
  getEarliestTransaction,
  getLatestTransaction,
} from './app';

beforeEach(global.emptyDatabase());
afterEach(global.emptyDatabase());

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function setupDatabase() {
  // Create category group and categories
  const categoryGroup = await db.insertCategoryGroup({
    id: 'group1',
    name: 'Expenses',
    is_income: 0,
  });

  const category1 = await db.insertCategory({
    id: 'cat-food',
    name: 'Food',
    cat_group: categoryGroup,
    is_income: 0,
  });

  const category2 = await db.insertCategory({
    id: 'cat-transport',
    name: 'Transport',
    cat_group: categoryGroup,
    is_income: 0,
  });

  // Create income category group
  const incomeGroup = await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });

  const incomeCategory = await db.insertCategory({
    id: 'cat-salary',
    name: 'Salary',
    cat_group: incomeGroup,
    is_income: 1,
  });

  // Create accounts
  const account1 = await db.insertAccount({
    id: 'account-checking',
    name: 'Checking Account',
    offbudget: 0,
  });

  const account2 = await db.insertAccount({
    id: 'account-savings',
    name: 'Savings Account',
    offbudget: 0,
  });

  const offBudgetAccount = await db.insertAccount({
    id: 'account-credit',
    name: 'Credit Card',
    offbudget: 1,
  });

  // Create payees
  const payee1 = await db.insertPayee({
    id: 'payee-grocery',
    name: 'Grocery Store',
  });

  const payee2 = await db.insertPayee({
    id: 'payee-gas',
    name: 'Gas Station',
  });

  return {
    categoryGroup,
    category1,
    category2,
    incomeCategory,
    account1,
    account2,
    offBudgetAccount,
    payee1,
    payee2,
  };
}

async function getTransactionCount(accountId?: string) {
  const query = accountId
    ? `SELECT COUNT(*) as count FROM transactions WHERE acct = '${accountId}' AND tombstone = 0`
    : 'SELECT COUNT(*) as count FROM transactions WHERE tombstone = 0';
  const result = await db.first(query);
  return result?.count || 0;
}

// ============================================================================
// TRANSACTION CREATION TESTS
// ============================================================================

describe('Transaction App - Add Transaction', () => {
  it('TX-001: Crear transacción simple con datos básicos', async () => {
    await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-001',
      account: 'account-checking',
      date: '2025-01-15',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    const result = await addTransaction(transaction);
    expect(result).toBeDefined();

    const count = await getTransactionCount('account-checking');
    expect(count).toBe(1);
  });

  it('TX-002: Crear transacción con categoría', async () => {
    const { category1, account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-002',
      account: account1,
      date: '2025-01-16',
      amount: -4550,
      category: category1,
      notes: 'Weekly groceries',
      cleared: true,
      reconciled: false,
    };

    const result = await addTransaction(transaction);
    expect(result).toBeDefined();

    const stored = await db.getTransaction('tx-002');
    expect(stored?.amount).toBe(-4550);
    expect(stored?.category).toBe(category1);
    expect(stored?.notes).toBe('Weekly groceries');
  });

  it('TX-003: Crear transacción con beneficiario (payee)', async () => {
    const { payee1, account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-003',
      account: account1,
      date: '2025-01-17',
      amount: -7500,
      payee: payee1,
      cleared: false,
      reconciled: false,
    };

    const result = await addTransaction(transaction);
    expect(result).toBeDefined();

    const stored = await db.getTransaction('tx-003');
    expect(stored?.payee).toBe(payee1);
  });

  it('TX-004: Crear transacción de ingreso', async () => {
    const { incomeCategory, account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-salary-001',
      account: account1,
      date: '2025-01-01',
      amount: 250000,
      category: incomeCategory,
      cleared: true,
      reconciled: true,
    };

    const result = await addTransaction(transaction);
    expect(result).toBeDefined();

    const stored = await db.getTransaction('tx-salary-001');
    expect(stored?.amount).toBe(250000);
  });

  it('TX-005: Crear múltiples transacciones en cuenta', async () => {
    const { account1, category1 } = await setupDatabase();

    const transactions = [
      {
        id: 'tx-multi-001',
        account: account1,
        date: '2025-01-10',
        amount: -10000,
        category: category1,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
      {
        id: 'tx-multi-002',
        account: account1,
        date: '2025-01-11',
        amount: -5000,
        category: category1,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
    ];

    for (const tx of transactions) {
      await addTransaction(tx);
    }

    const count = await getTransactionCount(account1);
    expect(count).toBe(2);
  });
});

// ============================================================================
// TRANSACTION UPDATE TESTS
// ============================================================================

describe('Transaction App - Update Transaction', () => {
  it('TX-101: Actualizar monto de transacción', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-update-001',
      account: account1,
      date: '2025-01-20',
      amount: -10000,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);

    const updatedTransaction: TransactionEntity = {
      id: 'tx-update-001',
      account: account1,
      date: '2025-01-20',
      amount: -15000,
      cleared: false,
      reconciled: false,
    };

    await updateTransaction(updatedTransaction);

    const stored = await db.getTransaction('tx-update-001');
    expect(stored?.amount).toBe(-15000);
  });

  it('TX-102: Actualizar categoría de transacción', async () => {
    const { account1, category1, category2 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-update-002',
      account: account1,
      date: '2025-01-21',
      amount: -7500,
      category: category1,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);

    const updatedTransaction: TransactionEntity = {
      id: 'tx-update-002',
      account: account1,
      date: '2025-01-21',
      amount: -7500,
      category: category2,
      cleared: false,
      reconciled: false,
    };

    await updateTransaction(updatedTransaction);

    const stored = await db.getTransaction('tx-update-002');
    expect(stored?.category).toBe(category2);
  });

  it('TX-103: Actualizar estado de compensación (cleared)', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-update-003',
      account: account1,
      date: '2025-01-22',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);

    const updatedTransaction: TransactionEntity = {
      id: 'tx-update-003',
      account: account1,
      date: '2025-01-22',
      amount: -5000,
      cleared: true,
      reconciled: false,
    };

    await updateTransaction(updatedTransaction);

    const stored = await db.getTransaction('tx-update-003');
    expect(stored?.cleared).toBe(true);
  });

  it('TX-104: Actualizar múltiples campos simultáneamente', async () => {
    const { account1, category1, payee1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-update-004',
      account: account1,
      date: '2025-01-23',
      amount: -10000,
      category: category1,
      payee: payee1,
      notes: 'Original note',
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);

    const updatedTransaction: TransactionEntity = {
      id: 'tx-update-004',
      account: account1,
      date: '2025-01-23',
      amount: -12500,
      category: category1,
      payee: payee1,
      notes: 'Updated note with more details',
      cleared: true,
      reconciled: false,
    };

    await updateTransaction(updatedTransaction);

    const stored = await db.getTransaction('tx-update-004');
    expect(stored?.amount).toBe(-12500);
    expect(stored?.notes).toBe('Updated note with more details');
    expect(stored?.cleared).toBe(true);
  });
});

// ============================================================================
// TRANSACTION DELETION TESTS
// ============================================================================

describe('Transaction App - Delete Transaction', () => {
  it('TX-201: Eliminar transacción existente', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-delete-001',
      account: account1,
      date: '2025-01-25',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);

    let count = await getTransactionCount(account1);
    expect(count).toBe(1);

    await deleteTransaction({ id: 'tx-delete-001' });

    count = await getTransactionCount(account1);
    expect(count).toBe(0);
  });

  it('TX-202: Eliminar transacción no afecta otras transacciones', async () => {
    const { account1 } = await setupDatabase();

    const tx1: TransactionEntity = {
      id: 'tx-delete-002a',
      account: account1,
      date: '2025-01-26',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    const tx2: TransactionEntity = {
      id: 'tx-delete-002b',
      account: account1,
      date: '2025-01-27',
      amount: -7500,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(tx1);
    await addTransaction(tx2);

    await deleteTransaction({ id: 'tx-delete-002a' });

    const remaining = await db.getTransaction('tx-delete-002b');
    expect(remaining).toBeDefined();
    expect(remaining?.amount).toBe(-7500);
  });

  it('TX-203: Eliminar transacción y validar persistencia', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-delete-003',
      account: account1,
      date: '2025-01-28',
      amount: -10000,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);
    await deleteTransaction({ id: 'tx-delete-003' });

    const retrieved = await db.getTransaction('tx-delete-003');
    expect(retrieved).toBeUndefined();
  });
});

// ============================================================================
// TRANSACTION MOVEMENT TESTS
// ============================================================================

describe('Transaction App - Move Transaction', () => {
  it('TX-301: Mover transacción a otra posición en misma cuenta', async () => {
    const { account1 } = await setupDatabase();

    const tx1: TransactionEntity = {
      id: 'tx-move-001',
      account: account1,
      date: '2025-02-01',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    const tx2: TransactionEntity = {
      id: 'tx-move-002',
      account: account1,
      date: '2025-02-02',
      amount: -7500,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(tx1);
    await addTransaction(tx2);

    await moveTransaction({
      id: 'tx-move-001',
      accountId: account1,
      targetId: 'tx-move-002',
    });

    const result = await db.getTransaction('tx-move-001');
    expect(result?.id).toBe('tx-move-001');
  });

  it('TX-302: Mover transacción falla si cuenta no coincide', async () => {
    const { account1, account2 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-move-003',
      account: account1,
      date: '2025-02-03',
      amount: -10000,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(transaction);

    // Try to move with incorrect account ID
    await expect(() =>
      moveTransaction({
        id: 'tx-move-003',
        accountId: account2,
        targetId: null,
      }),
    ).rejects.toThrow();
  });

  it('TX-303: Mover transacción a final de lista (targetId null)', async () => {
    const { account1 } = await setupDatabase();

    const tx1: TransactionEntity = {
      id: 'tx-move-004',
      account: account1,
      date: '2025-02-04',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    const tx2: TransactionEntity = {
      id: 'tx-move-005',
      account: account1,
      date: '2025-02-05',
      amount: -7500,
      cleared: false,
      reconciled: false,
    };

    await addTransaction(tx1);
    await addTransaction(tx2);

    await moveTransaction({
      id: 'tx-move-004',
      accountId: account1,
      targetId: null,
    });

    const result = await db.getTransaction('tx-move-004');
    expect(result).toBeDefined();
  });
});

// ============================================================================
// TRANSACTION QUERY TESTS
// ============================================================================

describe('Transaction App - Query Functions', () => {
  it('TX-401: Obtener transacción más antigua', async () => {
    const { account1 } = await setupDatabase();

    const transactions = [
      {
        id: 'tx-earliest-001',
        account: account1,
        date: '2025-01-15',
        amount: -5000,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
      {
        id: 'tx-earliest-002',
        account: account1,
        date: '2025-01-10',
        amount: -10000,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
      {
        id: 'tx-earliest-003',
        account: account1,
        date: '2025-01-20',
        amount: -7500,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
    ];

    for (const tx of transactions) {
      await addTransaction(tx);
    }

    const earliest = await getEarliestTransaction();
    expect(earliest?.id).toBe('tx-earliest-002');
  });

  it('TX-402: Obtener transacción más reciente', async () => {
    const { account1 } = await setupDatabase();

    const transactions = [
      {
        id: 'tx-latest-001',
        account: account1,
        date: '2025-01-15',
        amount: -5000,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
      {
        id: 'tx-latest-002',
        account: account1,
        date: '2025-01-10',
        amount: -10000,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
      {
        id: 'tx-latest-003',
        account: account1,
        date: '2025-01-25',
        amount: -7500,
        cleared: false,
        reconciled: false,
      } as TransactionEntity,
    ];

    for (const tx of transactions) {
      await addTransaction(tx);
    }

    const latest = await getLatestTransaction();
    expect(latest?.id).toBe('tx-latest-003');
  });

  it('TX-403: Transacciones vacías retornan null', async () => {
    await setupDatabase();

    const earliest = await getEarliestTransaction();
    const latest = await getLatestTransaction();

    expect(earliest).toBeNull();
    expect(latest).toBeNull();
  });
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

describe('Transaction App - Error Handling', () => {
  it('TX-501: Validar transacción con datos incompletos', async () => {
    await setupDatabase();

    const invalidTransaction = {
      id: 'tx-invalid-001',
      account: 'account-checking',
      // Missing required date and amount
      cleared: false,
      reconciled: false,
    };

    // Should throw or handle gracefully
    await expect(addTransaction(invalidTransaction as any)).rejects.toThrow();
  });

  it('TX-502: Actualizar transacción no existente', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-nonexistent',
      account: account1,
      date: '2025-02-10',
      amount: -5000,
      cleared: false,
      reconciled: false,
    };

    // Should handle gracefully
    const result = await updateTransaction(transaction);
    expect(result).toBeDefined();
  });

  it('TX-503: Eliminar transacción no existente', async () => {
    await setupDatabase();

    // Should handle gracefully
    const result = await deleteTransaction({ id: 'tx-nonexistent-delete' });
    expect(result).toBeDefined();
  });

  it('TX-504: Transacción con monto cero', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-zero-amount',
      account: account1,
      date: '2025-02-11',
      amount: 0,
      cleared: false,
      reconciled: false,
    };

    const result = await addTransaction(transaction);
    expect(result).toBeDefined();

    const stored = await db.getTransaction('tx-zero-amount');
    expect(stored?.amount).toBe(0);
  });

  it('TX-505: Transacción con montos muy grandes', async () => {
    const { account1 } = await setupDatabase();

    const transaction: TransactionEntity = {
      id: 'tx-large-amount',
      account: account1,
      date: '2025-02-12',
      amount: 99999999900,
      cleared: false,
      reconciled: false,
    };

    const result = await addTransaction(transaction);
    expect(result).toBeDefined();

    const stored = await db.getTransaction('tx-large-amount');
    expect(stored?.amount).toBe(99999999900);
  });
});
