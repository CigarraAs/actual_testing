import MockDate from 'mockdate';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { loadRules } from '#server/transactions/transaction-rules';

import { findSchedules, findStartDate } from './find-schedules';

beforeEach(async () => {
  MockDate.set(new Date(2021, 4, 17)); // Monday, May 17, 2021
  await global.emptyDatabase()();
  await loadMappings();
  await loadRules();
});

afterEach(() => {
  MockDate.reset();
});

describe('Schedule Discovery (findSchedules)', () => {
  test('should discover weekly schedule', async () => {
    const accId = await db.insertAccount({ name: 'Checking', type: 'checking' });
    const payeeId = await db.insertPayee({ name: 'Weekly Provider' });

    // Insert weekly transactions
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -1500,
      date: '2021-04-19', // Monday
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -1500,
      date: '2021-04-26', // Monday
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -1500,
      date: '2021-05-03', // Monday
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -1500,
      date: '2021-05-10', // Monday
    });

    const discovered = await findSchedules();
    expect(discovered.length).toBe(1);
    expect(discovered[0].payee).toBe(payeeId);
    expect(discovered[0].amount).toBe(-1500);
    expect(discovered[0].date.frequency).toBe('weekly');
  });

  test('should discover every 2 weeks schedule', async () => {
    const accId = await db.insertAccount({ name: 'Checking', type: 'checking' });
    const payeeId = await db.insertPayee({ name: 'Biweekly Provider' });

    // Insert bi-weekly transactions
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -2500,
      date: '2021-04-05',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -2500,
      date: '2021-04-19',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -2500,
      date: '2021-05-03',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -2500,
      date: '2021-05-17',
    });

    const discovered = await findSchedules();
    expect(discovered.length).toBeGreaterThanOrEqual(1);
    const schedule = discovered.find(s => s.payee === payeeId);
    expect(schedule).toBeDefined();
    expect(schedule.amount).toBe(-2500);
  });

  test('should discover monthly schedule', async () => {
    const accId = await db.insertAccount({ name: 'Checking', type: 'checking' });
    const payeeId = await db.insertPayee({ name: 'Monthly Landlord' });

    // Insert monthly transactions
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -120000,
      date: '2021-02-15',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -120000,
      date: '2021-03-15',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -120000,
      date: '2021-04-15',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -120000,
      date: '2021-05-15',
    });

    const discovered = await findSchedules();
    const schedule = discovered.find(s => s.payee === payeeId);
    expect(schedule).toBeDefined();
    expect(schedule.date.frequency).toBe('monthly');
  });

  test('should discover monthly last day schedule', async () => {
    const accId = await db.insertAccount({ name: 'Checking', type: 'checking' });
    const payeeId = await db.insertPayee({ name: 'Last Day Service' });

    // Insert last day of month transactions
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -5000,
      date: '2021-01-31',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -5000,
      date: '2021-02-28',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -5000,
      date: '2021-03-31',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -5000,
      date: '2021-04-30',
    });

    const discovered = await findSchedules();
    const schedule = discovered.find(s => s.payee === payeeId);
    expect(schedule).toBeDefined();
    expect(schedule.date.patterns[0]).toEqual({ type: 'day', value: -1 });
  });

  test('should discover monthly 1st or 3rd schedule', async () => {
    const accId = await db.insertAccount({ name: 'Checking', type: 'checking' });
    const payeeId = await db.insertPayee({ name: '1st or 3rd Day Service' });

    // May 17, 2021 is a Monday. Let's add transactions on 1st/3rd Mondays of previous months
    // April 2021 Mondays: 5th (1st Monday), 19th (3rd Monday)
    // March 2021 Mondays: 1st (1st Monday), 15th (3rd Monday)
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -3000,
      date: '2021-03-01',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -3000,
      date: '2021-03-15',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -3000,
      date: '2021-04-05',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -3000,
      date: '2021-04-19',
    });

    const discovered = await findSchedules();
    const schedule = discovered.find(s => s.payee === payeeId);
    expect(schedule).toBeDefined();
    expect(schedule.date.patterns).toContainEqual(expect.objectContaining({ value: 1 }));
    expect(schedule.date.patterns).toContainEqual(expect.objectContaining({ value: 3 }));
  });

  test('should discover monthly 2nd or 4th schedule', async () => {
    const accId = await db.insertAccount({ name: 'Checking', type: 'checking' });
    const payeeId = await db.insertPayee({ name: '2nd or 4th Day Service' });

    // April 2021 Mondays: 12th (2nd Monday), 26th (4th Monday)
    // March 2021 Mondays: 8th (2nd Monday), 22nd (4th Monday)
    // In find-schedules.ts, monthly2ndor4th backtracks 8 months (to around Aug 2020).
    // So we place the transactions in Sep/Oct 2020 to fall into that window.
    // 2nd Monday of Sep 2020: 14th
    // 4th Monday of Sep 2020: 28th
    // 2nd Monday of Oct 2020: 12th
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -4000,
      date: '2020-09-14',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -4000,
      date: '2020-09-28',
    });
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -4000,
      date: '2020-10-12',
    });

    // Provide a latest transaction to ensure search references from April 2021
    await db.insertTransaction({
      account: accId,
      payee: payeeId,
      amount: -4000,
      date: '2021-04-26',
    });

    const discovered = await findSchedules();
    const schedule = discovered.find(s => s.payee === payeeId);
    expect(schedule).toBeDefined();
    expect(schedule.date.patterns).toContainEqual(expect.objectContaining({ value: 2 }));
    expect(schedule.date.patterns).toContainEqual(expect.objectContaining({ value: 4 }));
  });

  test('findStartDate backtracks start date correctly', async () => {
    await db.insertPayee({ id: 'payee1', name: 'Payee 1' });
    await db.insertAccount({ id: 'acc1', name: 'Acc 1' });

    const schedule = {
      id: 'sched1',
      account: 'acc1',
      payee: 'payee1',
      amount: -1000,
      _conditions: [
        { op: 'is', field: 'account', value: 'acc1' },
        { op: 'is', field: 'payee', value: 'payee1' },
        {
          op: 'is',
          field: 'date',
          value: { frequency: 'weekly', start: '2021-05-17', interval: 1 },
        },
      ],
    };

    const resultNoTrans = await findStartDate(schedule);
    expect(resultNoTrans.date.start).toBe('2021-05-17');

    await db.insertTransaction({
      account: 'acc1',
      payee: 'payee1',
      amount: -1000,
      date: '2021-05-10', // 1 week prior
    });

    const resultWithTrans = await findStartDate(schedule);
    expect(resultWithTrans.date.start).toBe('2021-05-10');
  });

  test('findStartDate supports monthly and yearly backtracking', async () => {
    await db.insertPayee({ id: 'payee1', name: 'Payee 1' });
    await db.insertAccount({ id: 'acc1', name: 'Acc 1' });

    // Monthly
    const scheduleMonthly = {
      _conditions: [
        { op: 'is', field: 'account', value: 'acc1' },
        { op: 'is', field: 'payee', value: 'payee1' },
        {
          op: 'is',
          field: 'date',
          value: { frequency: 'monthly', start: '2021-05-17', interval: 1 },
        },
      ],
    };
    await db.insertTransaction({
      account: 'acc1',
      payee: 'payee1',
      amount: -1000,
      date: '2021-04-17', // 1 month prior
    });
    const resMonthly = await findStartDate(scheduleMonthly as any);
    expect(resMonthly.date.start).toBe('2021-04-17');

    // Yearly
    const scheduleYearly = {
      _conditions: [
        { op: 'is', field: 'account', value: 'acc1' },
        { op: 'is', field: 'payee', value: 'payee1' },
        {
          op: 'is',
          field: 'date',
          value: { frequency: 'yearly', start: '2021-05-17', interval: 1 },
        },
      ],
    };
    await db.insertTransaction({
      account: 'acc1',
      payee: 'payee1',
      amount: -1000,
      date: '2020-05-17', // 1 year prior
    });
    const resYearly = await findStartDate(scheduleYearly as any);
    expect(resYearly.date.start).toBe('2020-05-17');
  });

  test('findStartDate throws error on invalid frequency', async () => {
    const scheduleInvalid = {
      _conditions: [
        { op: 'is', field: 'account', value: 'acc1' },
        {
          op: 'is',
          field: 'date',
          value: { frequency: 'hourly', start: '2021-05-17' },
        },
      ],
    };

    await expect(findStartDate(scheduleInvalid as any)).rejects.toThrow(
      'findStartDate: invalid frequency',
    );
  });
});
