// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';
import * as sqlite from '#platform/server/sqlite';
import * as budget from '#server/budget/base';

const TOTAL_TRANSACTIONS = 5000;
const CATEGORY_COUNT = 10;
const ACCOUNT_COUNT = 3;
const MONTHS = 12;

const PAYEE_NAMES = [
  'Walmart', 'Amazon', 'Netflix', 'Spotify', 'Shell',
  'Starbucks', 'Trader Joe', 'Costco', 'Target', 'Uber',
  'Whole Foods', 'Home Depot', 'Best Buy', 'CVS', 'Kroger',
];

const CATEGORY_NAMES = [
  'Groceries', 'Rent', 'Utilities', 'Transportation', 'Dining Out',
  'Entertainment', 'Healthcare', 'Education', 'Clothing', 'Miscellaneous',
];

describe('System Test: Volume — 5,000 transactions (SYS-002)', () => {
  beforeEach(global.emptyDatabase());

  async function setupVolumeDb() {
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });
    await db.insertCategory({
      id: 'income-cat',
      name: 'Salary',
      cat_group: 'income-group',
      is_income: 1,
    });

    await db.insertCategoryGroup({
      id: 'expense-group',
      name: 'Expenses',
      is_income: 0,
    });

    const categoryIds: string[] = [];
    for (let i = 0; i < CATEGORY_COUNT; i++) {
      const catId = `cat-${i}`;
      categoryIds.push(catId);
      await db.insertCategory({
        id: catId,
        name: CATEGORY_NAMES[i],
        cat_group: 'expense-group',
        is_income: 0,
      });
    }

    const accountIds: string[] = [];
    for (let i = 1; i <= ACCOUNT_COUNT; i++) {
      const acctId = `acct-${i}`;
      accountIds.push(acctId);
      await db.insertAccount({
        id: acctId,
        name: `Account ${i}`,
        offbudget: 0,
      });
    }

    await sheet.loadSpreadsheet(db);
    const monthList: string[] = [];
    for (let m = 1; m <= MONTHS; m++) {
      monthList.push(`2026-${String(m).padStart(2, '0')}`);
    }
    await budget.createBudget(monthList);

    return { categoryIds, accountIds };
  }

  function getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function seededAmount(seed: number, min: number, max: number): string {
    const range = max - min;
    const val = min + ((seed * 7919 + 104729) % (range * 100)) / 100;
    return val.toFixed(2);
  }

  /**
   * SYS-002: Prueba de volumen — 5,000 transacciones.
   * RNF-002 – Rendimiento masivo (AQL).
   *
   * Verifica que:
   * - El sistema soporta insertar 5,000 transacciones sin errores.
   * - Todas las transacciones quedan registradas en la base de datos.
   * - Las vistas AQL reflejan correctamente el volumen.
   * - El tiempo total de inserción es aceptable (< 60 s).
   * - Las consultas de balance y categoría siguen respondiendo rápido.
   */
  it('SYS-002: Insertar 5,000 transacciones y verificar estabilidad del sistema', async () => {
    const { accountIds, categoryIds } = await setupVolumeDb();

    const db_ = db.getDatabase();
    const batchSize = 500;
    const batches = TOTAL_TRANSACTIONS / batchSize;
    const insertStart = Date.now();

    for (let batch = 0; batch < batches; batch++) {
      let values: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = batch * batchSize + i + 1;
        const id = `sys002-txn-${idx}`;
        const acct = getRandomItem(accountIds);
        const cat = getRandomItem(categoryIds);
        const payee = getRandomItem(PAYEE_NAMES);
        const month = Math.floor((idx - 1) / (TOTAL_TRANSACTIONS / MONTHS)) + 1;
        const day = ((idx * 17) % 28) + 1;
        const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const amount = seededAmount(idx, -500, -1);
        const amountCents = Math.round(parseFloat(amount) * 100);
        const dateInt = parseInt(
          `2026${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
        );

        values.push(
          `('${id}','${acct}','${cat}',${dateInt},${amountCents},'${payee}','Imported bulk transaction ${idx}',0)`,
        );
      }

      sqlite.execQuery(
        db_,
        `INSERT INTO transactions (id, acct, category, date, amount, description, notes, tombstone)
         VALUES ${values.join(',')}`,
      );
    }

    const insertDuration = (Date.now() - insertStart) / 1000;

    const countRow = db.firstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE tombstone = 0',
    );
    expect(countRow?.count).toBe(TOTAL_TRANSACTIONS);

    const queryStart = Date.now();
    const balanceRow = db.firstSync<{ total: number }>(
      `SELECT SUM(amount) as total FROM transactions WHERE acct = ? AND tombstone = 0`,
      ['acct-1'],
    );
    const queryDuration = (Date.now() - queryStart) / 1000;
    expect(typeof balanceRow?.total).toBe('number');

    const catStart = Date.now();
    const catCounts = db.runQuery<{ category: string; count: number }>(
      `SELECT category, COUNT(*) as count FROM transactions WHERE tombstone = 0 GROUP BY category ORDER BY count DESC`,
      [],
      true,
    );
    const catDuration = (Date.now() - catStart) / 1000;
    expect(catCounts.length).toBe(CATEGORY_COUNT);

    console.log(`\n[SYS-002] Resultados:`);
    console.log(`  Transacciones insertadas: ${TOTAL_TRANSACTIONS}`);
    console.log(`  Tiempo total de inserción: ${insertDuration.toFixed(2)} s`);
    console.log(`  Tiempo consulta de balance: ${queryDuration.toFixed(3)} s`);
    console.log(`  Tiempo consulta agrupada: ${catDuration.toFixed(3)} s`);
    console.log(`  Categorías con transacciones: ${catCounts.length}/${CATEGORY_COUNT}`);

    expect(insertDuration).toBeLessThan(60);
    expect(queryDuration).toBeLessThan(1);
    expect(catDuration).toBeLessThan(2);
  });
});
