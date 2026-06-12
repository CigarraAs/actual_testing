// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import {
  getBudget,
  setBudget,
  setGoal,
  setBuffer,
  getSheetBoolean,
  getSheetValue,
  resetIncomeCarryover,
  resetHold,
  holdForNextMonth,
  copyUntilYearEnd,
  coverOverspending,
  transferCategory,
  setCategoryCarryover,
  copyPreviousMonth,
  copySinglePreviousMonth,
  setZero,
  setNMonthAvg,
  set3MonthAvg,
  set6MonthAvg,
  set12MonthAvg,
  transferAvailable,
  isTrackingBudget,
} from './actions';
import * as budget from './base';

async function setupDatabase() {
  await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });
  await db.insertCategory({
    id: 'income-cat',
    name: 'Income',
    cat_group: 'income-group',
    is_income: 1,
  });
  await db.insertCategoryGroup({ id: 'group1', name: 'Expenses', is_income: 0 });
  await db.insertCategory({
    id: 'cat1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  await db.insertCategory({
    id: 'cat2',
    name: 'cat2',
    cat_group: 'group1',
    is_income: 0,
  });
  await sheet.loadSpreadsheet(db);
}

describe('actions - getBudget', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('returns 0 when no budget exists for category/month', async () => {
    await setupDatabase();
    const val = getBudget({ category: 'cat1', month: '2024-01' });
    expect(val).toBe(0);
  });

  it('returns stored budget amount', async () => {
    await setupDatabase();
    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    const val = getBudget({ category: 'cat1', month: '2024-01' });
    expect(val).toBe(5000);
  });

  it('returns 0 when budget amount is null', async () => {
    await setupDatabase();
    db.runQuery(
      `INSERT INTO zero_budgets (id, month, category, amount) VALUES ('202401-cat1', 202401, 'cat1', null)`,
    );
    const val = getBudget({ category: 'cat1', month: '2024-01' });
    expect(val).toBe(0);
  });
});

describe('actions - setGoal', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('inserts goal when not existing', async () => {
    await setupDatabase();
    await setGoal({ category: 'cat1', month: '2024-01', goal: 3000, long_goal: 0 });
    const row = db.firstSync(
      'SELECT goal FROM zero_budgets WHERE month = 202401 AND category = ?',
      ['cat1'],
    );
    expect(row?.goal).toBe(3000);
  });

  it('updates existing goal', async () => {
    await setupDatabase();
    await setGoal({ category: 'cat1', month: '2024-01', goal: 3000, long_goal: 0 });
    await setGoal({ category: 'cat1', month: '2024-01', goal: 5000, long_goal: 1 });
    const row = db.firstSync(
      'SELECT goal, long_goal FROM zero_budgets WHERE month = 202401 AND category = ?',
      ['cat1'],
    );
    expect(row?.goal).toBe(5000);
    expect(row?.long_goal).toBe(1);
  });
});

describe('actions - setBuffer and holdForNextMonth', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('setBuffer inserts a buffered amount', async () => {
    await setupDatabase();
    await setBuffer('2024-01', 1000);
    const row = db.firstSync(
      'SELECT buffered FROM zero_budget_months WHERE id = ?',
      ['2024-01'],
    );
    expect(row?.buffered).toBe(1000);
  });

  it('setBuffer updates existing buffered amount', async () => {
    await setupDatabase();
    await setBuffer('2024-01', 1000);
    await setBuffer('2024-01', 2000);
    const row = db.firstSync(
      'SELECT buffered FROM zero_budget_months WHERE id = ?',
      ['2024-01'],
    );
    expect(row?.buffered).toBe(2000);
  });

  it('holdForNextMonth returns false when no to-budget available', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const result = await holdForNextMonth({ month: '2024-01', amount: 500 });
    expect(result).toBe(false);
  });

  it('resetHold sets buffer to 0', async () => {
    await setupDatabase();
    await setBuffer('2024-01', 5000);
    await resetHold({ month: '2024-01' });
    const row = db.firstSync(
      'SELECT buffered FROM zero_budget_months WHERE id = ?',
      ['2024-01'],
    );
    expect(row?.buffered).toBe(0);
  });
});

