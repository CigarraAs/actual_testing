import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { q } from '#shared/query';

import { resolveName, unresolveName } from './util';
import { number as numberUtil } from './globals';

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
      ['budget1', '202604', 'food-cat', 5000],
    );
    await sheet.loadSpreadsheet(db);
  }

  // ============================================================================
  // SHEET-001: loadSpreadsheet and get/set basic values
  // ============================================================================
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

  // ============================================================================
  // SHEET-002: Dynamic cells and dependencies (createDynamic)
  // ============================================================================
  it('SHEET-002: Dynamic cells and dependencies (createDynamic)', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!A1', 10);
    spreadsheet.set('testSheet!A2', 20);

    spreadsheet.createDynamic('testSheet', 'A3', {
      dependencies: ['A1', 'A2'],
      initialValue: 0,
      run: (a1: number, a2: number) => a1 + a2,
    });

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'A3')).toBe(30);

    spreadsheet.set('testSheet!A1', 100);
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'A3')).toBe(120);
  });

  // ============================================================================
  // SHEET-003: addDependencies and removeDependencies
  // ============================================================================
  it('SHEET-003: addDependencies and removeDependencies', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!X1', 5);
    spreadsheet.set('testSheet!X2', 10);
    spreadsheet.set('testSheet!X3', 15);

    spreadsheet.createDynamic('testSheet', 'Sum', {
      dependencies: ['X1'],
      initialValue: 0,
      run: (...args: number[]) => args.reduce((a, b) => a + b, 0),
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
    node._run = (x1: number) => x1;
    spreadsheet.recompute('testSheet!Sum');
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'Sum')).toBe(5);
  });

  // ============================================================================
  // SHEET-004: transactions defer computation
  // ============================================================================
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
      },
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

  // ============================================================================
  // SHEET-005: clearSheet and deleteCell
  // ============================================================================
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

  // ============================================================================
  // SHEET-006: unloadSpreadsheet and reloadSpreadsheet
  // ============================================================================
  it('SHEET-006: unloadSpreadsheet and reloadSpreadsheet', async () => {
    await setupDatabase();
    expect(sheet.get()).toBeDefined();

    const newSpreadsheet = await sheet.reloadSpreadsheet(db);
    expect(newSpreadsheet).toBeDefined();

    sheet.unloadSpreadsheet();
    expect(sheet.get()).toBeNull();
  });

  // ============================================================================
  // SHEET-007: Event listeners (onFinish)
  // ============================================================================
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

  // ============================================================================
  // SHEET-008: graph edges after dynamic creation
  // ============================================================================
  it('SHEET-008: Graph edges after dynamic creation', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!D1', 1);
    spreadsheet.createDynamic('test', 'D2', {
      dependencies: ['D1'],
      initialValue: 0,
      run: (d1: number) => d1 + 1,
    });

    await sheet.waitOnSpreadsheet();

    const edges = spreadsheet.graph.getEdges().edges;
    expect(edges.get('test!D1')).toBeDefined();
    expect(edges.get('test!D1')!.has('test!D2')).toBe(true);
  });

  // ============================================================================
  // SHEET-009: resolveName and unresolveName utilities
  // ============================================================================
  it('SHEET-009: resolveName and unresolveName utilities', async () => {
    const resolved = resolveName('budget202604', 'budget-food-cat');
    expect(resolved).toBe('budget202604!budget-food-cat');

    const unresolved = unresolveName('budget202604!budget-food-cat');
    expect(unresolved.sheet).toBe('budget202604');
    expect(unresolved.name).toBe('budget-food-cat');

    const simpleUnresolved = unresolveName('sheet!cell');
    expect(simpleUnresolved.sheet).toBe('sheet');
    expect(simpleUnresolved.name).toBe('cell');
  });

  // ============================================================================
  // SHEET-010: number() utility function
  // ============================================================================
  it('SHEET-010: number() utility converts values correctly', () => {
    expect(numberUtil(42)).toBe(42);
    expect(numberUtil('42')).toBe(42);
    expect(numberUtil('3.14')).toBe(3.14);
    expect(numberUtil(0)).toBe(0);
    expect(numberUtil('hello')).toBe(0);
    expect(numberUtil(null)).toBe(0);
    expect(numberUtil(undefined)).toBe(0);
    expect(numberUtil(true)).toBe(0);
    expect(numberUtil(false)).toBe(0);
    expect(numberUtil('')).toBe(0);
  });

  // ============================================================================
  // SHEET-011: meta() - spreadsheet global metadata
  // ============================================================================
  it('SHEET-011: meta() returns spreadsheet-level metadata', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    const meta = spreadsheet.meta();
    expect(meta).toBeDefined();
    expect(meta.budgetType).toBeDefined();
    expect(meta.createdMonths).toBeInstanceOf(Set);
  });

  // ============================================================================
  // SHEET-012: serialize() returns graph and nodes
  // ============================================================================
  it('SHEET-012: serialize() returns graph and nodes', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!S1', 42);
    spreadsheet.set('test!S2', 100);

    const serialized = spreadsheet.serialize();
    expect(serialized).toBeDefined();
    expect(serialized.graph).toBeDefined();
    expect(serialized.nodes).toBeDefined();
    expect(Array.isArray(serialized.nodes)).toBe(true);
  });

  // ============================================================================
  // SHEET-013: getNodes - iterate over all nodes
  // ============================================================================
  it('SHEET-013: getNodes() returns all cells', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!N1', 10);
    spreadsheet.set('test!N2', 20);

    const nodes = spreadsheet.getNodes();
    expect(nodes.size).toBeGreaterThanOrEqual(2);
    expect(nodes.has('test!N1')).toBe(true);
    expect(nodes.has('test!N2')).toBe(true);
  });

  // ============================================================================
  // SHEET-014: _getNode returns node with name and value
  // ============================================================================
  it('SHEET-014: _getNode() returns node details', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!G1', 99);
    const node = spreadsheet._getNode('test!G1');

    expect(node.name).toBe('test!G1');
    expect(node.value).toBe(99);
  });

  // ============================================================================
  // SHEET-015: createQuery sets up a query cell
  // ============================================================================
  it('SHEET-015: createQuery sets up a query cell', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    const queryState = q('transactions').filter({ tombstone: false }).select('*').serialize();

    spreadsheet.createQuery('test', 'QTotal', queryState);
    await sheet.waitOnSpreadsheet();

    expect(spreadsheet.hasCell('test!QTotal')).toBe(true);
  });
});
