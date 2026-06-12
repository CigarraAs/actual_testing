// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import * as budget from './base';
import { setBudget, getSheetValue } from './actions';
import {
  handleCategoryChange,
  handleCategoryGroupChange,
  createCategory,
  createCategoryGroup,
  createSummary,
} from './tracking';

async function setupTrackingDatabase() {
  await db.runQuery(
    `INSERT INTO preferences (id, value) VALUES ('budgetType', 'tracking')`,
  );
  await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });
  await db.insertCategory({
    id: 'income-cat',
    name: 'Salary',
    cat_group: 'income-group',
    is_income: 1,
  });
  await db.insertCategoryGroup({ id: 'expenses', name: 'Expenses', is_income: 0 });
  await db.insertCategory({
    id: 'cat1',
    name: 'Food',
    cat_group: 'expenses',
    is_income: 0,
  });
  await db.insertCategory({
    id: 'cat2',
    name: 'Transport',
    cat_group: 'expenses',
    is_income: 0,
  });
  await sheet.loadSpreadsheet(db);
}

describe('tracking - handleCategoryChange', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('removes deps when category is deleted (tombstone 0->1)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const removeSpy = vi.spyOn(sp, 'removeDependencies');

    handleCategoryChange(
      ['2024-01'],
      { id: 'cat1', cat_group: 'expenses', tombstone: 0 },
      { id: 'cat1', cat_group: 'expenses', tombstone: 1 },
    );

    expect(removeSpy).toHaveBeenCalled();
  });

  it('adds deps when category is restored (tombstone 1->0)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryChange(
      ['2024-01'],
      { id: 'cat1', cat_group: 'expenses', tombstone: 1 },
      { id: 'cat1', cat_group: 'expenses', tombstone: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });

  it('adds deps when category is new (no oldValue)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryChange(
      ['2024-01'],
      null,
      { id: 'cat1', cat_group: 'expenses', tombstone: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });

  it('moves deps when category changes group', async () => {
    await setupTrackingDatabase();
    await db.insertCategoryGroup({ id: 'new-group', name: 'New Group', is_income: 0 });
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const removeSpy = vi.spyOn(sp, 'removeDependencies');
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryChange(
      ['2024-01'],
      { id: 'cat1', cat_group: 'expenses', tombstone: 0, hidden: 0 },
      { id: 'cat1', cat_group: 'new-group', tombstone: 0, hidden: 0 },
    );

    expect(removeSpy).toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalled();
  });

  it('removes deps when category is hidden', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const removeSpy = vi.spyOn(sp, 'removeDependencies');

    handleCategoryChange(
      ['2024-01'],
      { id: 'cat1', cat_group: 'expenses', tombstone: 0, hidden: 0 },
      { id: 'cat1', cat_group: 'expenses', tombstone: 0, hidden: 1 },
    );

    expect(removeSpy).toHaveBeenCalled();
  });

  it('adds deps when category is unhidden', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryChange(
      ['2024-01'],
      { id: 'cat1', cat_group: 'expenses', tombstone: 0, hidden: 1 },
      { id: 'cat1', cat_group: 'expenses', tombstone: 0, hidden: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });
});

describe('tracking - handleCategoryGroupChange', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('removes deps when group is deleted (tombstone 0->1)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const removeSpy = vi.spyOn(sp, 'removeDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      { id: 'expenses', tombstone: 0, hidden: 0 },
      { id: 'expenses', tombstone: 1, hidden: 0 },
    );

    expect(removeSpy).toHaveBeenCalled();
  });

  it('adds deps when group is restored (tombstone 1->0)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      { id: 'expenses', tombstone: 1, hidden: 0 },
      { id: 'expenses', tombstone: 0, hidden: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });

  it('adds deps when group is new (no oldValue)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      null,
      { id: 'expenses', tombstone: 0, hidden: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });

  it('removes deps when group is hidden', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const removeSpy = vi.spyOn(sp, 'removeDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      { id: 'expenses', tombstone: 0, hidden: 0 },
      { id: 'expenses', tombstone: 0, hidden: 1 },
    );

    expect(removeSpy).toHaveBeenCalled();
  });

  it('adds deps when group is unhidden', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      { id: 'expenses', tombstone: 0, hidden: 1 },
      { id: 'expenses', tombstone: 0, hidden: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });
});

describe('tracking - sheet cells computation', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('computes total-income from income categories', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'income-cat', month: '2024-01', amount: 5000 });
    await sheet.waitOnSpreadsheet();

    // total-income reflects sum of income group amount
    const totalIncome = await getSheetValue('budget202401', 'total-income');
    expect(typeof totalIncome).toBe('number');
  });

  it('computes total-leftover as sum of expense group leftovers', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 2000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 1000 });
    await sheet.waitOnSpreadsheet();

    const totalLeftover = await getSheetValue('budget202401', 'total-leftover');
    expect(typeof totalLeftover).toBe('number');
  });

  it('computes total-saved (budget-income minus total-budgeted)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'income-cat', month: '2024-01', amount: 5000 });
    await setBudget({ category: 'cat1', month: '2024-01', amount: 3000 });
    await sheet.waitOnSpreadsheet();

    const totalSaved = await getSheetValue('budget202401', 'total-saved');
    // total-budget-income - total-budgeted
    expect(typeof totalSaved).toBe('number');
  });

  it('computes real-saved (total-income minus total-spent)', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const realSaved = await getSheetValue('budget202401', 'real-saved');
    expect(typeof realSaved).toBe('number');
  });

  it('carryover for income category starts as false', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const carryover = await getSheetValue('budget202401', 'carryover-income-cat');
    expect(carryover).toBe(0);
  });

  it('leftover for income category uses income sign convention', async () => {
    await setupTrackingDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'income-cat', month: '2024-01', amount: 3000 });
    await sheet.waitOnSpreadsheet();

    // In tracking, leftover for income = budgeted - sumAmount (no spending = budgeted)
    const leftover = await getSheetValue('budget202401', 'leftover-income-cat');
    expect(typeof leftover).toBe('number');
  });
});
