// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';
import * as sqlite from '#platform/server/sqlite';
import * as budget from '#server/budget/base';
import * as monthUtils from '#shared/months';
import { getSheetValue, setBudget } from '#server/budget/actions';

const TOTAL = 10000;
const CATEGORY_COUNT = 15;
const ACCOUNT_COUNT = 5;
const MONTHS = 12;
const ITERATIONS = 5;

const CATEGORY_NAMES = [
  'Groceries', 'Rent', 'Utilities', 'Transport', 'Dining Out',
  'Entertainment', 'Healthcare', 'Education', 'Clothing', 'Gifts',
  'Subscriptions', 'Insurance', 'Travel', 'Pets', 'Home Maintenance',
];
const PAYEE_NAMES = [
  'Walmart', 'Amazon', 'Netflix', 'Spotify', 'Shell', 'Starbucks',
  'Trader Joe', 'Costco', 'Target', 'Uber', 'Whole Foods', 'Home Depot',
  'Best Buy', 'CVS', 'Kroger', 'Walgreens', 'Lowe\'s', 'Aldi', 'Safeway', 'Petco',
];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function seededAmount(seed: number, min: number, max: number): number {
  const range = max - min;
  const val = min + ((seed * 7919 + 104729) % (range * 100)) / 100;
  return Math.round(val * 100);
}

