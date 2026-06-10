import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

describe('Reports - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupDatabase() {
    const account = await db.insertAccount({
      name: 'Cuenta Principal',
      type: 'checking',
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
    await db.insertCategory({
      id: 'transport-cat',
      name: 'Transporte',
      cat_group: 'expenses-group',
      is_income: 0,
    });

    // Datos para los últimos 3 meses
    const transactions = [
      { date: '2026-04-15', category: 'salary-cat', amount: 500000 },
      { date: '2026-04-20', category: 'food-cat', amount: -30000 },
      { date: '2026-04-25', category: 'transport-cat', amount: -20000 },
      { date: '2026-05-10', category: 'salary-cat', amount: 500000 },
      { date: '2026-05-18', category: 'food-cat', amount: -35000 },
      { date: '2026-05-22', category: 'transport-cat', amount: -22000 },
      { date: '2026-06-05', category: 'salary-cat', amount: 500000 },
      { date: '2026-06-12', category: 'food-cat', amount: -40000 },
      { date: '2026-06-20', category: 'transport-cat', amount: -25000 },
    ];

    for (const tx of transactions) {
      await db.insertTransaction({
        account: account,
        date: tx.date,
        category: tx.category,
        amount: tx.amount,
        notes: `Transacción ${tx.date}`,
      });
    }

    return account;
  }

  // ============================================================================
  // REP-001: Reporte de ingresos vs. gastos
  // ============================================================================
  it('REP-001: Reporte mensual de ingresos vs gastos', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]" al final de la consulta SQL
    const report = await db.all(`
      SELECT
        SUBSTR(date, 1, 6) as month,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses
      FROM transactions
      WHERE acct = ?
      GROUP BY month
      ORDER BY month
    `, [account]) as any[];

    expect(report.length).toBe(3); // 3 meses
    expect(report[0].income).toBe(500000);
  });

  // ============================================================================
  // REP-002: Reporte por categoría
  // ============================================================================
  it('REP-002: Desglose de gastos por categoría', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]" para que TypeScript reconozca la columna .total
    const report = await db.all(`
      SELECT category, SUM(ABS(amount)) as total
      FROM transactions
      WHERE acct = ? AND amount < 0
      GROUP BY category
      ORDER BY total DESC
    `, [account]) as any[];

    expect(report.length).toBeGreaterThanOrEqual(2);
    expect(report[0].total).toBeGreaterThan(0);
  });

  // ============================================================================
  // REP-003: Tendencia de gastos
  // ============================================================================
  it('REP-003: Tendencia creciente/decreciente de gastos', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const monthlySpendings = await db.all(`
      SELECT SUBSTR(date, 1, 6) as month, SUM(ABS(amount)) as total
      FROM transactions
      WHERE acct = ? AND amount < 0
      GROUP BY month
      ORDER BY month
    `, [account]) as any[];

    expect(monthlySpendings.length).toBe(3);

    // Verificar que hay tendencia (aumenta cada mes)
    const april = monthlySpendings[0].total;
    const may = monthlySpendings[1].total;
    const june = monthlySpendings[2].total;

    expect(april).toBeLessThan(may);
    expect(may).toBeLessThan(june);
  });

  // ============================================================================
  // REP-004: Comparativa mes a mes
  // ============================================================================
  it('REP-004: Comparativa de meses consecutivos', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const aprilMay = await db.all(`
      SELECT
        SUM(CASE WHEN date >= 20260401 AND date <= 20260430 AND amount < 0 THEN ABS(amount) ELSE 0 END) as april,
        SUM(CASE WHEN date >= 20260501 AND date <= 20260531 AND amount < 0 THEN ABS(amount) ELSE 0 END) as may
      FROM transactions
      WHERE acct = ?
    `, [account]) as any[];

    expect(aprilMay[0].april).toBe(50000);
    expect(aprilMay[0].may).toBe(57000);
  });

  // ============================================================================
  // REP-005: Reporte de saldo acumulativo
  // ============================================================================
  it('REP-005: Saldo acumulativo por período', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const cumulativeBalance = await db.all(`
      SELECT SUBSTR(date, 1, 6) as month, SUM(amount) as balance
      FROM transactions
      WHERE acct = ?
      GROUP BY month
      ORDER BY month
    `, [account]) as any[];

    expect(cumulativeBalance.length).toBe(3);

    // Cada mes debe ser positivo (ingresos > gastos)
    for (const row of cumulativeBalance) {
      expect(row.balance).toBeGreaterThan(0);
    }
  });

  // ============================================================================
  // REP-006: Categoría con mayor gasto
  // ============================================================================
  it('REP-006: Identificar categoría de mayor gasto', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const topCategory = await db.all(`
      SELECT category, SUM(ABS(amount)) as total
      FROM transactions
      WHERE acct = ? AND amount < 0
      GROUP BY category
      ORDER BY total DESC
      LIMIT 1
    `, [account]) as any[];

    expect(topCategory[0].category).toBe('food-cat');
    expect(topCategory[0].total).toBe(105000); // 30000 + 35000 + 40000
  });

  // ============================================================================
  // REP-007: Porcentaje de gasto por categoría
  // ============================================================================
  it('REP-007: Porcentaje de distribución de gastos', async () => {
    const account = await setupDatabase();

    const totalExpenses = await db.all(
      'SELECT SUM(ABS(amount)) as total FROM transactions WHERE acct = ? AND amount < 0',
      [account]
    ) as any[];

    // SOLUCIÓN: Agregamos "as any[]"
    const distribution = await db.all(`
      SELECT category, 
             SUM(ABS(amount)) as amount,
             ROUND(100.0 * SUM(ABS(amount)) / ?, 2) as percentage
      FROM transactions
      WHERE acct = ? AND amount < 0
      GROUP BY category
    `, [totalExpenses[0].total, account]) as any[];

    expect(distribution.length).toBeGreaterThanOrEqual(2);

    // Validar que los porcentajes sumen ~100%
    const totalPercent = distribution.reduce((sum, d) => sum + d.percentage, 0);
    expect(totalPercent).toBeCloseTo(100, 1);
  });

  // ============================================================================
  // REP-008: Promedio de gasto mensual
  // ============================================================================
  it('REP-008: Promedio mensual de gastos', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const avgExpense = await db.all(`
      SELECT AVG(monthly_expenses) as average
      FROM (
        SELECT SUBSTR(date, 1, 6) as month, SUM(ABS(amount)) as monthly_expenses
        FROM transactions
        WHERE acct = ? AND amount < 0
        GROUP BY month
      ) as monthly
    `, [account]) as any[];

    expect(avgExpense[0].average).toBeCloseTo(57333.33, 1);
  });

  // ============================================================================
  // REP-009: Variabilidad de gastos
  // ============================================================================
  it('REP-009: Identificar variabilidad en categorías', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const variability = await db.all(`
      SELECT category,
             AVG(ABS(amount)) as avg_amount,
             MAX(ABS(amount)) as max_amount,
             MIN(ABS(amount)) as min_amount
      FROM transactions
      WHERE acct = ? AND amount < 0
      GROUP BY category
    `, [account]) as any[];

    for (const row of variability) {
      expect(row.avg_amount).toBeGreaterThan(0);
      expect(row.max_amount).toBeGreaterThanOrEqual(row.avg_amount);
      expect(row.min_amount).toBeLessThanOrEqual(row.avg_amount);
    }
  });

  // ============================================================================
  // REP-010: Resumen ejecutivo
  // ============================================================================
  it('REP-010: Resumen ejecutivo trimestral', async () => {
    const account = await setupDatabase();

    // SOLUCIÓN: Agregamos "as any[]"
    const executive = await db.all(`
      SELECT
        COUNT(*) as transactions,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_expenses,
        SUM(amount) as net_balance
      FROM transactions
      WHERE acct = ?
    `, [account]) as any[];

    expect(executive[0].transactions).toBe(9);
    expect(executive[0].total_income).toBe(1500000);
    expect(executive[0].total_expenses).toBe(172000);
    expect(executive[0].net_balance).toBe(1328000);
  });
});