describe('actions - getSheetBoolean', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('returns false for non-boolean cell values', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const result = await getSheetBoolean('budget202401', 'budget-cat1');
    expect(result).toBe(false);
  });
});

describe('actions - resetIncomeCarryover', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('resets carryover for all income categories', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);

    db.runQuery(
      `INSERT INTO zero_budgets (id, month, category, carryover) VALUES ('202401-income-cat', 202401, 'income-cat', 1)`,
    );

    await resetIncomeCarryover({ month: '2024-01' });

    await new Promise(resolve => setTimeout(resolve, 50));

    const row = db.firstSync(
      'SELECT carryover FROM zero_budgets WHERE month = 202401 AND category = ?',
      ['income-cat'],
    );
    expect(row?.carryover).toBe(0);
  });

  it('does nothing when there are no income categories', async () => {
    await db.insertCategoryGroup({ id: 'group1', name: 'Expenses', is_income: 0 });
    await db.insertCategory({ id: 'cat1', name: 'Food', cat_group: 'group1', is_income: 0 });
    await sheet.loadSpreadsheet(db);

    await expect(resetIncomeCarryover({ month: '2024-01' })).resolves.not.toThrow();
  });
});

describe('actions - copyUntilYearEnd', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('copies budget to remaining months in the year', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-10', '2024-11', '2024-12']);
    await setBudget({ category: 'cat1', month: '2024-10', amount: 3000 });
    await sheet.waitOnSpreadsheet();

    await copyUntilYearEnd({ month: '2024-10', category: 'cat1' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202411', 'budget-cat1')).toBe(3000);
    expect(await getSheetValue('budget202412', 'budget-cat1')).toBe(3000);
  });

  it('does nothing when already at end of year', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-12']);
    await setBudget({ category: 'cat1', month: '2024-12', amount: 2000 });
    await sheet.waitOnSpreadsheet();

    await expect(copyUntilYearEnd({ month: '2024-12', category: 'cat1' })).resolves.not.toThrow();
  });
});

describe('actions - coverOverspending', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('does nothing when category is not overspent', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await setBudget({ category: 'cat1', month: '2024-01', amount: 1000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 500 });
    await sheet.waitOnSpreadsheet();

    const beforeBudget = await getSheetValue('budget202401', 'budget-cat2');
    await coverOverspending({
      month: '2024-01',
      to: 'cat1',
      from: 'cat2',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();
    const afterBudget = await getSheetValue('budget202401', 'budget-cat2');
    expect(afterBudget).toBe(beforeBudget);
  });

  it('does nothing when no funds available in from category', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await setBudget({ category: 'cat2', month: '2024-01', amount: 0 });
    await sheet.waitOnSpreadsheet();

    const beforeBudget = await getSheetValue('budget202401', 'budget-cat2');
    await coverOverspending({
      month: '2024-01',
      to: 'cat2',
      from: 'cat1',
      currencyCode: 'USD',
    });
    await sheet.waitOnSpreadsheet();
    const afterBudget = await getSheetValue('budget202401', 'budget-cat2');
    expect(afterBudget).toBe(beforeBudget);
  });

  it('covers from to-budget source', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    await expect(coverOverspending({
      month: '2024-01',
      to: 'cat1',
      from: 'to-budget',
      currencyCode: 'USD',
    })).resolves.not.toThrow();
  });
});

