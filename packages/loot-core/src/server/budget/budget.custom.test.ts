import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { setBudget, getSheetValue } from './actions';
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
  // BUDG-001: Múltiples categorías presupuestadas simultáneamente
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

    // Actualizar
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
  // BUDG-005: Validar integridad después de múltiples operaciones
  // ============================================================================
  it('BUDG-005: Integridad tras múltiples operaciones secuenciales', async () => {
    await setupDatabase();

    // Secuencia de operaciones
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
  // BUDG-006: Presupuesto acumulativo en múltiples meses
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
  // BUDG-007: Cambiar presupuesto entre categorías
  // ============================================================================
  it('BUDG-007: Reasignar presupuesto entre categorías', async () => {
    await setupDatabase();

    // Inicial
    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: 40000 });
    await setBudget({ category: 'transportation-cat', month: '2026-06', amount: 10000 });
    await sheet.waitOnSpreadsheet();

    // Reasignar
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

    const maxAmount = 999999999 * 100; // 999999999.99
    await setBudget({ category: 'utilities-cat', month: '2026-06', amount: maxAmount });
    await sheet.waitOnSpreadsheet();

    const value = await getSheetValue('budget202606', 'budget-utilities-cat');
    expect(value).toBe(maxAmount);
  });

  // ============================================================================
  // BUDG-009: Categoría con presupuesto cero vs. sin presupuestar
  // ============================================================================
  it('BUDG-009: Presupuesto cero vs. sin presupuestar', async () => {
    await setupDatabase();

    // Establecer explícitamente a 0
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
});
