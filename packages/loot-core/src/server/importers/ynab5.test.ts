// @ts-strict-ignore
/* eslint-disable @typescript-eslint/no-explicit-any, no-throw-literal, @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { send } from '#server/main-app';

import { doImport, getBudgetName, parseFile } from './ynab5';

vi.mock('#server/main-app', () => ({
  send: vi.fn(),
}));

vi.mock('#platform/server/log', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ynab5 importer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('parseFile', () => {
    it('parses direct budget data', () => {
      const input = { budget_name: 'Direct' };
      const res = parseFile(Buffer.from(JSON.stringify(input)));
      expect(res).toEqual(input);
    });

    it('parses nested budget data under data key', () => {
      const input = { data: { budget_name: 'Nested Data' } };
      const res = parseFile(Buffer.from(JSON.stringify(input)));
      expect(res).toEqual({ budget_name: 'Nested Data' });
    });

    it('parses nested budget data under budget key', () => {
      const input = { budget: { budget_name: 'Nested Budget' } };
      const res = parseFile(Buffer.from(JSON.stringify(input)));
      expect(res).toEqual({ budget_name: 'Nested Budget' });
    });
  });

  describe('getBudgetName', () => {
    it('returns budget_name if present', () => {
      expect(getBudgetName('path', { budget_name: 'Budget A' } as any)).toBe(
        'Budget A',
      );
    });

    it('returns name if budget_name is missing', () => {
      expect(getBudgetName('path', { name: 'Budget B' } as any)).toBe(
        'Budget B',
      );
    });
  });

  describe('doImport', () => {
    const createBaseBudget = (): any => ({
      name: 'Test YNAB5',
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          on_budget: true,
          closed: false,
          deleted: false,
        },
        {
          id: 'acc2',
          name: 'Savings',
          on_budget: false,
          closed: true,
          deleted: false,
        },
        { id: 'acc-deleted', name: 'Deleted Account', deleted: true },
      ],
      category_groups: [
        {
          id: 'cg1',
          name: 'Everyday Expenses',
          deleted: false,
          hidden: false,
          note: 'Group note',
        },
        {
          id: 'cg2',
          name: 'Credit Card Payments',
          deleted: false,
          hidden: false,
        },
        {
          id: 'cg3',
          name: 'Internal Master Category',
          deleted: false,
          hidden: false,
        },
        { id: 'cg4', name: 'Hidden Categories', deleted: false, hidden: true },
        { id: 'cg5', name: 'Income', deleted: false, hidden: false },
      ],
      categories: [
        {
          id: 'cat1',
          category_group_id: 'cg1',
          name: 'Groceries',
          deleted: false,
          hidden: false,
          note: 'Cat note',
        },
        {
          id: 'cat2',
          category_group_id: 'cg4',
          name: 'HiddenSub',
          deleted: false,
          hidden: true,
        },
        {
          id: 'cat3',
          category_group_id: 'cg5',
          name: 'Inflow: Ready to Assign',
          deleted: false,
          hidden: false,
        },
        // Add special categories for group 2 and 3 to test branch options
        {
          id: 'cat-cc',
          category_group_id: 'cg2',
          name: 'Visa Payment',
          deleted: false,
          hidden: false,
        },
        {
          id: 'cat-tbb',
          category_group_id: 'cg3',
          name: 'To be Budgeted',
          deleted: false,
          hidden: false,
        },
        {
          id: 'cat-uncat',
          category_group_id: 'cg3',
          name: 'Uncategorized',
          deleted: false,
          hidden: false,
        },
      ],
      payees: [
        { id: 'payee1', name: 'Merchant', deleted: false },
        { id: 'payee-deleted', name: 'Deleted Payee', deleted: true },
        { id: 'payee-starting', name: 'Starting Balance', deleted: false },
      ],
      payee_locations: [
        {
          payee_id: 'payee1',
          latitude: '40.7128',
          longitude: '-74.0060',
          deleted: false,
        },
        {
          payee_id: 'payee1',
          latitude: 'invalid',
          longitude: '-74.0060',
          deleted: false,
        },
        {
          payee_id: 'payee-unknown',
          latitude: '40.0',
          longitude: '-70.0',
          deleted: false,
        },
        {
          payee_id: 'payee1',
          latitude: '40.0',
          longitude: '-70.0',
          deleted: true,
        },
      ],
      transactions: [],
      subtransactions: [],
      scheduled_transactions: [],
      scheduled_subtransactions: [],
      months: [],
    });

    it('successfully imports basic entities, handles tag conflicts, location errors, and starting balance', async () => {
      // Arrange
      const budget = createBaseBudget();
      budget.transactions = [
        {
          id: 't1',
          account_id: 'acc1',
          amount: -5000,
          category_id: 'cat1',
          date: '2026-06-01',
          cleared: 'cleared',
          deleted: false,
          flag_name: 'Tax',
          flag_color: 'red',
          memo: 'Tax payment',
          payee_id: 'payee1',
        },
        {
          id: 't2',
          account_id: 'acc1',
          amount: -2000,
          category_id: 'cat1',
          date: '2026-06-02',
          cleared: 'reconciled',
          deleted: false,
          flag_name: 'Tax',
          flag_color: 'blue',
          memo: 'Blue tag',
          payee_id: 'payee1',
        },
        {
          id: 't3', // empty tag name, has color
          account_id: 'acc1',
          amount: -1000,
          category_id: 'cat1',
          date: '2026-06-02',
          cleared: 'uncleared',
          deleted: false,
          flag_name: '',
          flag_color: 'green',
          payee_id: 'payee1',
        },
        {
          id: 't4', // has tag name, no color
          account_id: 'acc1',
          amount: -1000,
          category_id: 'cat1',
          date: '2026-06-02',
          cleared: 'uncleared',
          deleted: false,
          flag_name: 'Regular',
          flag_color: '',
          payee_id: 'payee1',
        },
        {
          id: 't5', // conflict name, color not in flagColorMap
          account_id: 'acc1',
          amount: -1000,
          category_id: 'cat1',
          date: '2026-06-02',
          cleared: 'uncleared',
          deleted: false,
          flag_name: 'Tax',
          flag_color: 'invalid-color',
          payee_id: 'payee1',
        },
        {
          id: 't-starting', // Starting balance transaction
          account_id: 'acc1',
          amount: 100000,
          category_id: 'cat3', // maps to income Cat
          date: '2026-06-01',
          cleared: 'cleared',
          deleted: false,
          payee_id: 'payee-starting',
        },
      ];
      budget.subtransactions = [
        {
          id: 'sub1',
          transaction_id: 't1',
          amount: -1000,
          category_id: 'cat1',
          memo: 'Sub Note fallback payee',
          deleted: false,
        },
      ];

      vi.mocked(send).mockImplementation(async (method: string, args?: any) => {
        switch (method) {
          case 'api/account-create':
            return `act-id-${args.account.name}`;
          case 'api/category-group-create':
            return `cg-id-${args.group.name}`;
          case 'api/category-create':
            return `cat-id-${args.category.name}`;
          case 'api/payee-create':
            return `payee-id-${args.payee.name}`;
          case 'api/categories-get':
            return [
              { id: 'income-id', name: 'Income' },
              { id: 'starting-balance-id', name: 'Starting Balances' },
            ];
          case 'api/payees-get':
            return [
              { id: 'payee-id-Merchant', name: 'Merchant' },
              { id: 'payee-id-Starting Balance', name: 'Starting Balance' },
            ];
          case 'payee-location-create':
            // Make it throw for coordinates that match payee1's coordinate just to hit the catch branch
            if (args.latitude === 40.7128) {
              throw new Error('Location database write error');
            }
            return 'loc-id';
          default:
            return null;
        }
      });

      // Act
      await doImport(budget);

      // Assert
      expect(send).toHaveBeenCalledWith('api/account-create', {
        account: { name: 'Checking', offbudget: false, closed: false },
      });
      // The start-balance transaction should map to Starting Balances category
      expect(send).toHaveBeenCalledWith(
        'api/transactions-add',
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              category: 'starting-balance-id',
              payee: null,
            }),
          ]),
        }),
      );
    });

    it('returns early if payee_locations is not provided', async () => {
      // Arrange
      const budget = createBaseBudget();
      delete budget.payee_locations;

      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') return [];
        return 'dummy-id';
      });

      // Act
      await doImport(budget);

      // Assert
      expect(send).not.toHaveBeenCalledWith(
        'payee-location-create',
        expect.any(Object),
      );
    });

    it('matches orphaned transfer transactions and subtransactions with sort order coverage', async () => {
      // Arrange
      const budget = createBaseBudget();
      budget.transactions = [
        // Two transactions on same key to cover map.has else branch
        {
          id: 't-orphan1',
          account_id: 'acc1',
          amount: -5000,
          date: '2026-06-02',
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Memo B',
        },
        {
          id: 't-orphan2',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-01', // earlier date to test sorting
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Memo A',
        },
        {
          id: 't-orphan3',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-02', // same date, different amount
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Memo C',
        },
      ];
      budget.subtransactions = [
        // Match them with subtransactions (with duplicate key to cover map.has else branch)
        {
          id: 'st-orphan1',
          transaction_id: 't-parent1',
          amount: 5000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
        {
          id: 'st-orphan2',
          transaction_id: 't-parent2',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
        {
          id: 'st-orphan3',
          transaction_id: 't-parent3',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
      ];
      budget.transactions.push(
        {
          id: 't-parent1',
          account_id: 'acc2',
          amount: 5000,
          date: '2026-06-02',
          memo: 'Memo B',
          cleared: 'cleared',
          deleted: false,
        },
        {
          id: 't-parent2',
          account_id: 'acc2',
          amount: 3000,
          date: '2026-06-01',
          memo: 'Memo A',
          cleared: 'cleared',
          deleted: false,
        },
        {
          id: 't-parent3',
          account_id: 'acc2',
          amount: 3000,
          date: '2026-06-02',
          memo: 'Memo C',
          cleared: 'cleared',
          deleted: false,
        },
      );

      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') {
          return [
            {
              id: 'payee-acc1',
              name: 'Transfer Checking',
              transfer_acct: 'act-id-Checking',
            },
            {
              id: 'payee-acc2',
              name: 'Transfer Savings',
              transfer_acct: 'act-id-Savings',
            },
          ];
        }
        return 'dummy-id';
      });

      // Act & Assert
      await expect(doImport(budget)).resolves.not.toThrow();
    });

    it('handles scheduled transactions details (including 31st monthly pattern, transfer schedules, missing rules and queries)', async () => {
      // Arrange
      const budget = createBaseBudget();
      budget.scheduled_transactions = [
        {
          id: 's-31st', // starts on 31st to trigger last-day monthly pattern
          account_id: 'acc1',
          amount: -3000,
          date_first: '2026-05-31',
          date_next: '2026-06-30',
          frequency: 'monthly',
          deleted: false,
          payee_id: 'payee1',
          memo: '31st Monthly',
        },
        {
          id: 's-transfer', // transfer schedule
          account_id: 'acc1',
          amount: -5000,
          date_first: '2026-06-01',
          date_next: '2026-07-01',
          frequency: 'monthly',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Saving transfer schedule',
        },
        {
          id: 's-no-rule-id', // schedule where api calculate rule returns null
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-07-01',
          frequency: 'weekly',
          deleted: false,
          payee_id: 'payee1',
          memo: 'No rule id',
        },
        {
          id: 's-no-rule-row', // schedule where api query rule returns empty row list
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-07-01',
          frequency: 'weekly',
          deleted: false,
          payee_id: 'payee1',
          memo: 'No rule row',
        },
        {
          id: 's-no-payee', // schedule with no payee
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-07-01',
          frequency: 'weekly',
          deleted: false,
          memo: 'No payee',
        },
        {
          id: 's-no-acct', // schedule with unmapped account
          account_id: 'acc-unmapped',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-07-01',
          frequency: 'weekly',
          deleted: false,
          payee_id: 'payee1',
        },
      ];
      budget.scheduled_subtransactions = [
        {
          id: 'ss-transfer', // sub-schedule with transfer_account_id
          scheduled_transaction_id: 's-31st',
          amount: -1500,
          transfer_account_id: 'acc2',
          deleted: false,
        },
        {
          id: 'ss-payee', // sub-schedule with payee_id
          scheduled_transaction_id: 's-31st',
          amount: -1000,
          payee_id: 'payee1',
          deleted: false,
        },
        {
          id: 'ss-fallback', // sub-schedule with fallback parent payee
          scheduled_transaction_id: 's-31st',
          amount: -500,
          deleted: false,
        },
      ];

      vi.mocked(send).mockImplementation(async (method: string, args?: any) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') {
          return [
            { id: 'payee-id-Merchant', name: 'Merchant' },
            {
              id: 'payee-id-Savings',
              name: 'Transfer Savings',
              transfer_acct: 'act-id-Savings',
            },
          ];
        }
        if (method === 'api/query') {
          if (args.query.table === 'schedules') {
            const schedId = args.query.filterExpressions?.[0]?.id;
            if (schedId === 's-no-rule-id') {
              return { data: null };
            }
            return { data: `rule-of-${schedId}` };
          }
          if (args.query.table === 'rules') {
            const ruleId = args.query.filterExpressions?.[0]?.id;
            if (ruleId === 'rule-of-s-no-rule-row') {
              return { data: [] };
            }
            return {
              data: [
                {
                  id: ruleId,
                  actions: [],
                },
              ],
            };
          }
        }
        return 'dummy-id';
      });

      // Act & Assert
      await expect(doImport(budget)).resolves.not.toThrow();
    });

    it('throws custom error details for group creation failure and category creation failure', async () => {
      // Arrange
      const budget = createBaseBudget();

      let isGroupAttempt = true;

      vi.mocked(send).mockImplementation(async (method: string, args?: any) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') return [];

        if (method === 'api/category-group-create') {
          // Throw direct string, object or error to cover normalizeError branches
          if (isGroupAttempt) {
            isGroupAttempt = false;
            throw 'String Error';
          }
          throw { val: 'Object Error' }; // Throws non-string/non-Error object
        }
        return 'dummy-id';
      });

      // Act & Assert
      // Group fails after retries
      await expect(doImport(budget)).rejects.toThrow(
        'Unable to create category group: [object Object]',
      );

      // Now set group to pass but make category fail to test category throw error
      isGroupAttempt = false;
      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') return [];
        if (method === 'api/category-group-create') return 'cg-ok';
        if (method === 'api/category-create') {
          throw new Error('Cat DB Crash');
        }
        return 'dummy-id';
      });

      await expect(doImport(budget)).rejects.toThrow(
        'Unable to create category: Cat DB Crash',
      );
    });

    it('handles alternative scheduled frequencies and schedule retry failures/successes', async () => {
      // Arrange
      const budget = createBaseBudget();
      budget.scheduled_transactions = [
        {
          id: 's-daily',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Daily',
        },
        {
          id: 's-yearly',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2027-06-01',
          frequency: 'yearly',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Yearly',
        },
        {
          id: 's-everyOtherWeek',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-15',
          frequency: 'everyOtherWeek',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Every Other Week',
        },
        {
          id: 's-every4Weeks',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-29',
          frequency: 'every4Weeks',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Every 4 Weeks',
        },
        {
          id: 's-everyOtherMonth',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-08-01',
          frequency: 'everyOtherMonth',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Every Other Month',
        },
        {
          id: 's-every3Months',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-09-01',
          frequency: 'every3Months',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Every 3 Months',
        },
        {
          id: 's-every4Months',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-10-01',
          frequency: 'every4Months',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Every 4 Months',
        },
        {
          id: 's-everyOtherYear',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2028-06-01',
          frequency: 'everyOtherYear',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Every Other Year',
        },
        {
          id: 's-twiceAMonth',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-16',
          frequency: 'twiceAMonth',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Twice A Month',
        },
        {
          id: 's-twiceAYear',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-12-01',
          frequency: 'twiceAYear',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Twice A Year',
        },
        {
          id: 's-never',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-01',
          frequency: 'never',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Never',
        },
        {
          id: 's-retry-success',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: false,
          payee_id: 'payee1',
          memo: 'Retry Success',
        },
      ];

      let retryCount = 0;
      vi.mocked(send).mockImplementation(async (method: string, args?: any) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') {
          return [{ id: 'payee-id-Merchant', name: 'Merchant' }];
        }
        if (method === 'api/schedule-create') {
          if (args.name.startsWith('Retry Success')) {
            retryCount++;
            if (retryCount < 4) {
              throw new Error('Name collision');
            }
          }
          return 'sched-ok';
        }
        return 'dummy-id';
      });

      // Act
      await doImport(budget);

      // Assert
      expect(retryCount).toBe(4);
      expect(send).toHaveBeenCalledWith(
        'api/schedule-create',
        expect.objectContaining({
          name: 'Retry Success (3)',
        }),
      );

      // Now verify retry failure with normal Error object throws error message
      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') {
          return [{ id: 'payee-id-Merchant', name: 'Merchant' }];
        }
        if (method === 'api/schedule-create') {
          throw new Error('Always fail Error');
        }
        return 'dummy-id';
      });
      await expect(doImport(budget)).rejects.toThrow('Always fail Error');

      // Now verify retry failure with string throws string directly
      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') {
          return [{ id: 'payee-id-Merchant', name: 'Merchant' }];
        }
        if (method === 'api/schedule-create') {
          throw 'Always fail String';
        }
        return 'dummy-id';
      });
      await expect(doImport(budget)).rejects.toThrow('Always fail String');

      // Now verify retry frequency error throws unsupported error
      budget.scheduled_transactions = [
        {
          id: 's-invalid',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'invalid-freq' as any,
          deleted: false,
          payee_id: 'payee1',
        },
      ];
      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') {
          return [{ id: 'payee-id-Merchant', name: 'Merchant' }];
        }
        return 'dummy-id';
      });
      await expect(doImport(budget)).rejects.toThrow(
        'Unsupported scheduled frequency: invalid-freq',
      );
    });

    it('matches orphaned transfer transactions/subtransactions with mismatching items and memo sorting', async () => {
      // Arrange
      const budget = createBaseBudget();
      budget.transactions = [
        // Same date, same amount, different memos for sorting check
        {
          id: 't-orphanB',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-02',
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Memo B',
        },
        {
          id: 't-orphanA',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-02',
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Memo A',
        },
        {
          id: 't-orphanC',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-02',
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Memo C',
        },
        // Add mismatch to cover case -1 (date_a < date_b)
        {
          id: 't-mismatch1',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-03',
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'Mismatch T',
        },
      ];
      budget.subtransactions = [
        {
          id: 'st-orphanB',
          transaction_id: 't-parentB',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
        {
          id: 'st-orphanA',
          transaction_id: 't-parentA',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
        {
          id: 'st-orphanC',
          transaction_id: 't-parentC',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
        // Add mismatch to cover case -1 (date_a < date_b)
        {
          id: 'st-mismatch1',
          transaction_id: 't-parent-mismatch1',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
      ];
      budget.transactions.push(
        {
          id: 't-parentB',
          account_id: 'acc2',
          amount: 3000,
          date: '2026-06-02',
          memo: 'Memo B',
          cleared: 'cleared',
          deleted: false,
        },
        {
          id: 't-parentA',
          account_id: 'acc2',
          amount: 3000,
          date: '2026-06-02',
          memo: 'Memo A',
          cleared: 'cleared',
          deleted: false,
        },
        {
          id: 't-parentC',
          account_id: 'acc2',
          amount: 3000,
          date: '2026-06-02',
          memo: 'Memo C',
          cleared: 'cleared',
          deleted: false,
        },
        // Mismatch subtransaction date is 2026-06-04 (which is > 2026-06-03)
        {
          id: 't-parent-mismatch1',
          account_id: 'acc2',
          amount: 3000,
          date: '2026-06-04',
          memo: 'Mismatch ST',
          cleared: 'cleared',
          deleted: false,
        },
      );

      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') return [];
        if (method === 'api/payees-get') return [];
        return 'dummy-id';
      });

      // Act
      await doImport(budget);

      // Now create a budget for case 1 (date_a > date_b)
      const budgetCase1 = createBaseBudget();
      budgetCase1.transactions = [
        {
          id: 't-case1',
          account_id: 'acc1',
          amount: -3000,
          date: '2026-06-04',
          cleared: 'cleared',
          deleted: false,
          transfer_account_id: 'acc2',
          memo: 'T',
        },
      ];
      budgetCase1.subtransactions = [
        {
          id: 'st-case1',
          transaction_id: 't-parent-case1',
          amount: 3000,
          transfer_account_id: 'acc1',
          deleted: false,
        },
      ];
      budgetCase1.transactions.push({
        id: 't-parent-case1',
        account_id: 'acc2',
        amount: 3000,
        date: '2026-06-03',
        memo: 'ST',
        cleared: 'cleared',
        deleted: false,
      });

      // Act & Assert
      await expect(doImport(budgetCase1)).resolves.not.toThrow();
    });

    it('covers group/category/schedule rule mapping edges and budget months', async () => {
      // Arrange
      const budget = createBaseBudget();
      // Add deleted transactions and flagged deleted transactions
      budget.transactions = [
        {
          id: 't-normal',
          account_id: 'acc1',
          amount: -2000,
          category_id: 'cat1',
          date: '2026-06-01',
          cleared: 'cleared',
          deleted: false,
          payee_id: 'payee1',
        },
        {
          id: 't-deleted-flag',
          account_id: 'acc1',
          amount: -1000,
          category_id: 'cat1',
          date: '2026-06-01',
          cleared: 'cleared',
          deleted: true,
          flag_name: 'Conflict',
          flag_color: 'red',
        },
        {
          id: 't-deleted-normal',
          account_id: 'acc1',
          amount: -1000,
          category_id: 'cat1',
          date: '2026-06-01',
          cleared: 'cleared',
          deleted: true,
        },
      ];
      budget.scheduled_transactions = [
        {
          id: 's-deleted',
          account_id: 'acc1',
          amount: -1000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: true,
          payee_id: 'payee1',
        },
        {
          id: 's-no-rule1',
          account_id: 'acc1',
          amount: -2000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: false,
          payee_id: 'payee1',
          category_id: 'cat1',
        },
        {
          id: 's-no-rule2',
          account_id: 'acc1',
          amount: -3000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: false,
          payee_id: 'payee1',
        },
        {
          id: 's-splits',
          account_id: 'acc1',
          amount: -4000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: false,
          payee_id: 'payee1',
        },
        {
          id: 's-splits-no-rule',
          account_id: 'acc1',
          amount: -5000,
          date_first: '2026-06-01',
          date_next: '2026-06-02',
          frequency: 'daily',
          deleted: false,
          payee_id: 'payee1',
        },
      ];
      budget.scheduled_subtransactions = [
        {
          id: 'ss-splits1',
          scheduled_transaction_id: 's-splits',
          amount: -2000,
          memo: 'Sub memo',
          payee_id: 'payee1',
          category_id: 'cat1',
          deleted: false,
        },
        {
          id: 'ss-splits2',
          scheduled_transaction_id: 's-splits',
          amount: -2000,
          transfer_account_id: 'acc2',
          deleted: false,
        },
        {
          id: 'ss-splits-no-rule',
          scheduled_transaction_id: 's-splits-no-rule',
          amount: -5000,
          deleted: false,
        },
      ];

      // Add budget months to cover importBudgets branches
      budget.months = [
        {
          month: '2026-06-01',
          income: 0,
          budgeted: 8000,
          activity: 0,
          to_be_budgeted: 0,
          deleted: false,
          categories: [
            {
              id: 'cat1',
              category_group_id: 'cg1',
              name: 'Groceries',
              deleted: false,
              hidden: false,
              budgeted: 5000,
              activity: 0,
              balance: 5000,
            },
            {
              id: 'cat-cc',
              category_group_id: 'cg2',
              name: 'Visa Payment',
              deleted: false,
              hidden: false,
              budgeted: 1000,
              activity: 0,
              balance: 1000,
            },
            {
              id: 'cat-unmapped',
              category_group_id: 'cg1',
              name: 'Unmapped',
              deleted: false,
              hidden: false,
              budgeted: 2000,
              activity: 0,
              balance: 2000,
            },
          ],
        },
      ];

      vi.mocked(send).mockImplementation(async (method: string, args?: any) => {
        if (method === 'api/categories-get') {
          return [
            { id: 'income-id', name: 'Income' },
            { id: 'starting-balance-id', name: 'Starting Balances' },
            { id: 'cat-id-Groceries', name: 'Groceries' },
          ];
        }
        if (method === 'api/payees-get') {
          return [
            { id: 'payee-id-Merchant', name: 'Merchant' },
            {
              id: 'payee-id-Savings',
              name: 'Transfer Savings',
              transfer_acct: 'act-id-Savings',
            },
          ];
        }
        if (method === 'api/query') {
          if (args.query.table === 'schedules') {
            const schedId =
              args.query.filterExpressions?.[0]?.value ??
              args.query.filterExpressions?.[0]?.id;
            if (
              schedId === 's-no-rule1' ||
              schedId === 's-no-rule2' ||
              schedId === 's-splits-no-rule'
            ) {
              return { data: null };
            }
            return { data: `rule-of-${schedId}` };
          }
          if (args.query.table === 'rules') {
            const ruleId =
              args.query.filterExpressions?.[0]?.value ??
              args.query.filterExpressions?.[0]?.id;
            if (ruleId === 'rule-of-s-deleted') {
              return { data: [] }; // Empty rows
            }
            return {
              data: [
                {
                  id: ruleId,
                  actions: [],
                },
              ],
            };
          }
        }
        return 'dummy-id';
      });

      // Act & Assert
      await expect(doImport(budget)).resolves.not.toThrow();
    });
  });
});
