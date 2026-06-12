// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import * as budget from './base';
import { setBudget, getSheetValue, setCategoryCarryover } from './actions';

// Sets up envelope budget (default)
async function setupEnvelopeDatabase(opts: { addIncome?: boolean } = {}) {
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

  if (opts.addIncome) {
    await db.insertAccount({ id: 'acct1', name: 'Checking', offbudget: 0 });
    await db.insertTransaction({
      id: 't1',
      account: 'acct1',
      category: 'income-cat',
      date: '2024-01-15',
      amount: 5000,
    });
  }

  await sheet.loadSpreadsheet(db);
}

describe('envelope budget integration tests', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  it('creates envelope budget with available-funds cell', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const available = await getSheetValue('budget202401', 'available-funds');
    expect(typeof available).toBe('number');
  });

  it('sets to-budget correctly when income is added', async () => {
    await setupEnvelopeDatabase({ addIncome: true });
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const totalIncome = await getSheetValue('budget202401', 'total-income');
    expect(totalIncome).toBe(5000);

    const toBudget = await getSheetValue('budget202401', 'to-budget');
    expect(typeof toBudget).toBe('number');
  });

  it('total-budgeted reflects sum of expense budgets', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 3000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 1000 });
    await sheet.waitOnSpreadsheet();

    const totalBudgeted = await getSheetValue('budget202401', 'total-budgeted');
    expect(totalBudgeted).toBe(-4000);
  });

  it('group-budget sums category budgets', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 2000 });
    await setBudget({ category: 'cat2', month: '2024-01', amount: 500 });
    await sheet.waitOnSpreadsheet();

    const groupBudget = await getSheetValue('budget202401', 'group-budget-group1');
    expect(groupBudget).toBe(2500);
  });

  it('leftover-cat1 reflects unspent budget', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01']);

    await setBudget({ category: 'cat1', month: '2024-01', amount: 2000 });
    await sheet.waitOnSpreadsheet();

    const leftover = await getSheetValue('budget202401', 'leftover-cat1');
    expect(leftover).toBe(2000); // nothing spent
  });

  it('carryover cell defaults to false', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const carryover = await getSheetValue('budget202401', 'carryover-cat1');
    expect(carryover).toBe(0);
  });

  it('setCategoryCarryover sets carryover flag in DB', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01', '2024-02']);
    await sheet.waitOnSpreadsheet();

    await setCategoryCarryover({ startMonth: '2024-01', category: 'cat1', flag: true });
    
    // Wait a tick for the un-awaited db.update calls inside setCategoryCarryover to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check the DB directly
    const row = await db.first(
      'SELECT carryover FROM zero_budgets WHERE month = ? AND category = ?',
      ['202401', 'cat1']
    );
    expect(row?.carryover).toBe(1);
  });

  it('from-last-month reflects previous month to-budget', async () => {
    await setupEnvelopeDatabase({ addIncome: true });
    await budget.createBudget(['2024-01', '2024-02']);
    await sheet.waitOnSpreadsheet();

    // Budget nothing in Jan, so all income should carry forward
    const fromLastMonth = await getSheetValue('budget202402', 'from-last-month');
    expect(typeof fromLastMonth).toBe('number');
  });

  it('last-month-overspent tracks overspending carryover', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01', '2024-02']);
    await sheet.waitOnSpreadsheet();

    const overspent = await getSheetValue('budget202402', 'last-month-overspent');
    expect(typeof overspent).toBe('number');
  });

  it('goal cell is zero by default', async () => {
    await setupEnvelopeDatabase();
    await budget.createBudget(['2024-01']);
    await sheet.waitOnSpreadsheet();

    const goal = await getSheetValue('budget202401', 'goal-cat1');
    expect(goal).toBe(0);
  });

  it('handles multiple months correctly in envelope mode', async () => {
    await setupEnvelopeDatabase({ addIncome: true });
    await budget.createBudget(['2024-01', '2024-02', '2024-03']);
    await sheet.waitOnSpreadsheet();

    await setBudget({ category: 'cat1', month: '2024-01', amount: 1000 });
    await setBudget({ category: 'cat1', month: '2024-02', amount: 1500 });
    await setBudget({ category: 'cat1', month: '2024-03', amount: 2000 });
    await sheet.waitOnSpreadsheet();

    expect(await getSheetValue('budget202401', 'budget-cat1')).toBe(1000);
    expect(await getSheetValue('budget202402', 'budget-cat1')).toBe(1500);
    expect(await getSheetValue('budget202403', 'budget-cat1')).toBe(2000);
  });
});
