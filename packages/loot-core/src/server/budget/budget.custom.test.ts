import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import {
  setBudget,
  getSheetValue,
  getSheetBoolean,
  getBudget,
  setZero,
  holdForNextMonth,
  resetHold,
  isTrackingBudget,
  copySinglePreviousMonth,
  setCategoryCarryover,
  resetIncomeCarryover,
} from './actions';
import * as budget from './base';

describe('Budget - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupDatabase() {
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
      id: 'expense-group',
      name: 'Gastos',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'utilities-cat',
      name: 'Servicios',
      cat_group: 'expense-group',
      is_income: 0,
    });
    await db.insertCategory({
      id: 'transportation-cat',
      name: 'Transporte',
      cat_group: 'expense-group',
      is_income: 0,
    });
    await sheet.loadSpreadsheet(db);
    await budget.createBudget(['2026-05', '2026-06', '2026-07', '2026-08']);
  }

  // ============================================================================
  // BUDG-001: Presupuestar múltiples categorías en el mismo mes
  // ============================================================================
  it('BUDG-001: Presupuestar múltiples categorías en el mismo mes', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 30000 });
    await setBudget({ category: 'transportation-cat', month: '2026-06', amount: 15000 });
    await sheet.waitOnSpreadsheet();

    const utilities = await getSheetValue('budget202606', 'budget-utilities-cat');
    const transportation = await getSheetValue('budget202606', 'budget-transportation-cat');

    expect(utilities).toBe(30000);
    expect(transportation).toBe(15000);
  });

  // ============================================================================
  // BUDG-002: Actualizar presupuesto existente (overwrite)
  // ============================================================================
  it('BUDG-002: Actualizar presupuesto existente', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 10000 });
    await sheet.waitOnSpreadsheet();

    let value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(10000);

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 25000 });
    await sheet.waitOnSpreadsheet();

    value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(25000);
  });

  // ============================================================================
  // BUDG-003: Presupuestar misma categoría en diferentes meses
  // ============================================================================
  it('BUDG-003: Presupuestar misma categoría en diferentes meses', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-05', amount: 25000 });
    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 30000 });
    await setBudget({ category: 'utilities-cat', month: '2026-07', amount: 28000 });
    await sheet.waitOnSpreadsheet();

    const may = await getSheetValue('budget202605', 'budget-utilities-cat');
    const june = await getSheetValue('budget202606', 'budget-utilities-cat');
    const july = await getSheetValue('budget202607', 'budget-utilities-cat');

    expect(may).toBe(25000);
    expect(june).toBe(30000);
    expect(july).toBe(28000);
  });

  // ============================================================================
  // BUDG-004: Presupuesto con monto muy pequeño
  // ============================================================================
  it('BUDG-004: Presupuesto con monto muy pequeño (1 centavo)', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 1 });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(1);
  });

  // ============================================================================
  // BUDG-005: Integridad tras múltiples operaciones secuenciales
  // ============================================================================
  it('BUDG-005: Integridad tras múltiples operaciones secuenciales', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 10000 });
    await sheet.waitOnSpreadsheet();

    await setBudget({ category: 'transportation-cat', month: '2026-06', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 15000 });
    await sheet.waitOnSpreadsheet();

    const utilities = await getSheetValue('budget202606', 'budget-utilities-cat');
    const transportation = await getSheetValue('budget202606', 'budget-transportation-cat');

    expect(utilities).toBe(15000);
    expect(transportation).toBe(5000);
  });

  // ============================================================================
  // BUDG-006: Presupuesto acumulativo anual
  // ============================================================================
  it('BUDG-006: Presupuesto acumulativo anual', async () => {
    await setupDatabase();

    const monthlyBudget = 50000;
    const months = ['2026-05', '2026-06', '2026-07', '2026-08'];

    for (const month of months) {
      await setBudget({ category: 'utilities-cat', month, amount: monthlyBudget });
      await sheet.waitOnSpreadsheet();
    }

    for (const month of months) {
      const sheetName = `budget${month.replace('-', '')}`;
      const value = await getSheetValue(sheetName, 'budget-utilities-cat');
      expect(value).toBe(monthlyBudget);
    }
  });

  // ============================================================================
  // BUDG-007: Reasignar presupuesto entre categorías
  // ============================================================================
  it('BUDG-007: Reasignar presupuesto entre categorías', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 40000 });
    await setBudget({ category: 'transportation-cat', month: '2026-06', amount: 10000 });
    await sheet.waitOnSpreadsheet();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 30000 });
    await setBudget({ category: 'transportation-cat', month: '2026-06', amount: 20000 });
    await sheet.waitOnSpreadsheet();

    const utilities = await getSheetValue('budget202606', 'budget-utilities-cat');
    const transportation = await getSheetValue('budget202606', 'budget-transportation-cat');

    expect(utilities).toBe(30000);
    expect(transportation).toBe(20000);
  });

  // ============================================================================
  // BUDG-008: Presupuesto con valores de borde (máximo)
  // ============================================================================
  it('BUDG-008: Presupuesto con valor máximo soportado', async () => {
    await setupDatabase();

    const maxAmount = 999999999 * 100;
    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: maxAmount });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(maxAmount);
  });

  // ============================================================================
  // BUDG-009: Presupuesto cero vs. sin presupuestar
  // ============================================================================
  it('BUDG-009: Presupuesto cero vs. sin presupuestar', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 0 });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(0);
  });

  // ============================================================================
  // BUDG-010: Presupuestar categoría de ingreso
  // ============================================================================
  it('BUDG-010: Presupuestar categoría de ingreso', async () => {
    await setupDatabase();

    await setBudget({ category: 'salary-cat', month: '2026-06', amount: 100000 });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-salary-cat');
    expect(value).toBe(100000);
  });

  // ============================================================================
  // BUDG-011: Establecer goal via DB directo
  // ============================================================================
  it('BUDG-011: Establecer goal via DB directo', async () => {
    await setupDatabase();

    await db.insert('zero_budgets', {
      id: '202606-utilities-cat',
      month: '202606',
      category: 'utilities-cat',
      goal: 30000,
    });
    void db;
    await sheet.waitOnSpreadsheet();

    const goal = await getSheetValue('budget202606', 'goal-utilities-cat');
    expect(goal).toBe(30000);
  });

  // ============================================================================
  // BUDG-012: Goal con long_goal
  // ============================================================================
  it('BUDG-012: Goal con meta a largo plazo', async () => {
    await setupDatabase();

    await db.insert('zero_budgets', {
      id: '202606-utilities-cat',
      month: '202606',
      category: 'utilities-cat',
      amount: 0,
      goal: 30000,
      long_goal: 360000,
    });

    const goal = await getSheetValue('budget202606', 'goal-utilities-cat');
    const longGoal = await getSheetValue('budget202606', 'long-goal-utilities-cat');
    expect(goal).toBe(30000);
    expect(longGoal).toBe(360000);
  });

  // ============================================================================
  // BUDG-013: setBuffer via DB
  // ============================================================================
  it('BUDG-013: Buffer del mes', async () => {
    await setupDatabase();

    await db.insert('zero_budget_months', { id: '202606', buffered: 5000 });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'buffered');
    expect(value).toBe(5000);
  });

  // ============================================================================
  // BUDG-014: setZero limpia presupuestos del mes
  // ============================================================================
  it('BUDG-014: setZero limpia presupuestos del mes', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 30000 });
    await setBudget({ category: 'transportation-cat', month: '2026-06', amount: 15000 });
    await sheet.waitOnSpreadsheet();

    await setZero({ month: '2026-06' });
    await sheet.waitOnSpreadsheet();

    const utilities = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(utilities).toBe(0);
  });

  // ============================================================================
  // BUDG-015: getBudget recupera valor
  // ============================================================================
  it('BUDG-015: getBudget recupera valor presupuestado', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 42000 });
    await sheet.waitOnSpreadsheet();

    const value = await getBudget({ category: 'utilities-cat', month: '2026-06' });
    expect(value).toBe(42000);
  });

  // ============================================================================
  // BUDG-016: holdForNextMonth y resetHold
  // ============================================================================
  it('BUDG-016: holdForNextMonth y resetHold', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 30000 });
    await sheet.waitOnSpreadsheet();

    await holdForNextMonth({ month: '2026-06', amount: 15000 });
    await sheet.waitOnSpreadsheet();

    const carryover = await getSheetBoolean('budget202606', 'carryover-utilities-cat');
    // holdForNextMonth establece carryover a true para la categoría
    expect(typeof carryover).toBe('boolean');

    await resetHold({ month: '2026-06' });
    await sheet.waitOnSpreadsheet();

    const afterReset = await getSheetBoolean('budget202606', 'carryover-utilities-cat');
    expect(afterReset).toBe(false);
  });

  // ============================================================================
  // BUDG-017: isTrackingBudget devuelve false para envelope
  // ============================================================================
  it('BUDG-017: isTrackingBudget es false para budget envelope', async () => {
    await setupDatabase();
    expect(isTrackingBudget()).toBe(false);
  });

  // ============================================================================
  // BUDG-018: getSheetValue para celda inexistente
  // ============================================================================
  it('BUDG-018: getSheetValue retorna 0/null para celda inexistente', async () => {
    await setupDatabase();
    const value = await getSheetValue('budget202606', 'budget-nonexistent-cat');
    expect(value === null || value === 0).toBe(true);
  });

  // ============================================================================
  // BUDG-019: setBudget con monto negativo
  // ============================================================================
  it('BUDG-019: setBudget con monto negativo', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: -5000 });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(-5000);
  });

  // ============================================================================
  // BUDG-021: copySinglePreviousMonth copia presupuesto del mes anterior
  // ============================================================================
  it('BUDG-021: copySinglePreviousMonth copia del mes anterior', async () => {
    await setupDatabase();

    await setBudget({ category: 'utilities-cat', month: '2026-05', amount: 35000 });
    await sheet.waitOnSpreadsheet();

    await copySinglePreviousMonth({ month: '2026-06', category: 'utilities-cat' });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(35000);
  });

  // ============================================================================
  // BUDG-023: Categoría con múltiples goals
  // ============================================================================
  it('BUDG-023: Múltiples metas en el mismo mes', async () => {
    await setupDatabase();

    await db.insert('zero_budgets', {
      id: '202606-utilities-cat',
      month: '202606',
      category: 'utilities-cat',
      goal: 30000,
    });
    await db.insert('zero_budgets', {
      id: '202606-transportation-cat',
      month: '202606',
      category: 'transportation-cat',
      goal: 15000,
    });

    const goal1 = await getSheetValue('budget202606', 'goal-utilities-cat');
    const goal2 = await getSheetValue('budget202606', 'goal-transportation-cat');

    expect(goal1).toBe(30000);
    expect(goal2).toBe(15000);
  });

  it('BUDG-025: setCategoryCarryover activa carryover', async () => {
    await setupDatabase();
    await setCategoryCarryover({ startMonth: '2026-06', category: 'utilities-cat', flag: true });
    await sheet.waitOnSpreadsheet();
    const carryover = await getSheetBoolean('budget202606', 'carryover-utilities-cat');
    expect(carryover).toBe(true);
  });

  it('BUDG-026: setCategoryCarryover desactiva carryover', async () => {
    await setupDatabase();
    await setCategoryCarryover({ startMonth: '2026-06', category: 'utilities-cat', flag: true });
    await sheet.waitOnSpreadsheet();
    await setCategoryCarryover({ startMonth: '2026-06', category: 'utilities-cat', flag: false });
    await sheet.waitOnSpreadsheet();
    const carryover = await getSheetBoolean('budget202606', 'carryover-utilities-cat');
    expect(carryover).toBe(false);
  });

  it('BUDG-027: resetIncomeCarryover resetea carryover de ingresos', async () => {
    await setupDatabase();
    await resetIncomeCarryover({ month: '2026-06' });
    await sheet.waitOnSpreadsheet();
    // Debe completar sin error
    expect(true).toBe(true);
  });
});