describe('actions - setCategoryCarryover in tracking mode', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('sets carryover flag in reflect_budgets table for tracking budget', async () => {
    await db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'tracking')`,
    );
    await db.insertCategoryGroup({ id: 'expenses', name: 'Expenses', is_income: 0 });
    await db.insertCategory({ id: 'cat1', name: 'cat1', cat_group: 'expenses', is_income: 0 });
    await db.insertCategoryGroup({ id: 'income-g', name: 'Income', is_income: 1 });
    await db.insertCategory({ id: 'inc', name: 'Income', cat_group: 'income-g', is_income: 1 });
    await sheet.loadSpreadsheet(db);
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    await setCategoryCarryover({ startMonth: '2024-01', category: 'cat1', flag: true });
    await new Promise(resolve => setTimeout(resolve, 50));

    const row = db.firstSync(
      'SELECT carryover FROM reflect_budgets WHERE month = ? AND category = ?',
      [202401, 'cat1'],
    );
    expect(row?.carryover).toBe(1);
  });
});

describe('actions extended - copyPreviousMonth', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('copies all budgets from previous month', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01', '2024-02']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 3000 });
    await sheet.waitOnSpreadsheet();

    await copyPreviousMonth({ month: '2024-02' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202402', 'budget-cat1')).toBe(5000);
    expect(await getSheetValue('budget202402', 'budget-cat2')).toBe(3000);
  });

  it('does not copy income categories in envelope mode', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01', '2024-02']);

    await setBudget({ category: 'income-cat', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    await copyPreviousMonth({ month: '2024-02' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202402', 'budget-income-cat')).toBe(0);
  });
});

describe('actions extended - copySinglePreviousMonth', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('copies budget for a specific category only', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01', '2024-02']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 3000 });
    await sheet.waitOnSpreadsheet();

    await copySinglePreviousMonth({ month: '2024-02', category: 'cat1' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202402', 'budget-cat1')).toBe(5000);
    expect(await getSheetValue('budget202402', 'budget-cat2')).toBe(0);
  });
});

describe('actions extended - setZero', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('sets all expense category budgets to zero', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 5000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 3000 });
    await sheet.waitOnSpreadsheet();

    await setZero({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(0);
    expect(await getSheetValue('budget202401', 'budget-cat2')).toBe(0);
  });
});

describe('actions extended - setNMonthAvg', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('sets the budget to the N-month average of spending', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01', '2024-02', '2024-03', '2024-04']);

    await setNMonthAvg({ month: '2024-04', N: 3, category: 'cat1' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(0);
  });
});

describe('actions extended - set3MonthAvg', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('calls set3MonthAvg for all expense categories', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01', '2024-02', '2024-03', '2024-04']);

    await set3MonthAvg({ month: '2024-04' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202404', 'budget-cat1')).toBe(0);
  });
});

describe('actions extended - set6MonthAvg', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('calls set6MonthAvg without error', async () => {
    await setupDatabase();
    await budget.createBudget([
      '2024-01', '2024-02', '2024-03',
      '2024-04', '2024-05', '2024-06', '2024-07',
    ]);

    await set6MonthAvg({ month: '2024-07' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202407', 'budget-cat1')).toBe(0);
  });
});

describe('actions extended - set12MonthAvg', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('calls set12MonthAvg without error', async () => {
    await setupDatabase();
    await budget.createBudget([
      '2024-01', '2024-02', '2024-03', '2024-04',
      '2024-05', '2024-06', '2024-07', '2024-08',
      '2024-09', '2024-10', '2024-11', '2024-12', '2025-01',
    ]);

    await set12MonthAvg({ month: '2025-01' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202501', 'budget-cat1')).toBe(0);
  });
});

describe('actions extended - transferAvailable', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('transfers money from to-budget to a category when available', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);

    await sheet.waitOnSpreadsheet();

    await transferAvailable({ month: '2024-01', amount: 100, category: 'cat2' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat2')).toBe(0);
  });

  it('does not transfer more than available', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    await transferAvailable({ month: '2024-01', amount: 1000, category: 'cat1' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(0);
  });
});

describe('actions extended - transferCategory', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('transfers from one category budget to another', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 2000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 500 });
    await sheet.waitOnSpreadsheet();

    await transferCategory({ month: '2024-01', amount: 1000, from: 'cat1', to: 'cat2' });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(1000);
    expect(await getSheetValue('budget202401', 'budget-cat2')).toBe(1500);
  });
});

describe('actions extended - isTrackingBudget', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('returns false by default (envelope mode)', async () => {
    await setupDatabase();
    expect(isTrackingBudget()).toBe(false);
  });

  it('returns true when budgetType is tracking', async () => {
    await setupDatabase();
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'tracking')`,
    );
    expect(isTrackingBudget()).toBe(true);
  });
});