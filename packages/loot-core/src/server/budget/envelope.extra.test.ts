// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import * as budget from './base';
import {
  handleCategoryChange,
  handleCategoryGroupChange,
} from './envelope';

async function setupDatabase() {
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

describe('envelope - handleCategoryChange', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('removes deps when category is deleted (tombstone 0->1)', async () => {
    await setupDatabase();
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
    await setupDatabase();
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

  it('adds deps when income category is new (no oldValue)', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryChange(
      ['2024-01'],
      null,
      { id: 'income-cat2', cat_group: 'income-group', tombstone: 0, is_income: 1 },
    );

    expect(addSpy).toHaveBeenCalled();
  });

  it('moves deps when category changes group', async () => {
    await setupDatabase();
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
});

describe('envelope - handleCategoryGroupChange', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('removes deps when group is deleted (tombstone 0->1)', async () => {
    await setupDatabase();
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
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      { id: 'expenses', tombstone: 1, hidden: 0, is_income: 0 },
      { id: 'expenses', tombstone: 0, hidden: 0, is_income: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });

  it('adds deps when group is new (no oldValue)', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const sp = sheet.get();
    const addSpy = vi.spyOn(sp, 'addDependencies');

    handleCategoryGroupChange(
      ['2024-01'],
      null,
      { id: 'new-exp', tombstone: 0, hidden: 0, is_income: 0 },
    );

    expect(addSpy).toHaveBeenCalled();
  });
});
