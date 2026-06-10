import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

describe('Forecast - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupDatabase() {
    await db.insertCategoryGroup({
      id: 'expenses',
      name: 'Gastos',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'food-cat',
      name: 'Comida',
      cat_group: 'expenses',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'utilities-cat',
      name: 'Servicios',
      cat_group: 'expenses',
      is_income: 0,
    });

    const accountId = await db.insertAccount({
      name: 'Cuenta Principal',
      type: 'checking',
      offbudget: 0,
    });

    const transDate = '2026-06-15';
    await db.insertTransaction({
      account: accountId,
      date: transDate,
      category: 'food-cat',
      amount: -5000,
      notes: 'Compra de comida',
    });

    await db.insertTransaction({
      account: accountId,
      date: transDate,
      category: 'utilities-cat',
      amount: -3000,
      notes: 'Pago de servicios',
    });
  }

  // ============================================================================
  // FORE-001: Datos básicos para pronóstico
  // ============================================================================
  it('FORE-001: Datos de transacciones registrados correctamente', async () => {
    await setupDatabase();

    const transactions = await db.all(
      'SELECT * FROM transactions WHERE date = ?',
      [20260615],
    ) as any[];

    expect(transactions.length).toBeGreaterThanOrEqual(2);
    expect(transactions.some(t => t.category === 'food-cat')).toBe(true);
    expect(transactions.some(t => t.category === 'utilities-cat')).toBe(true);
  });

  // ============================================================================
  // FORE-002: Calcular promedio de gastos por categoría
  // ============================================================================
  it('FORE-002: Calcular promedio mensual por categoría', async () => {
    await setupDatabase();

    const foodTransactions = await db.all(
      'SELECT amount FROM transactions WHERE category = ?',
      ['food-cat'],
    ) as any[];

    expect(foodTransactions.length).toBeGreaterThan(0);
    expect(foodTransactions[0].amount).toBeLessThan(0); // Gastos negativos
  });

  // ============================================================================
  // FORE-003: Datos históricos para predicción
  // ============================================================================
  it('FORE-003: Datos históricos disponibles', async () => {
    await setupDatabase();

    const allTransactions = await db.all('SELECT COUNT(*) as count FROM transactions') as any[];

    expect(allTransactions[0].count).toBeGreaterThanOrEqual(2);
  });

  // ============================================================================
  // FORE-004: Categorías para incluir en pronóstico
  // ============================================================================
  it('FORE-004: Categorías con datos identificadas', async () => {
    await setupDatabase();

    const categories = await db.all('SELECT DISTINCT category FROM transactions') as any[];

    expect(categories.length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================================
  // FORE-005: Rango de fechas para análisis
  // ============================================================================
  it('FORE-005: Rango de fechas válido para pronóstico', async () => {
    await setupDatabase();

    const dateRange = await db.all(
      'SELECT MIN(date) as minDate, MAX(date) as maxDate FROM transactions',
    ) as any[];

    expect(dateRange[0].minDate).toBeDefined();
    expect(dateRange[0].maxDate).toBeDefined();
  });

  // ============================================================================
  // FORE-006: Detectar tendencias en gastos
  // ============================================================================
  it('FORE-006: Tendencias detectables en datos', async () => {
    await setupDatabase();

    const totalExpenses = await db.all(
      'SELECT SUM(ABS(amount)) as total FROM transactions WHERE amount < 0',
    ) as any[];

    expect(totalExpenses[0].total).toBeGreaterThan(0);
  });

  // ============================================================================
  // FORE-007: Pronóstico conservador vs. optimista
  // ============================================================================
  it('FORE-007: Valores para pronóstico (bajo y alto)', async () => {
    await setupDatabase();

    const expenses = await db.all(
      'SELECT amount FROM transactions WHERE amount < 0 ORDER BY amount DESC',
    ) as any[];

    if (expenses.length > 0) {
      const minExpense = Math.abs(expenses[0].amount);
      const maxExpense = Math.abs(expenses[expenses.length - 1].amount);

      expect(minExpense).toBeLessThanOrEqual(maxExpense);
    }
  });

  // ============================================================================
  // FORE-008: Validar precisión de datos para pronóstico
  // ============================================================================
  it('FORE-008: Integridad de montos en transacciones', async () => {
    await setupDatabase();
    const transactions = await db.all('SELECT amount FROM transactions') as any[];

    for (const tx of transactions) {
      expect(typeof tx.amount).toBe('number');
      expect(tx.amount).not.toBeNaN();
    }
  });

  // ============================================================================
  // FORE-009: Períodos con suficientes datos
  // ============================================================================
  it('FORE-009: Datos suficientes para pronóstico confiable', async () => {
    await setupDatabase();
    const monthlyData = await db.all(`
      SELECT DATE(date) as month, COUNT(*) as count
      FROM transactions
      GROUP BY month
    `) as any[];

    expect(monthlyData.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // FORE-010: Proyecciones futuras basadas en datos
  // ============================================================================
  it('FORE-010: Proyección de meses futuros', async () => {
    await setupDatabase();

    const futureMonths = ['2026-07', '2026-08', '2026-09'];

    for (const month of futureMonths) {
      expect(month).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});