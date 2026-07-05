// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';
import { handlers } from '../main';
import { runHandler } from '../mutators';
import * as budget from '../budget/base';

describe('Budget Integration Tests', () => {
  beforeEach(global.emptyDatabase());

  async function setupBudgetEnv() {
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });
    await db.insertCategory({
      id: 'salary-cat',
      name: 'Salary',
      cat_group: 'income-group',
      is_income: 1,
    });
    await db.insertCategoryGroup({
      id: 'expense-group',
      name: 'Expenses',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'groceries-cat',
      name: 'Groceries',
      cat_group: 'expense-group',
      is_income: 0,
    });
    await sheet.loadSpreadsheet(db);
    await budget.createBudget(['2026-06']);
  }

  /**
   * INT-BUD-01: Asignar presupuesto en modo Envelope (F04 setBudget).
   * Tarea: S3-F3.2-04 — F04 setBudget
   *
   * Verifica que:
   * - El presupuesto se persiste en la tabla zero_budgets cuando el modo es envelope.
   * - El monto, categoría y mes se guardan correctamente.
   */
  it('INT-BUD-01: Asignar presupuesto en modo Envelope (nueva categoría)', async () => {
    await setupBudgetEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });

    const row = await db.first<{
      amount: number;
      category: string;
      month: number;
    }>(
      `SELECT * FROM zero_budgets WHERE month = ? AND category = ?`,
      [202606, 'groceries-cat'],
    );
    expect(row).toBeDefined();
    expect(row?.amount).toBe(50000);
    expect(row?.category).toBe('groceries-cat');
    expect(row?.month).toBe(202606);
  });

  /**
   * INT-BUD-02: Asignar presupuesto en modo Tracking (F04 setBudget).
   * Tarea: S3-F3.2-04 — F04 setBudget
   *
   * Verifica que:
   * - El presupuesto se persiste en reflect_budgets cuando el modo es tracking.
   * - La tabla zero_budgets NO contiene el registro para esa categoría/mes.
   */
  it('INT-BUD-02: Asignar presupuesto en modo Tracking', async () => {
    await setupBudgetEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'tracking')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 300000,
    });

    const trackingRow = await db.first<{ amount: number }>(
      `SELECT amount FROM reflect_budgets WHERE month = ? AND category = ?`,
      [202606, 'groceries-cat'],
    );
    expect(trackingRow).toBeDefined();
    expect(trackingRow?.amount).toBe(300000);

    const zeroCount = await db.first<{ count: number }>(
      `SELECT COUNT(*) as count FROM zero_budgets WHERE category = 'groceries-cat' AND month = 202606`,
    );
    expect(zeroCount?.count).toBe(0);
  });

  /**
   * INT-BUD-03: Actualizar presupuesto existente (UPDATE en vez de INSERT).
   * Tarea: S3-F3.2-04 — F04 setBudget
   *
   * Verifica que cuando ya existe un registro para la misma categoría y mes,
   * el monto se actualiza en lugar de insertar un duplicado.
   */
  it('INT-BUD-03: Actualizar presupuesto existente en vez de insertar duplicado', async () => {
    await setupBudgetEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 75000,
    });

    const row = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    expect(row?.amount).toBe(75000);

    const count = await db.first<{ count: number }>(
      `SELECT COUNT(*) as count FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    expect(count?.count).toBe(1);
  });

  /**
   * INT-BUD-04: safeNumber normaliza monto null a 0.
   * Tarea: S3-F3.2-04 — F04 setBudget
   *
   * Verifica que un valor null se normaliza a 0 mediante safeNumber.
   */
  it('INT-BUD-04: safeNumber normaliza null a 0', async () => {
    await setupBudgetEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: null,
    });

    const row = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    expect(row?.amount).toBe(0);
  });
});
