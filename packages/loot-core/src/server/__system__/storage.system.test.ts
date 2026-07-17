// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import * as sqlite from '#platform/server/sqlite';
import * as sheet from '#server/sheet';

const INITIAL_TRANSACTIONS = 500;
const CATEGORY_COUNT = 10;
const ACCOUNT_COUNT = 3;
const BATCH_SIZE = 200;

const CATEGORY_NAMES = [
  'Groceries', 'Rent', 'Utilities', 'Transport', 'Dining Out',
  'Entertainment', 'Healthcare', 'Education', 'Clothing', 'Gifts',
];
const PAYEE_NAMES = [
  'Walmart', 'Amazon', 'Netflix', 'Shell', 'Starbucks',
  'Costco', 'Target', 'Uber', 'Home Depot', 'Kroger',
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function seededAmount(seed: number, min: number, max: number): number {
  const range = max - min;
  const val = min + ((seed * 7919 + 104729) % (range * 100)) / 100;
  return Math.round(val * 100);
}

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

function insertTransactions(
  db_: any,
  startIdx: number,
  count: number,
  accountIds: string[],
  categoryIds: string[],
  prefix: string,
): void {
  const batchSize = 500;
  const batches = Math.ceil(count / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    let values: string[] = [];
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, count);

    for (let i = batchStart; i < batchEnd; i++) {
      const idx = startIdx + i + 1;
      const id = `${prefix}-${idx}`;
      const acct = escapeSQL(getRandomItem(accountIds));
      const cat = escapeSQL(getRandomItem(categoryIds));
      const payee = escapeSQL(getRandomItem(PAYEE_NAMES));
      const month = Math.floor((i % (count * 12)) / count) + 1 || 1;
      const day = ((idx * 17) % 28) + 1;
      const amountCents = seededAmount(idx, -50000, -100);
      const dateInt = parseInt(
        `2026${String(Math.min(month, 12)).padStart(2, '0')}${String(day).padStart(2, '0')}`,
      );

      values.push(
        `('${id}','${acct}','${cat}',${dateInt},${amountCents},'${payee}','Bulk',0)`,
      );
    }

    sqlite.execQuery(
      db_,
      `INSERT INTO transactions (id, acct, category, date, amount, description, notes, tombstone)
       VALUES ${values.join(',')}`,
    );
  }
}

function runIntegrityCheck(db_: any): string {
  const rows = sqlite.runQuery(db_, 'PRAGMA integrity_check', [], true);
  return rows[0]?.['integrity_check'] || 'unknown';
}

