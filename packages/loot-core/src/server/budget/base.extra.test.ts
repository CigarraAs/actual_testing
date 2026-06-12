// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { doTransfer, setType, triggerBudgetChanges, getBudgetRange, getBudgetType, createAllBudgets } from './base';
import * as actions from './actions';
import * as budget from './base';

async function setupDatabase() {
  await db.insertCategoryGroup({ id: 'income-group', name: 'Income', is_income: 1 });
  await db.insertCategory({ id: 'income-cat', name: 'Salary', cat_group: 'income-group', is_income: 1 });
  
  await db.insertCategoryGroup({ id: 'group1', name: 'Expenses', is_income: 0 });
  await db.insertCategory({
    id: 'cat1',
    name: 'Food',
    cat_group: 'group1',
    is_income: 0,
  });
  await db.insertCategory({
    id: 'cat2',
    name: 'Transport',
    cat_group: 'group1',
    is_income: 0,
  });
  await sheet.loadSpreadsheet(db);
}

describe('base - triggerBudgetChanges for category_mapping', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('triggers sheet recompute on transferId changes', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    // Insert initial mapping
    await db.runQuery(
      `INSERT INTO category_mapping (id, transferId) VALUES ('old-id', 'cat1')`,
    );

    const sp = sheet.get();
    const recomputeSpy = vi.spyOn(sp, 'recompute');

    triggerBudgetChanges(
      new Map([['category_mapping', new Map([['old-id', { id: 'old-id', transferId: 'cat1' }]])]]),
      new Map([['category_mapping', [{ id: 'old-id', transferId: 'cat2' }]]]),
    );

    // Should recompute old and new transferId sum-amounts
    expect(recomputeSpy).toHaveBeenCalledWith(expect.stringContaining('sum-amount-cat1'));
    expect(recomputeSpy).toHaveBeenCalledWith(expect.stringContaining('sum-amount-cat2'));
  });
});

describe('base - doTransfer', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('transfers budget amounts from categories to a target', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    
    await actions.setBudget({ category: 'cat1', month: '2024-01', amount: 1000 });
    await actions.setBudget({ category: 'cat2', month: '2024-01', amount: 500 });
    await sheet.waitOnSpreadsheet();
    
    await doTransfer(['cat1'], 'cat2');
    
    const cat2Budget = await actions.getBudget({ category: 'cat2', month: '2024-01' });
    // Total is 1000 + 500 = 1500
    expect(cat2Budget).toBe(1500);
  });
});

describe('base - setType', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('does nothing if type is already set', async () => {
    await setupDatabase();
    sheet.get().setMeta({ budgetType: 'envelope' });
    const sp = sheet.get();
    const deleteCellSpy = vi.spyOn(sp, 'deleteCell');
    
    await setType('envelope');
    expect(deleteCellSpy).not.toHaveBeenCalled();
  });

  it('clears budget sheet and recreates budgets on type change', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    
    // Default is envelope
    sheet.get().setMeta({ budgetType: 'envelope', createdMonths: new Set(['2024-01']) });
    
    const sp = sheet.get();
    const deleteCellSpy = vi.spyOn(sp, 'deleteCell');

    await setType('tracking');

    expect(deleteCellSpy).toHaveBeenCalledWith('budget202401', 'budget-cat1');
    const meta = sheet.get().meta();
    expect(meta.budgetType).toBe('tracking');
  });
});

describe('base - extended - getBudgetRange()', () => {
  it('returns a range with start 3 months before and end 12 months after', () => {
    const { start, end, range } = getBudgetRange('2024-06', '2024-06');
    // start should be 3 months before 2024-06 = 2024-03
    expect(start).toBe('2024-03');
    // end should be 12 months after 2024-06 = 2025-06
    expect(end).toBe('2025-06');
    expect(Array.isArray(range)).toBe(true);
    expect(range.length).toBeGreaterThan(0);
    expect(range[0]).toBe('2024-03');
    expect(range[range.length - 1]).toBe('2025-06');
  });

  it('uses end as start when start > end', () => {
    // If start is after end, it should clamp start to end
    const { start } = getBudgetRange('2024-10', '2024-06');
    // start gets clamped to end (2024-06), then 3 months back = 2024-03
    expect(start).toBe('2024-03');
  });

  it('handles full date strings by extracting the month', () => {
    const { start, end } = getBudgetRange('2024-06-15', '2024-06-15');
    // Should extract year-month portion
    expect(start).toBe('2024-03');
    expect(end).toBe('2025-06');
  });

  it('returns inclusive range including all months between start and end', () => {
    const { range } = getBudgetRange('2024-01', '2024-01');
    // start = 2023-10, end = 2025-01 -> 16 months total
    expect(range).toContain('2024-01');
    expect(range).toContain('2024-12');
  });
});

describe('base - extended - getBudgetType()', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('returns "envelope" as the default budget type', async () => {
    await sheet.loadSpreadsheet(db);
    const type = getBudgetType();
    expect(type).toBe('envelope');
  });

  it('returns "tracking" when set in meta', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'tracking';
    const type = getBudgetType();
    expect(type).toBe('tracking');
  });
});

describe('base - extended - createAllBudgets()', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('creates budgets and returns start and end bounds', async () => {
    await sheet.loadSpreadsheet(db);
    await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const result = await createAllBudgets();
    expect(result).toHaveProperty('start');
    expect(result).toHaveProperty('end');
    expect(typeof result.start).toBe('string');
    expect(typeof result.end).toBe('string');
  });

  it('does not create duplicate budgets when called twice', async () => {
    await sheet.loadSpreadsheet(db);
    await db.insertCategoryGroup({ id: 'group1', name: 'Test Group' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const result1 = await createAllBudgets();
    const result2 = await createAllBudgets();

    // Should return same bounds
    expect(result1.start).toBe(result2.start);
    expect(result1.end).toBe(result2.end);
  });
});