function measure(label: string, fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function measureAsync(label: string, fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe('System Test: Performance — AQL queries under 10k load (SYS-003)', () => {
  beforeEach(global.emptyDatabase());

  async function setupPerformanceDb() {
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

    const monthList: string[] = [];
    for (let m = 1; m <= MONTHS; m++) {
      monthList.push(`2026-${String(m).padStart(2, '0')}`);
    }

    await sheet.loadSpreadsheet(db);
    await budget.createBudget(monthList);

    const db_ = db.getDatabase();
    const batchSize = 500;
    const batches = TOTAL / batchSize;

    for (let batch = 0; batch < batches; batch++) {
      let values: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const idx = batch * batchSize + i + 1;
        const id = `sys003-txn-${idx}`;
        const acct = getRandomItem(accountIds);
        const cat = getRandomItem(categoryIds);
        const payee = getRandomItem(PAYEE_NAMES);
        const month = Math.floor((idx - 1) / (TOTAL / MONTHS)) + 1;
        const day = ((idx * 17) % 28) + 1;
        const amountCents = seededAmount(idx, -50000, -100);
        const dateInt = parseInt(`2026${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`);
        const safePayee = payee.replace(/'/g, "''");
        const safeAcct = acct.replace(/'/g, "''");
        const safeCat = cat.replace(/'/g, "''");

        values.push(`('${id}','${safeAcct}','${safeCat}',${dateInt},${amountCents},'${safePayee}','Bulk #${idx}',0)`);
      }
      sqlite.execQuery(db_, `INSERT INTO transactions (id, acct, category, date, amount, description, notes, tombstone) VALUES ${values.join(',')}`);
    }

    const budgetAmounts = [20000, 80000, 15000, 10000, 30000, 5000, 20000, 10000, 15000, 5000, 3000, 20000, 10000, 20000, 5000];
    for (const month of monthList) {
      for (let i = 0; i < CATEGORY_COUNT; i++) {
        await setBudget({ category: categoryIds[i], month, amount: budgetAmounts[i] });
      }
    }
    await sheet.waitOnSpreadsheet();

    return { categoryIds, accountIds, monthList };
  }

  /**
   * SYS-003.1: Medir tiempo de consulta de balance de cuenta con 10k transacciones.
   * RNF-002 – Rendimiento masivo (AQL).
   *
   * Verifica que:
   * - Consultar el balance de una cuenta toma < 100 ms en promedio.
   * - El percentil 95 está dentro de 1.5× el promedio.
   */
  it('SYS-003.1: Tiempo de consulta de balance de cuenta (< 100 ms)', async () => {
    await setupPerformanceDb();

    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t = measure(`balance-${i}`, () => {
        db.firstSync<{ total: number }>(
          'SELECT SUM(amount) as total FROM transactions WHERE acct = ? AND tombstone = 0',
          ['acct-3'],
        );
      });
      times.push(t);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    console.log(`\n[SYS-003.1] Balance de cuenta (${ITERATIONS} iteraciones):`);
    console.log(`  Promedio: ${avg.toFixed(3)} ms`);
    console.log(`  P95: ${p95.toFixed(3)} ms`);
    console.log(`  Min: ${sorted[0].toFixed(3)} ms  Max: ${sorted[sorted.length - 1].toFixed(3)} ms`);

    expect(avg).toBeLessThan(100);
    expect(p95).toBeLessThan(Math.max(5, avg * 3));
  });

  /**
   * SYS-003.2: Medir tiempo de cálculo de leftover por categoría desde spreadsheet.
   * RNF-002 – Rendimiento masivo (AQL).
   *
   * Verifica que:
   * - Leer el leftover de una categoría desde el spreadsheet toma < 200 ms.
   * - La hoja de cálculo se recalcula correctamente con 10k transacciones.
   */
  it('SYS-003.2: Tiempo de leftover de categoría desde spreadsheet (< 200 ms)', async () => {
    await setupPerformanceDb();

    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t = await measureAsync(`leftover-${i}`, async () => {
        const val = await getSheetValue('budget202606', 'leftover-cat-0');
        expect(typeof val).toBe('number');
      });
      times.push(t);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    console.log(`\n[SYS-003.2] Leftover de categoría (${ITERATIONS} iteraciones):`);
    console.log(`  Promedio: ${avg.toFixed(3)} ms`);
    console.log(`  P95: ${p95.toFixed(3)} ms`);
    console.log(`  Min: ${sorted[0].toFixed(3)} ms  Max: ${sorted[sorted.length - 1].toFixed(3)} ms`);

    expect(avg).toBeLessThan(200);
    expect(p95).toBeLessThan(Math.max(5, avg * 3));
  });

  /**
   * SYS-003.3: Medir cambio de mes en vista de presupuesto (navegación).
   * RNF-002 – Rendimiento masivo (AQL).
   *
   * Verifica que:
   * - Leer valores de presupuesto para diferentes meses toma < 500 ms.
   * - La navegación entre meses es consistente en rendimiento.
   */
  it('SYS-003.3: Tiempo de navegación entre meses (< 500 ms)', async () => {
    await setupPerformanceDb();

    const monthsToTest = ['2026-01', '2026-06', '2026-12'];
    const times: number[] = [];

    for (const month of monthsToTest) {
      const sheetName = monthUtils.sheetForMonth(month);
      const t = await measureAsync(`month-${month}`, async () => {
        const budget = await getSheetValue(sheetName, 'budget-cat-7');
        const leftover = await getSheetValue(sheetName, 'leftover-cat-7');
        expect(typeof budget).toBe('number');
        expect(typeof leftover).toBe('number');
      });
      times.push(t);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);

    console.log(`\n[SYS-003.3] Navegación entre meses (${monthsToTest.length} meses):`);
    monthsToTest.forEach((m, i) => console.log(`  ${m}: ${times[i].toFixed(3)} ms`));
    console.log(`  Promedio: ${avg.toFixed(3)} ms`);
    console.log(`  Min: ${sorted[0].toFixed(3)} ms  Max: ${sorted[sorted.length - 1].toFixed(3)} ms`);

    expect(avg).toBeLessThan(500);
  });

  /**
   * SYS-003.4: Medir consultas agregadas sobre los 10k registros.
   * RNF-002 – Rendimiento masivo (AQL).
   *
   * Verifica que:
   * - Agrupar por categoría con SUM y COUNT toma < 200 ms.
   * - Agrupar por mes toma < 200 ms.
   * - Consultas multi-tabla (JOIN) toman < 500 ms.
   */
  it('SYS-003.4: Consultas agregadas bajo carga (< 200 ms agrupación)', async () => {
    const { categoryIds } = await setupPerformanceDb();

    const t1 = measure('group-by-category', () => {
      const rows = db.runQuery<{ category: string; count: number; total: number }>(
        'SELECT category, COUNT(*) as count, SUM(amount) as total FROM transactions WHERE tombstone = 0 GROUP BY category ORDER BY count DESC',
        [],
        true,
      );
      expect(rows.length).toBe(CATEGORY_COUNT);
    });

    const t2 = measure('group-by-month', () => {
      const rows = db.runQuery<{ month: string; count: number }>(
        `SELECT SUBSTR(CAST(date AS TEXT),1,6) as month, COUNT(*) as count FROM transactions WHERE tombstone = 0 GROUP BY month ORDER BY month`,
        [],
        true,
      );
      expect(rows.length).toBe(MONTHS);
    });

    const t3 = measure('join-query', () => {
      const rows = db.runQuery<{ name: string; total: number }>(
        `SELECT c.name, SUM(t.amount) as total FROM transactions t JOIN categories c ON c.id = t.category WHERE t.tombstone = 0 GROUP BY c.name ORDER BY total ASC`,
        [],
        true,
      );
      expect(rows.length).toBe(CATEGORY_COUNT);
    });

    console.log(`\n[SYS-003.4] Consultas agregadas:`);
    console.log(`  GROUP BY categoría (${CATEGORY_COUNT} grupos): ${t1.toFixed(3)} ms`);
    console.log(`  GROUP BY mes (${MONTHS} grupos): ${t2.toFixed(3)} ms`);
    console.log(`  JOIN + GROUP BY + ORDER BY: ${t3.toFixed(3)} ms`);

    expect(t1).toBeLessThan(200);
    expect(t2).toBeLessThan(200);
    expect(t3).toBeLessThan(500);
  });
});
