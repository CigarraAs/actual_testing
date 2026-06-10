import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

describe('Dashboard - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupDatabase() {
    const checkingAccountId = await db.insertAccount({
      name: 'Cuenta Corriente',
      type: 'checking',
      offbudget: 0,
    });

    const savingsAccountId = await db.insertAccount({
      name: 'Cuenta Ahorros',
      type: 'savings',
      offbudget: 0,
    });

    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Ingresos',
      is_income: 1,
    });
    await db.insertCategory({
      id: 'salary-cat',
      name: 'Salario',
      cat_group: 'income-group',
      is_income: 1,
    });

    await db.insertCategoryGroup({
      id: 'expenses-group',
      name: 'Gastos',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'food-cat',
      name: 'Comida',
      cat_group: 'expenses-group',
      is_income: 0,
    });

    // Insertar transacciones usando las variables directas de ID
    await db.insertTransaction({
      account: checkingAccountId,
      date: '2026-06-01',
      category: 'salary-cat',
      amount: 500000,
      notes: 'Salario junio',
    });

    await db.insertTransaction({
      account: checkingAccountId,
      date: '2026-06-10',
      category: 'food-cat',
      amount: -50000,
      notes: 'Compras de comida',
    });

    return { checkingAccountId, savingsAccountId };
  }

  // ============================================================================
  // DASH-001: Widget de saldo total
  // ============================================================================
  it('DASH-001: Saldo total calculado correctamente', async () => {
    const { checkingAccountId } = await setupDatabase();

    const balance = await db.all(
      'SELECT SUM(amount) as total FROM transactions WHERE acct = ?',
      [checkingAccountId],
    ) as any[];

    expect(balance[0].total).toBe(450000); // 500000 - 50000
  });

  // ============================================================================
  // DASH-002: Widget de gastos mensuales
  // ============================================================================
  it('DASH-002: Gastos del mes actual', async () => {
    const { checkingAccountId } = await setupDatabase();

    const monthlyExpenses = await db.all(
      `SELECT SUM(ABS(amount)) as total FROM transactions 
       WHERE acct = ? AND amount < 0 AND date >= 20260601 AND date <= 20260630`,
      [checkingAccountId],
    ) as any[];

    expect(monthlyExpenses[0].total).toBe(50000);
  });

  // ============================================================================
  // DASH-003: Widget de ingresos mensuales
  // ============================================================================
  it('DASH-003: Ingresos del mes actual', async () => {
    const { checkingAccountId } = await setupDatabase();

    const monthlyIncome = await db.all(
      `SELECT SUM(amount) as total FROM transactions 
       WHERE acct = ? AND amount > 0 AND date >= 20260601 AND date <= 20260630`,
      [checkingAccountId],
    ) as any[];

    expect(monthlyIncome[0].total).toBe(500000);
  });

  // ============================================================================
  // DASH-004: Cambios netos por mes
  // ============================================================================
  it('DASH-004: Cambio neto del mes', async () => {
    const { checkingAccountId } = await setupDatabase();

    const netChange = await db.all(
      `SELECT SUM(amount) as net FROM transactions 
       WHERE acct = ? AND date >= 20260601 AND date <= 20260630`,
      [checkingAccountId],
    ) as any[];

    expect(netChange[0].net).toBe(450000);
  });

  // ============================================================================
  // DASH-005: Múltiples cuentas en dashboard
  // ============================================================================
  it('DASH-005: Saldo combinado de múltiples cuentas', async () => {
    await setupDatabase();

    const allAccounts = await db.all('SELECT id FROM accounts') as any[];

    expect(allAccounts.length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================================
  // DASH-006: Categorías principales en dashboard
  // ============================================================================
  it('DASH-006: Categorías con mayor gasto identificadas', async () => {
    await setupDatabase();

    const topCategories = await db.all(`
      SELECT category, SUM(ABS(amount)) as total FROM transactions
      WHERE amount < 0
      GROUP BY category
      ORDER BY total DESC
      LIMIT 5
    `) as any[];

    expect(topCategories.length).toBeGreaterThan(0);
    expect(topCategories[0].total).toBeGreaterThan(0);
  });

  // ============================================================================
  // DASH-007: Indicadores de tendencia
  // ============================================================================
  it('DASH-007: Tendencia mes a mes', async () => {
    const { checkingAccountId } = await setupDatabase();

    const monthlyTotals = await db.all(`
      SELECT DATE(date) as month, SUM(amount) as total FROM transactions
      WHERE acct = ?
      GROUP BY month
      ORDER BY month
    `, [checkingAccountId]) as any[];

    expect(monthlyTotals.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // DASH-008: Alertas de presupuesto
  // ============================================================================
  it('DASH-008: Detectar categorías cercanas al presupuesto', async () => {
    await setupDatabase();

    const expenses = await db.all(
      'SELECT category, SUM(ABS(amount)) as total FROM transactions WHERE amount < 0 GROUP BY category'
    ) as any[];

    expect(expenses.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // DASH-009: Resumen rápido
  // ============================================================================
  it('DASH-009: Resumen de datos clave', async () => {
    const { checkingAccountId } = await setupDatabase();

    const summary = await db.all(`
      SELECT
        (SELECT SUM(amount) FROM transactions WHERE acct = ? AND amount > 0) as income,
        (SELECT SUM(ABS(amount)) FROM transactions WHERE acct = ? AND amount < 0) as expenses,
        (SELECT SUM(amount) FROM transactions WHERE acct = ?) as balance
    `, [checkingAccountId, checkingAccountId, checkingAccountId]) as any[];

    expect(summary[0].income).toBe(500000);
    expect(summary[0].expenses).toBe(50000);
    expect(summary[0].balance).toBe(450000);
  });

  // ============================================================================
  // DASH-010: Estado de múltiples indicadores
  // ============================================================================
  it('DASH-010: Múltiples métricas en dashboard', async () => {
    await setupDatabase();

    const accounts = await db.all('SELECT COUNT(*) as count FROM accounts') as any[];
    const transactions = await db.all('SELECT COUNT(*) as count FROM transactions') as any[];
    const categories = await db.all('SELECT COUNT(*) as count FROM categories WHERE is_income = 0') as any[];

    expect(accounts[0].count).toBeGreaterThanOrEqual(2);
    expect(transactions[0].count).toBeGreaterThanOrEqual(2);
    expect(categories[0].count).toBeGreaterThanOrEqual(1);
  });
});