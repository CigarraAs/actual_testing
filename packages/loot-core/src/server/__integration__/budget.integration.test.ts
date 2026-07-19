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
    await db.insertCategory({
      id: 'rent-cat',
      name: 'Rent',
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

  // ========================================================================
  // F05 – transferCategory
  // ========================================================================

  /**
   * INT-BUD-05: Transferir fondos entre dos categorías (F05 transferCategory).
   * Tarea: S3-F3.2-05 — F05 transferCategory
   *
   * Verifica que:
   * - El presupuesto de la categoría origen disminuye en el monto transferido.
   * - El presupuesto de la categoría destino aumenta en el monto transferido.
   * - Se registra una nota de movimiento en la tabla notes.
   */
  it('INT-BUD-05: Transferir fondos entre dos categorías', async () => {
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
      category: 'rent-cat',
      month: '2026-06',
      amount: 80000,
    });
    await sheet.waitOnSpreadsheet();

    await runHandler(handlers['budget/transfer-category'], {
      month: '2026-06',
      amount: 15000,
      from: 'groceries-cat',
      to: 'rent-cat',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const groceries = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    const rent = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'rent-cat'`,
    );
    expect(groceries?.amount).toBe(35000); // 50000 - 15000
    expect(rent?.amount).toBe(95000); // 80000 + 15000

    const note = await db.first<{ note: string }>(
      `SELECT note FROM notes WHERE id = ?`,
      ['budget-2026-06'],
    );
    expect(note).toBeDefined();
    expect(note?.note).toContain('Groceries');
    expect(note?.note).toContain('Rent');
  });

  /**
   * INT-BUD-06: Transferir fondos de una categoría hacia "To Budget"
   * (F05 transferCategory).
   * Tarea: S3-F3.2-05 — F05 transferCategory
   *
   * Verifica que:
   * - El presupuesto de la categoría origen disminuye.
   * - No se modifica ninguna categoría destino (el dinero vuelve al disponible).
   * - Se registra la nota de movimiento con destino "To Budget".
   */
  it('INT-BUD-06: Transferir fondos de categoría hacia "To Budget"', async () => {
    await setupBudgetEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 40000,
    });
    await sheet.waitOnSpreadsheet();

    await runHandler(handlers['budget/transfer-category'], {
      month: '2026-06',
      amount: 10000,
      from: 'groceries-cat',
      to: 'to-budget',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const groceries = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    expect(groceries?.amount).toBe(30000); // 40000 - 10000

    const note = await db.first<{ note: string }>(
      `SELECT note FROM notes WHERE id = ?`,
      ['budget-2026-06'],
    );
    expect(note).toBeDefined();
    expect(note?.note).toContain('To Budget');
  });

  /**
   * INT-BUD-07: Transferir monto cero no altera los presupuestos
   * (F05 transferCategory).
   * Tarea: S3-F3.2-05 — F05 transferCategory
   *
   * Verifica que transferir 0 no modifica los montos presupuestados.
   */
  it('INT-BUD-07: Transferir monto cero no altera los presupuestos', async () => {
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
      category: 'rent-cat',
      month: '2026-06',
      amount: 80000,
    });
    await sheet.waitOnSpreadsheet();

    await runHandler(handlers['budget/transfer-category'], {
      month: '2026-06',
      amount: 0,
      from: 'groceries-cat',
      to: 'rent-cat',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const groceries = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    const rent = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'rent-cat'`,
    );
    expect(groceries?.amount).toBe(50000); // sin cambios
    expect(rent?.amount).toBe(80000); // sin cambios
  });

  // ========================================================================
  // F06 – holdForNextMonth
  // ========================================================================

  async function setupHoldEnv() {
    await setupBudgetEnv();
    await db.insertAccount({
      id: 'checking',
      name: 'Checking',
      offbudget: 0,
    });
  }

  /**
   * INT-BUD-08: Reservar fondos para el mes siguiente con fondos suficientes
   * (F06 holdForNextMonth).
   * Tarea: S3-F3.2-06 — F06 holdForNextMonth
   *
   * Verifica que:
   * - Al existir fondos disponibles (to-budget > 0), la función retorna true.
   * - El buffer se actualiza en zero_budget_months con el monto reservado.
   */
  it('INT-BUD-08: Reservar fondos exitosamente con to-budget positivo', async () => {
    await setupHoldEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await db.insertTransaction({
      id: 'txn-income',
      account: 'checking',
      category: 'salary-cat',
      date: '2026-06-15',
      amount: 200000,
    });
    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });
    await sheet.waitOnSpreadsheet();

    const result = await runHandler(
      handlers['budget/hold-for-next-month'],
      { month: '2026-06', amount: 20000 },
    );
    expect(result).toBe(true);

    const monthRow = await db.first<{ buffered: number }>(
      `SELECT buffered FROM zero_budget_months WHERE id = ?`,
      ['2026-06'],
    );
    expect(monthRow?.buffered).toBe(20000);
  });

  /**
   * INT-BUD-09: Intentar reservar sin fondos disponibles (to-budget <= 0)
   * (F06 holdForNextMonth).
   * Tarea: S3-F3.2-06 — F06 holdForNextMonth
   *
   * Verifica que:
   * - Cuando to-budget es 0 (sin ingresos y con gasto presupuestado),
   *   la función retorna false.
   * - El buffer no se crea en zero_budget_months.
   */
  it('INT-BUD-09: holdForNextMonth retorna false si to-budget es 0', async () => {
    await setupBudgetEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });
    await sheet.waitOnSpreadsheet();

    const result = await runHandler(
      handlers['budget/hold-for-next-month'],
      { month: '2026-06', amount: 20000 },
    );
    expect(result).toBe(false);

    const monthRow = await db.first<{ buffered: number }>(
      `SELECT buffered FROM zero_budget_months WHERE id = ?`,
      ['2026-06'],
    );
    expect(monthRow).toBeNull();
  });

  /**
   * INT-BUD-10: Reservar monto mayor al disponible — calcBufferedAmount
   * trunca al to-budget máximo (F06 holdForNextMonth).
   * Tarea: S3-F3.2-06 — F06 holdForNextMonth
   *
   * Verifica que:
   * - Si se solicita reservar más de lo disponible, calcBufferedAmount
   *   trunca el monto al to-budget.
   * - El buffer se establece al máximo posible (to-budget = ingreso - gasto).
   */
  it('INT-BUD-10: Reservar monto mayor al disponible trunca al máximo', async () => {
    await setupHoldEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await db.insertTransaction({
      id: 'txn-income',
      account: 'checking',
      category: 'salary-cat',
      date: '2026-06-15',
      amount: 100000,
    });
    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });
    await sheet.waitOnSpreadsheet();

    const result = await runHandler(
      handlers['budget/hold-for-next-month'],
      { month: '2026-06', amount: 100000 },
    );
    expect(result).toBe(true);

    const monthRow = await db.first<{ buffered: number }>(
      `SELECT buffered FROM zero_budget_months WHERE id = ?`,
      ['2026-06'],
    );
    expect(monthRow?.buffered).toBe(50000);
  });

  // ========================================================================
  // F07 – coverOverspending
  // ========================================================================

  async function setupCoverEnv() {
    await setupBudgetEnv();
    await db.insertAccount({
      id: 'checking',
      name: 'Checking',
      offbudget: 0,
    });
  }

  /**
   * INT-BUD-11: Cubrir sobregasto desde otra categoría con fondos suficientes
   * (F07 coverOverspending).
   * Tarea: S3-F3.2-07 — F07 coverOverspending
   *
   * Verifica que:
   * - El presupuesto de la categoría sobregastada (to) aumenta con el monto cubierto.
   * - El presupuesto de la categoría fuente (from) disminuye en el monto cubierto.
   * - Se registran notas de movimiento.
   */
  it('INT-BUD-11: Cubrir sobregasto desde otra categoría con fondos suficientes', async () => {
    await setupCoverEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });
    await runHandler(handlers['budget/budget-amount'], {
      category: 'rent-cat',
      month: '2026-06',
      amount: 80000,
    });
    await sheet.waitOnSpreadsheet();

    await db.insertTransaction({
      id: 'txn-spend',
      account: 'checking',
      category: 'groceries-cat',
      date: '2026-06-10',
      amount: -70000,
    });
    await sheet.waitOnSpreadsheet();

    await runHandler(handlers['budget/cover-overspending'], {
      month: '2026-06',
      to: 'groceries-cat',
      from: 'rent-cat',
      amount: 10000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const groceries = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    const rent = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'rent-cat'`,
    );
    expect(groceries?.amount).toBe(60000); // 50000 + 10000
    expect(rent?.amount).toBe(70000); // 80000 - 10000

    const note = await db.first<{ note: string }>(
      `SELECT note FROM notes WHERE id = ?`,
      ['budget-2026-06'],
    );
    expect(note).toBeDefined();
    expect(note?.note).toContain('Groceries');
    expect(note?.note).toContain('Rent');
  });

  /**
   * INT-BUD-12: Cubrir sobregasto desde "To Budget"
   * (F07 coverOverspending).
   * Tarea: S3-F3.2-07 — F07 coverOverspending
   *
   * Verifica que:
   * - El presupuesto de la categoría sobregastada aumenta.
   * - No se descuenta de ninguna categoría (el dinero sale del disponible).
   * - Se registra nota de movimiento con origen "To Budget".
   */
  it('INT-BUD-12: Cubrir sobregasto desde "To Budget"', async () => {
    await setupCoverEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await db.insertTransaction({
      id: 'txn-income',
      account: 'checking',
      category: 'salary-cat',
      date: '2026-06-15',
      amount: 100000,
    });
    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });
    await sheet.waitOnSpreadsheet();

    await db.insertTransaction({
      id: 'txn-spend',
      account: 'checking',
      category: 'groceries-cat',
      date: '2026-06-10',
      amount: -70000,
    });
    await sheet.waitOnSpreadsheet();

    await runHandler(handlers['budget/cover-overspending'], {
      month: '2026-06',
      to: 'groceries-cat',
      from: 'to-budget',
      amount: 10000,
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const groceries = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    expect(groceries?.amount).toBe(60000); // 50000 + 10000

    const note = await db.first<{ note: string }>(
      `SELECT note FROM notes WHERE id = ?`,
      ['budget-2026-06'],
    );
    expect(note).toBeDefined();
    expect(note?.note).toContain('To Budget');
    expect(note?.note).toContain('Groceries');
  });

  /**
   * INT-BUD-13: Cubrir sobregasto con fondos insuficientes en origen
   * (F07 coverOverspending).
   * Tarea: S3-F3.2-07 — F07 coverOverspending
   *
   * Verifica que:
   * - coverableAmount se trunca al leftover disponible de la categoría fuente.
   * - Solo se cubre el monto que la fuente puede aportar (no se excede).
   */
  it('INT-BUD-13: Cubrir sobregasto limitado por fondos insuficientes en origen', async () => {
    await setupCoverEnv();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'envelope')`,
    );

    await runHandler(handlers['budget/budget-amount'], {
      category: 'groceries-cat',
      month: '2026-06',
      amount: 50000,
    });
    await runHandler(handlers['budget/budget-amount'], {
      category: 'rent-cat',
      month: '2026-06',
      amount: 20000,
    });
    await sheet.waitOnSpreadsheet();

    await db.insertTransaction({
      id: 'txn-spend',
      account: 'checking',
      category: 'groceries-cat',
      date: '2026-06-10',
      amount: -100000,
    });
    await sheet.waitOnSpreadsheet();

    await runHandler(handlers['budget/cover-overspending'], {
      month: '2026-06',
      to: 'groceries-cat',
      from: 'rent-cat',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();

    const groceries = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'groceries-cat'`,
    );
    const rent = await db.first<{ amount: number }>(
      `SELECT amount FROM zero_budgets WHERE month = 202606 AND category = 'rent-cat'`,
    );
    expect(groceries?.amount).toBe(70000); // 50000 + min(50000, 20000) = 70000
    expect(rent?.amount).toBe(0); // 20000 - 20000 = 0
  });
});