import { describe, it, expect, beforeEach } from 'vitest';
import * as db from '../db';

describe('DB Integration Tests', () => {
  beforeEach(global.emptyDatabase());

  /**
   * INT-DB-09: Inserción directa en transactions desde el nivel de base de datos.
   * Tarea: S3-F3.2-18 — F18 insertTransaction
   *
   * Verifica que:
   * - Se pueda insertar una transacción directamente mediante db.insertTransaction.
   * - La transacción queda persistida correctamente.
   * - El balance de la cuenta se actualiza sumando los montos.
   */
  it('INT-DB-09: Inserción directa en transactions desde el nivel de base de datos', async () => {
    const accountId = await db.insertAccount({ name: 'Cuenta BD', offbudget: 0, closed: 0 });
    const catGroup = await db.insertCategoryGroup({ name: 'Gastos', is_income: 0 });
    const catComida = await db.insertCategory({ name: 'Comida', cat_group: catGroup, is_income: 0 });

    await db.insertTransaction({ id: 'txn_init', account: accountId, amount: 50000, date: '2026-06-01', cleared: true });

    await db.insertTransaction({
      id: 'txn_direct',
      account: accountId,
      amount: -10000,
      category: catComida,
      date: '2026-06-02',
      cleared: true
    });

    const txn = await db.first<{ amount: number }>(
      'SELECT amount FROM transactions WHERE id = ?',
      ['txn_direct']
    );
    expect(txn).toBeDefined();
    expect(txn?.amount).toBe(-10000);

    const balanceQuery = await db.first<{ balance: number }>(
      'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0',
      [accountId]
    );
    expect(balanceQuery?.balance).toBe(40000);
  });

  /**
   * INT-DB-10: Inserción con datos inválidos (campo faltante).
   * Tarea: S3-F3.2-18 — F18 insertTransaction
   *
   * Verifica que:
   * - Si se omite un campo obligatorio (como account), la función lanza un error.
   * - La transacción no se persiste en la base de datos.
   */
  it('INT-DB-10: Inserción con datos inválidos (campo faltante)', async () => {
    let errorCaught = false;
    try {
      await db.insertTransaction({
        id: 'txn_invalid',
        amount: -10000,
        date: '2026-06-03',
      } as any);
    } catch (error) {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);

    const txn = await db.first('SELECT * FROM transactions WHERE id = ?', ['txn_invalid']);
    expect(txn).toBeNull();
  });
});