describe('System Test: Storage — Persistence & Integrity (SYS-008)', () => {
  beforeEach(global.emptyDatabase());

  async function setupStorageDb() {
    await db.insertCategoryGroup({ id: 'income-group', name: 'Income', is_income: 1 });
    await db.insertCategory({ id: 'income-cat', name: 'Salary', cat_group: 'income-group', is_income: 1 });

    await db.insertCategoryGroup({ id: 'expense-group', name: 'Expenses', is_income: 0 });

    const categoryIds: string[] = [];
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      const catId = `cat-${i}`;
      categoryIds.push(catId);
      await db.insertCategory({ id: catId, name: CATEGORY_NAMES[i], cat_group: 'expense-group', is_income: 0 });
    }

    const accountIds: string[] = [];
    for (let i = 1; i <= ACCOUNT_COUNT; i++) {
      const acctId = `acct-${i}`;
      accountIds.push(acctId);
      await db.insertAccount({ id: acctId, name: `Account ${i}`, offbudget: 0 });
    }

    await sheet.loadSpreadsheet(db);

    return { categoryIds, accountIds };
  }

  /**
   * SYS-008.1: Verificar integridad estructural de la base de datos
   * después de inserción masiva de transacciones.
   * RNF-007 – Tolerancia a fallos offline.
   *
   * Valida que:
   * - PRAGMA integrity_check retorna "ok" tras insertar 500 transacciones.
   * - Las 500 transacciones se contabilizan correctamente.
   */
  it('SYS-008.1: PRAGMA integrity_check tras inserción masiva de 500 transacciones', async () => {
    const { accountIds, categoryIds } = await setupStorageDb();

    const db_ = db.getDatabase();
    insertTransactions(db_, 0, INITIAL_TRANSACTIONS, accountIds, categoryIds, 's8');

    const integrity = runIntegrityCheck(db_);
    expect(integrity).toBe('ok');

    const count = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE tombstone = 0',
    );
    expect(count?.count).toBe(INITIAL_TRANSACTIONS);

    console.log(`\n[SYS-008.1] PRAGMA integrity_check: ${integrity}`);
    console.log(`  Transacciones insertadas: ${count?.count}`);
  });

  /**
   * SYS-008.2: Simular fallo de "disco lleno" (ENOSPC) durante inserción
   * masiva y verificar atomicidad del rollback.
   * RNF-007 – Tolerancia a fallos offline.
   *
   * Valida que:
   * - Tras un fallo simulado, la BD mantiene integridad estructural.
   * - Las 500 transacciones originales permanecen intactas.
   * - Ningún registro huérfano queda de la operación fallida.
   */
  it('SYS-008.2: Rollback atómico ante fallo simulado de disco lleno (ENOSPC)', async () => {
    const { accountIds, categoryIds } = await setupStorageDb();

    const db_ = db.getDatabase();

    // Fase 1: Insertar 500 transacciones base exitosamente
    insertTransactions(db_, 0, INITIAL_TRANSACTIONS, accountIds, categoryIds, 's8a');

    // Verificar que las 500 se insertaron
    const countBefore = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE tombstone = 0',
    );
    expect(countBefore?.count).toBe(INITIAL_TRANSACTIONS);

    // Fase 2: Simular fallo ENOSPC durante inserción batch
    // Envolvemos la inserción en una transacción explícita para forzar
    // atomicidad. Simulamos el fallo ejecutando una sentencia SQL inválida
    // a propósito en medio del lote, lo que provoca que SQLite rechace
    // todo el batch.
    let rollbackOccurred = false;
    try {
      sqlite.execQuery(db_, 'BEGIN TRANSACTION');

      // Insertar las primeras 100 del batch
      insertTransactions(db_, INITIAL_TRANSACTIONS, 100, accountIds, categoryIds, 's8b-fail');

      // Simular fallo: forzar error que rompa la transacción
      // Insertamos una fila con ID duplicado intencionalmente para
      // provocar UNIQUE constraint violation
      sqlite.execQuery(
        db_,
        `INSERT INTO transactions (id, acct, category, date, amount, description, notes, tombstone)
         VALUES ('s8a-1','acct-1','cat-0',20260101,-1000,'dupe','duplicate',0)`,
      );

      // Si llegamos aquí, el error no se disparó (no debería pasar)
      sqlite.execQuery(db_, 'COMMIT');
    } catch (_err) {
      // El error de UNIQUE constraint es esperado
      rollbackOccurred = true;
      try {
        sqlite.execQuery(db_, 'ROLLBACK');
      } catch (_rollbackErr) {
        // Rollback puede fallar si la transacción ya fue abortada
      }
    }

    expect(rollbackOccurred).toBe(true);

    // Fase 3: Verificar integridad post-fallo
    const integrity = runIntegrityCheck(db_);
    expect(integrity).toBe('ok');

    // Fase 4: Verificar atomicidad — solo deben existir las 500 originales
    // Las 100 del batch fallido + el duplicado NO deben persistir
    const countAfter = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE tombstone = 0',
    );
    expect(countAfter?.count).toBe(INITIAL_TRANSACTIONS);

    // Verificar que ningún registro huérfano del batch fallido existe
    const orphanCount = db.firstSync<{ count: number }>(
      "SELECT COUNT(*) as count FROM transactions WHERE id LIKE 's8b-fail-%' AND tombstone = 0",
    );
    expect(orphanCount?.count).toBe(0);

    console.log(`\n[SYS-008.2] Simulación de fallo ENOSPC:`);
    console.log(`  Rollback ocurrió: ${rollbackOccurred ? 'SÍ' : 'NO'}`);
    console.log(`  PRAGMA integrity_check: ${integrity}`);
    console.log(`  Transacciones antes del fallo: ${countBefore?.count}`);
    console.log(`  Transacciones después del fallo: ${countAfter?.count}`);
    console.log(`  Registros huérfanos del batch fallido: ${orphanCount?.count}`);
  });

  /**
   * SYS-008.3: Verificar persistencia de datos a través de
   * múltiples inserciones distribuidas en el tiempo (simulación
   * de uso prolongado).
   * RNF-007 – Tolerancia a fallos offline.
   *
   * Valida que:
   * - La BD mantiene integridad tras múltiples rondas de inserción.
   * - Las cuentas y categorías persisten correctamente.
   */
  it('SYS-008.3: Persistencia de datos a través de múltiples rondas de inserción', async () => {
    const { accountIds, categoryIds } = await setupStorageDb();

    const db_ = db.getDatabase();
    const rounds = 5;
    const perRound = 100;

    for (let r = 0; r < rounds; r++) {
      insertTransactions(db_, r * perRound, perRound, accountIds, categoryIds, `s8c-r${r}`);
    }

    const integrity = runIntegrityCheck(db_);
    expect(integrity).toBe('ok');

    const totalCount = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE tombstone = 0',
    );
    expect(totalCount?.count).toBe(rounds * perRound);

    const accountsCount = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM accounts',
    );
    expect(accountsCount?.count).toBe(ACCOUNT_COUNT);

    const categoriesCount = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM categories WHERE tombstone = 0',
    );
    expect(categoriesCount?.count).toBe(CATEGORY_COUNT + 1); // +1 income

    console.log(`\n[SYS-008.3] Persistencia multi-ronda:`);
    console.log(`  Rondas: ${rounds} × ${perRound} transacciones`);
    console.log(`  Total: ${totalCount?.count}`);
    console.log(`  PRAGMA integrity_check: ${integrity}`);
    console.log(`  Cuentas: ${accountsCount?.count}`);
    console.log(`  Categorías: ${categoriesCount?.count}`);
  });
});
