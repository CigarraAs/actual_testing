import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

describe('Spreadsheet - Pruebas Avanzadas de Cobertura', () => {
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

    await db.runQuery(
      'INSERT INTO zero_budgets (id, month, category, amount) VALUES (?, ?, ?, ?)',
      ['budget1', '202604', 'food-cat', 5000]
    );
    await sheet.loadSpreadsheet(db);
  }

  it('SHEET-001: loadSpreadsheet and get/set basic values', async () => {
    await setupDatabase();

    const spreadsheet = sheet.get();
    expect(spreadsheet).toBeDefined();

    spreadsheet.set('test-cell', 42);
    expect(spreadsheet.getValue('test-cell')).toBe(42);
    expect(spreadsheet.getExpr('test-cell')).toBe(42);
    const sheetName = 'budget202604';
    expect(sheet.getCellValue(sheetName, 'budget-food-cat')).toBe(5000);
    expect(spreadsheet.getCellValueLoose(sheetName, 'budget-food-cat')).toBe(5000);
    expect(spreadsheet.getCellValueLoose(sheetName, 'non-existent')).toBe(null);
  });

  it('SHEET-002: Dynamic cells and dependencies (createDynamic)', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!A1', 10);
    spreadsheet.set('testSheet!A2', 20);

    spreadsheet.createDynamic('testSheet', 'A3', {
      dependencies: ['A1', 'A2'],
      initialValue: 0,
      run: (a1: number, a2: number) => a1 + a2
    });

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'A3')).toBe(30);

    spreadsheet.set('testSheet!A1', 100);
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'A3')).toBe(120);
  });

  it('SHEET-003: addDependencies and removeDependencies', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!X1', 5);
    spreadsheet.set('testSheet!X2', 10);
    spreadsheet.set('testSheet!X3', 15);

    spreadsheet.createDynamic('testSheet', 'Sum', {
      dependencies: ['X1'],
      initialValue: 0,
      run: (...args: number[]) => args.reduce((a, b) => a + b, 0)
    });

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'Sum')).toBe(5);

    spreadsheet.addDependencies('testSheet', 'Sum', ['X2']);

    const node = spreadsheet.getNode('testSheet!Sum');
    node._run = (x1: number, x2: number) => x1 + x2;
    spreadsheet.recompute('testSheet!Sum');
    await sheet.waitOnSpreadsheet();

    expect(spreadsheet.getCellValue('testSheet', 'Sum')).toBe(15);

    spreadsheet.removeDependencies('testSheet', 'Sum', ['X2']);
    node._run = (x1: number) => x1; // back to 1 dep
    spreadsheet.recompute('testSheet!Sum');
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'Sum')).toBe(5);
  });

  it('SHEET-004: transactions defer computation', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!B1', 1);

    let computeCount = 0;
    spreadsheet.createDynamic('testSheet', 'B2', {
      dependencies: ['B1'],
      initialValue: 0,
      run: (b1: number) => {
        computeCount++;
        return b1 * 2;
      }
    });

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'B2')).toBe(2);
    expect(computeCount).toBe(1);

    sheet.startTransaction();
    spreadsheet.set('testSheet!B1', 2);
    spreadsheet.set('testSheet!B1', 3);
    spreadsheet.set('testSheet!B1', 4);
    sheet.endTransaction();

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'B2')).toBe(8);

    expect(computeCount).toBe(2);
  });

  it('SHEET-005: clearSheet and deleteCell', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('sheet1!C1', 100);
    spreadsheet.set('sheet1!C2', 200);
    spreadsheet.set('sheet2!C1', 300);

    expect(spreadsheet.hasCell('sheet1!C1')).toBe(true);

    spreadsheet.deleteCell('sheet1', 'C1');
    expect(spreadsheet.hasCell('sheet1!C1')).toBe(false);
    expect(spreadsheet.hasCell('sheet1!C2')).toBe(true);
    spreadsheet.clearSheet('sheet1');
    expect(spreadsheet.hasCell('sheet1!C2')).toBe(false);
    expect(spreadsheet.hasCell('sheet2!C1')).toBe(true);
  });

  it('SHEET-006: unloadSpreadsheet and reloadSpreadsheet', async () => {
    await setupDatabase();
    expect(sheet.get()).toBeDefined();

    const newSpreadsheet = await sheet.reloadSpreadsheet(db);
    expect(newSpreadsheet).toBeDefined();

    sheet.unloadSpreadsheet();
    expect(sheet.get()).toBeNull();
  });

  it('SHEET-007: Event listeners (onFinish)', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    let finished = false;
    spreadsheet.onFinish(() => {
      finished = true;
    });

    expect(finished).toBe(true);

    spreadsheet.set('E1', 1);
    let asyncFinished = false;
    spreadsheet.onFinish(() => {
      asyncFinished = true;
    });

    await sheet.waitOnSpreadsheet();
    expect(asyncFinished).toBe(true);
  });

  it('SHEET-008: graph cycles should not infinite loop if detected/prevented', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!D1', 1);
    spreadsheet.createDynamic('test', 'D2', {
      dependencies: ['D1'],
      initialValue: 0,
      run: (d1: number) => d1 + 1
    });

    await sheet.waitOnSpreadsheet();

    const edges = spreadsheet.graph.getEdges().edges;
    expect(edges.get('test!D1')).toBeDefined();
    expect(edges.get('test!D1')!.has('test!D2')).toBe(true);
  });
});
