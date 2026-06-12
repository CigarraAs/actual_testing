// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import * as actions from './actions';
import * as budget from './base';
import { cleanupTemplate } from './cleanup-template';
import * as cleanupNotes from './cleanup-template-notes';

async function setupDatabase() {
  await db.insertCategoryGroup({ id: 'income-group', name: 'Income', is_income: 1 });
  await db.insertCategory({
    id: 'income-cat',
    name: 'Salary',
    cat_group: 'income-group',
    is_income: 1,
  });
  await db.insertCategoryGroup({ id: 'group1', name: 'Expenses', is_income: 0 });
  await db.insertCategory({
    id: 'source-cat',
    name: 'Source Cat',
    cat_group: 'group1',
    is_income: 0,
    cleanup_def: JSON.stringify([{ type: 'cleanup', role: 'source', groupId: 'cg1' }]),
  });
  await db.insertCategory({
    id: 'sink-cat',
    name: 'Sink Cat',
    cat_group: 'group1',
    is_income: 0,
    cleanup_def: JSON.stringify([{ type: 'cleanup', role: 'sink', groupId: 'cg1', weight: 1 }]),
  });
  await db.insertCategory({
    id: 'over-cat',
    name: 'Overspent Cat',
    cat_group: 'group1',
    is_income: 0,
    cleanup_def: JSON.stringify([{ type: 'cleanup', role: 'overspend', groupId: 'cg1' }]),
  });
  await db.insertCategory({
    id: 'global-source',
    name: 'Global Source',
    cat_group: 'group1',
    is_income: 0,
    cleanup_def: JSON.stringify([{ type: 'cleanup', role: 'source', groupId: null }]),
  });
  await db.insertCategory({
    id: 'global-sink',
    name: 'Global Sink',
    cat_group: 'group1',
    is_income: 0,
    cleanup_def: JSON.stringify([{ type: 'cleanup', role: 'sink', groupId: null, weight: 1 }]),
  });

  await db.runQuery(
    `INSERT INTO cleanup_groups (id, name, tombstone) VALUES ('cg1', 'Cleanup Group 1', 0)`,
  );

  await sheet.loadSpreadsheet(db);
}

describe('cleanupTemplate', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('runs cleanly with no categories', async () => {
    await sheet.loadSpreadsheet(db);
    const result = await cleanupTemplate({ month: '2024-01' });
    expect(result.type).toBe('message');
    expect(result.message).toBe('All categories were up to date.');
  });

  it.skip('handles global source and sink', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    
    await actions.setBudget({ category: 'global-source', month: '2024-01', amount: 5000 });
    await actions.setBudget({ category: 'global-sink', month: '2024-01', amount: 0 });
    
    await sheet.waitOnSpreadsheet();

    vi.spyOn(cleanupNotes, 'storeNoteCleanups').mockResolvedValue(undefined);
    sheet.get().set('budget202401!leftover-global-source', 5000);

    const result = await cleanupTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    const sourceBudget = await actions.getSheetValue('budget202401', 'budget-global-source');
    expect(sourceBudget).toBe(0);

    const sinkBudget = await actions.getSheetValue('budget202401', 'budget-global-sink');
    expect(sinkBudget).toBe(5000);

    expect(result.message).toContain('Successfully returned funds from 1 source');
  });

  it.skip('handles group source, sink, and overspend', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    
    await actions.setBudget({ category: 'source-cat', month: '2024-01', amount: 10000 });
    await actions.setBudget({ category: 'over-cat', month: '2024-01', amount: 0 });
    await actions.setBudget({ category: 'sink-cat', month: '2024-01', amount: 0 });
    
    await sheet.waitOnSpreadsheet();
    
    sheet.get().set('budget202401!leftover-source-cat', 10000);
    sheet.get().set('budget202401!leftover-over-cat', -4000);

    const result = await cleanupTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    const overBudget = await actions.getSheetValue('budget202401', 'budget-over-cat');
    expect(overBudget).toBe(4000);

    const sinkBudget = await actions.getSheetValue('budget202401', 'budget-sink-cat');
    expect(sinkBudget).toBe(6000);
    
    const sourceBudget = await actions.getSheetValue('budget202401', 'budget-source-cat');
    expect(sourceBudget).toBe(0);
  });
  
  it.skip('handles group source without sink (warning)', async () => {
    await setupDatabase();
    await db.insertCategory({
      id: 'source-cat2',
      name: 'Source Cat 2',
      cat_group: 'group1',
      is_income: 0,
      cleanup_def: JSON.stringify([{ type: 'cleanup', role: 'source', groupId: 'cg-empty' }]),
    });
    await sheet.loadSpreadsheet(db);
    await budget.createBudget(['2024-01']);
    
    const result = await cleanupTemplate({ month: '2024-01' });
    expect(result.type).toBe('warning');
    expect(result.pre).toContain('Cleanup group "cg-empty" has no matching sink categories');
  });

  it.skip('handles overspending when no funds available (global warning)', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    
    await sheet.waitOnSpreadsheet();
    
    sheet.get().set('budget202401!leftover-global-source', -4000);
    sheet.get().set('budget202401!to-budget', -4000);

    const result = await cleanupTemplate({ month: '2024-01' });
    
    expect(result.type).toBe('warning');
    expect(result.message).toContain('Global: Funds not available:');
  });

  it.skip('handles partial cover of overspent group category', async () => {
    await setupDatabase();
    await budget.createBudget(['2024-01']);
    
    await actions.setBudget({ category: 'source-cat', month: '2024-01', amount: 2000 });
    await actions.setBudget({ category: 'over-cat', month: '2024-01', amount: 0 });
    await actions.setBudget({ category: 'sink-cat', month: '2024-01', amount: 0 });
    
    await sheet.waitOnSpreadsheet();
    
    sheet.get().set('budget202401!leftover-source-cat', 2000);
    sheet.get().set('budget202401!leftover-over-cat', -5000);
    
    await cleanupTemplate({ month: '2024-01' });
    await sheet.waitOnSpreadsheet();

    const overBudget = await actions.getSheetValue('budget202401', 'budget-over-cat');
    expect(overBudget).toBe(2000);
    
    const sinkBudget = await actions.getSheetValue('budget202401', 'budget-sink-cat');
    expect(sinkBudget).toBe(0);
  });

  it('handles invalid cleanup_def', async () => {
    await setupDatabase();
    await db.insertCategory({
      id: 'bad-cat',
      name: 'Bad Cat',
      cat_group: 'group1',
      is_income: 0,
      cleanup_def: 'invalid json',
    });
    await sheet.loadSpreadsheet(db);
    
    const result = await cleanupTemplate({ month: '2024-01' });
    expect(result.type).toBe('message');
  });
});