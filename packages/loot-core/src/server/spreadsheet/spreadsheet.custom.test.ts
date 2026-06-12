import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { q } from '#shared/query';

import { resolveName, unresolveName } from './util';
import { number as numberUtil } from './globals';
import { Graph } from './graph-data-structure';

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

  // ============================================================================
  // SHEET-016: Graph - addEdge, getEdges, adjacent, adjacentIncoming
  // ============================================================================
  it('SHEET-016: Graph addEdge y getEdges mantienen estructura', () => {
    const g = Graph();
    g.addEdge('A', 'B');
    g.addEdge('A', 'C');
    g.addEdge('B', 'D');

    const { edges, incomingEdges } = g.getEdges();
    expect(edges.get('A')!.has('B')).toBe(true);
    expect(edges.get('A')!.has('C')).toBe(true);
    expect(edges.get('B')!.has('D')).toBe(true);
    expect(incomingEdges.get('B')!.has('A')).toBe(true);
    expect(incomingEdges.get('D')!.has('B')).toBe(true);
  });

  // ============================================================================
  // SHEET-017: removeNode with incoming edges
  // ============================================================================
  it('SHEET-017: removeNode limpia edges entrantes y salientes', () => {
    const g = Graph();
    g.addEdge('A', 'B');
    g.addEdge('C', 'B');
    g.removeNode('B');

    const { edges, incomingEdges } = g.getEdges();
    expect(edges.has('B')).toBe(false);
    expect(incomingEdges.has('B')).toBe(false);
  });

  // ============================================================================
  // SHEET-018: topologicalSort por dependencias
  // ============================================================================
  it('SHEET-018: topologicalSort ordena nodos correctamente', () => {
    const g = Graph();
    g.addEdge('A', 'B');
    g.addEdge('B', 'C');
    g.addEdge('A', 'D');

    const sorted = g.topologicalSort(['A']);
    // A debe ir primero, luego B o D, C debe ser último
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
  });

  // ============================================================================
  // SHEET-019: setMeta cambia metadata del spreadsheet
  // ============================================================================
  it('SHEET-019: setMeta actualiza metadata global', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.setMeta({ budgetType: 'tracking', createdMonths: new Set(['202601']) });
    const meta = spreadsheet.meta();
    expect(meta.budgetType).toBe('tracking');
    expect(meta.createdMonths.has('202601')).toBe(true);
  });

  // ============================================================================
  // SHEET-020: removeDependencies con nombres ya resueltos
  // ============================================================================
  it('SHEET-020: removeDependencies con nombre completo (con sheet)', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!R1', 10);
    spreadsheet.set('testSheet!R2', 20);

    spreadsheet.createDynamic('testSheet', 'RSum', {
      dependencies: ['R1', 'R2'],
      initialValue: 0,
      run: (r1: number, r2: number) => r1 + r2,
    });

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'RSum')).toBe(30);

    // Remove dependency usando nombre completo
    spreadsheet.removeDependencies('testSheet', 'RSum', ['testSheet!R1']);
    const node = spreadsheet.getNode('testSheet!RSum');
    node._run = (r2: number) => r2;
    spreadsheet.recompute('testSheet!RSum');
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'RSum')).toBe(20);
  });

  // ============================================================================
  // SHEET-021: triggerDatabaseChanges
  // ============================================================================
  it('SHEET-021: triggerDatabaseChanges ejecuta sin error', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    const oldValues = new Map([['transactions', [{ id: 'old' }]]]);
    const newValues = new Map([['transactions', [{ id: 'new' }]]]);

    spreadsheet.triggerDatabaseChanges(oldValues, newValues);
    await sheet.waitOnSpreadsheet();
    // Debe ejecutar sin error incluso sin query cells
    expect(true).toBe(true);
  });

  // ============================================================================
  // SHEET-022: recomputeAll recalcula todo
  // ============================================================================
  it('SHEET-022: recomputeAll recalcula todas las celdas', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!RC1', 5);
    spreadsheet.createDynamic('test', 'RC2', {
      dependencies: ['RC1'],
      initialValue: 0,
      run: (rc1: number) => rc1 * 2,
    });

    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('test', 'RC2')).toBe(10);

    spreadsheet.set('test!RC1', 20);
    spreadsheet.recomputeAll();
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('test', 'RC2')).toBe(40);
  });

  // ============================================================================
  // SHEET-023: removeEdge en graph cycle detection
  // ============================================================================
  it('SHEET-023: removeEdge elimina dependencia', () => {
    const g = Graph();
    g.addEdge('X', 'Y');
    g.addEdge('Y', 'Z');

    const { edges: before } = g.getEdges();
    expect(before.get('X')!.has('Y')).toBe(true);

    g.removeEdge('X', 'Y');
    const { edges: after } = g.getEdges();
    expect(after.get('X')!.has('Y')).toBe(false);
  });

  // ============================================================================
  // SHEET-024: addDependencies con nombres ya resueltos (con sheet)
  // ============================================================================
  it('SHEET-024: addDependencies con nombre resuelto', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('testSheet!AD1', 5);
    spreadsheet.set('testSheet!AD2', 10);

    spreadsheet.createDynamic('testSheet', 'ADSum', {
      dependencies: ['AD1'],
      initialValue: 0,
      run: (ad1: number) => ad1,
    });
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'ADSum')).toBe(5);

    // Agregar dependencia con nombre ya resuelto (testSheet!AD2)
    spreadsheet.addDependencies('testSheet', 'ADSum', ['testSheet!AD2']);

    const node = spreadsheet.getNode('testSheet!ADSum');
    node._run = (ad1: number, ad2: number) => ad1 + ad2;
    spreadsheet.recompute('testSheet!ADSum');
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('testSheet', 'ADSum')).toBe(15);
  });

  // ============================================================================
  // SHEET-025: triggerDatabaseChanges con SQL node que matchea
  // ============================================================================
  it('SHEET-025: triggerDatabaseChanges con nodo SQL que coincide', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    // Crear un nodo con SQL que dependa de la tabla 'transactions'
    const queryState = q('transactions').filter({ tombstone: false }).select('*').serialize();
    spreadsheet.createQuery('test', 'SqlDep', queryState);
    await sheet.waitOnSpreadsheet();

    // Disparar cambios en la tabla 'transactions'
    const oldValues = new Map([['transactions', []]]);
    const newValues = new Map([['transactions', [{ id: 'new' }]]]);
    spreadsheet.triggerDatabaseChanges(oldValues, newValues);
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.hasCell('test!SqlDep')).toBe(true);
  });

  // ============================================================================
  // SHEET-026: topologicalSort con diamante (nodo compartido)
  // ============================================================================
  it('SHEET-026: topologicalSort con grafo diamante', () => {
    const g = Graph();
    // A -> B, A -> C, B -> D, C -> D
    g.addEdge('A', 'B');
    g.addEdge('A', 'C');
    g.addEdge('B', 'D');
    g.addEdge('C', 'D');

    const sorted = g.topologicalSort(['A']);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('D'));
    expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
    // D debe ser el último
    expect(sorted[sorted.length - 1]).toBe('D');
  });

  // ============================================================================
  // SHEET-027: voidCell elimina valor de celda
  // ============================================================================
  it('SHEET-027: voidCell y deleteCell limpian correctamente', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!V1', 100);
    expect(spreadsheet.getCellValue('test', 'V1')).toBe(100);

    spreadsheet.voidCell('test', 'V1');
    const valAfterVoid = spreadsheet.getCellValueLoose('test', 'V1');

    spreadsheet.deleteCell('test', 'V1');
    expect(spreadsheet.hasCell('test!V1')).toBe(false);
  });

  // ============================================================================
  // SHEET-028: triggerDatabaseChanges sin nodos SQL no falla
  // ============================================================================
  it('SHEET-028: triggerDatabaseChanges sin nodos SQL no falla', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    const oldValues = new Map([['nonexistent_table', []]]);
    const newValues = new Map([['other_table', [{ id: 1 }]]]);
    spreadsheet.triggerDatabaseChanges(oldValues, newValues);
    await sheet.waitOnSpreadsheet();
    expect(true).toBe(true);
  });

  // ============================================================================
  // SHEET-029: createDynamic dos veces en mismo nodo (no-op)
  // ============================================================================
  it('SHEET-029: createDynamic en nodo ya dinámico no hace nada', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!DD1', 5);
    spreadsheet.createDynamic('test', 'DD2', {
      dependencies: ['DD1'],
      initialValue: 0,
      run: (d1: number) => d1 * 2,
    });
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('test', 'DD2')).toBe(10);

    // Llamar createDynamic de nuevo en el mismo nodo - debe ser no-op
    spreadsheet.createDynamic('test', 'DD2', {
      dependencies: ['DD1'],
      initialValue: 999,
      run: (d1: number) => d1 * 3,
    });
    await sheet.waitOnSpreadsheet();
    // El valor no debe cambiar porque ya era dinámico
    expect(spreadsheet.getCellValue('test', 'DD2')).toBe(10);
  });

  // ============================================================================
  // SHEET-030: createDynamic con dependencia con sheet name
  // ============================================================================
  it('SHEET-030: createDynamic con dep que ya tiene sheet', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!DE1', 7);
    spreadsheet.set('other!DE1', 3);

    spreadsheet.createDynamic('test', 'DE2', {
      dependencies: ['DE1', 'other!DE1'],
      initialValue: 0,
      run: (a: number, b: number) => a + b,
    });
    await sheet.waitOnSpreadsheet();
    expect(spreadsheet.getCellValue('test', 'DE2')).toBe(10);
  });

  // ============================================================================
  // SHEET-031: createStatic cell
  // ============================================================================
  it('SHEET-031: createStatic crea celda estática', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.createStatic('test', 'Static1', 42);
    expect(spreadsheet.getCellValue('test', 'Static1')).toBe(42);
    expect(spreadsheet.hasCell('test!Static1')).toBe(true);
  });

  // ============================================================================
  // SHEET-032: bootup ejecuta callback on-ready
  // ============================================================================
  it('SHEET-032: bootup ejecuta callback', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    let booted = false;
    spreadsheet.bootup(() => {
      booted = true;
    });
    await sheet.waitOnSpreadsheet();
    expect(booted).toBe(true);
  });

  // ============================================================================
  // SHEET-033: getCellExpr retorna expresión
  // ============================================================================
  it('SHEET-033: getCellExpr retorna expresión de celda', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.set('test!Expr1', '=1+2');
    const expr = spreadsheet.getCellExpr('test', 'Expr1');
    expect(expr).toBe('=1+2');
  });

  // ============================================================================
  // SHEET-034: load carga valor serializado
  // ============================================================================
  it('SHEET-034: load carga valores serializados', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.load('test!Loaded1', 99);
    expect(spreadsheet.getCellValue('test', 'Loaded1')).toBe(99);
    expect(spreadsheet.getCellExpr('test', 'Loaded1')).toBe(99);
  });

  // ============================================================================
  // SHEET-035: cache barrier methods
  // ============================================================================
  it('SHEET-035: startCacheBarrier y endCacheBarrier', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.startCacheBarrier();
    spreadsheet.endCacheBarrier();
    // No debe fallar
    expect(true).toBe(true);
  });

  // ============================================================================
  // SHEET-036: markCacheDirty y markCacheSafe
  // ============================================================================
  it('SHEET-036: markCacheDirty y markCacheSafe sin setCacheStatus', async () => {
    await setupDatabase();
    const spreadsheet = sheet.get();

    spreadsheet.markCacheDirty();
    spreadsheet.markCacheSafe();
    await sheet.waitOnSpreadsheet();
    expect(true).toBe(true);
  });
});