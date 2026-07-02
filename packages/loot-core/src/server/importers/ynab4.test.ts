// @ts-strict-ignore
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { send } from '#server/main-app';

import { doImport, getBudgetName, parseFile } from './ynab4';

// AdmZip mock variables
let mockEntries: any[] = [];
let mockFiles: Record<string, string> = {};

vi.mock('adm-zip', () => {
  return {
    default: class MockAdmZip {
      getEntries() {
        return mockEntries;
      }
      readFile(entry: any) {
        const content = mockFiles[entry.entryName];
        if (content === undefined) {
          throw new Error(`File not found in mock: ${entry.entryName}`);
        }
        return Buffer.from(content);
      }
    },
  };
});

vi.mock('#server/main-app', () => ({
  send: vi.fn(),
}));

vi.mock('#platform/server/log', () => ({
  logger: {
    log: vi.fn(),
  },
}));

describe('ynab4 importer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEntries = [];
    mockFiles = {};
  });

  describe('getBudgetName', () => {
    it('returns budget name from path with zip and ynab4 extensions', () => {
      expect(getBudgetName('C:\\Budgets\\MyBudget~51938D82.ynab4.zip')).toBe(
        'MyBudget',
      );
      expect(getBudgetName('/User/Documents/SimpleBudget.ynab4.zip')).toBe(
        'SimpleBudget',
      );
    });

    it('returns null if path does not contain .zip', () => {
      expect(getBudgetName('C:\\Budgets\\MyBudget.ynab4')).toBeNull();
    });

    it('returns null if regex matcher fails on path', () => {
      expect(getBudgetName('~.zip')).toBeNull();
    });
  });

  describe('parseFile', () => {
    it('successfully parses valid zip structure with multiple devices (ignores invalid/non-full-knowledge)', () => {
      // Arrange
      mockEntries = [
        { entryName: 'MyBudget.ynab4/' },
        { entryName: 'MyBudget.ynab4/Budget.ymeta' },
        { entryName: 'MyBudget.ynab4/data/devices/deviceA' },
        { entryName: 'MyBudget.ynab4/data/devices/deviceB' }, // device with invalid JSON
        { entryName: 'MyBudget.ynab4/data/devices/deviceC' }, // device with hasFullKnowledge: false
        { entryName: 'MyBudget.ynab4/data/deviceA/Budget.yfull' },
      ];

      mockFiles['MyBudget.ynab4/Budget.ymeta'] = JSON.stringify({
        relativeDataFolderName: 'data',
      });
      mockFiles['MyBudget.ynab4/data/devices/deviceA'] = JSON.stringify({
        hasFullKnowledge: true,
        deviceGUID: 'deviceA',
        shortDeviceId: 'dA',
        knowledge: 'A-10,B-20',
      });
      mockFiles['MyBudget.ynab4/data/devices/deviceB'] = 'invalid-json-content';
      mockFiles['MyBudget.ynab4/data/devices/deviceC'] = JSON.stringify({
        hasFullKnowledge: false,
      });
      mockFiles['MyBudget.ynab4/data/deviceA/Budget.yfull'] = JSON.stringify({
        budget_name: 'Parsed YNAB4 Budget',
        accounts: [],
      });

      // Act
      const data = parseFile(Buffer.from('dummyzip'));

      // Assert
      expect(data).toEqual({
        budget_name: 'Parsed YNAB4 Budget',
        accounts: [],
      });
    });

    it('throws error when meta file is missing', () => {
      // Arrange
      mockEntries = [{ entryName: 'MyBudget.ynab4/' }];

      // Act & Assert
      expect(() => parseFile(Buffer.from('dummy'))).toThrow(
        'Could not find file: MyBudget.ynab4/Budget.ymeta',
      );
    });

    it('throws error when multiple device files match same path', () => {
      // Arrange
      mockEntries = [
        { entryName: 'MyBudget.ynab4/' },
        { entryName: 'MyBudget.ynab4/Budget.ymeta' },
        { entryName: 'MyBudget.ynab4/Budget.ymeta' }, // duplicate
      ];

      // Act & Assert
      expect(() => parseFile(Buffer.from('dummy'))).toThrow(
        'File name matches multiple files',
      );
    });

    it('throws error when reading Budget.yfull fails', () => {
      // Arrange
      mockEntries = [
        { entryName: 'MyBudget.ynab4/' },
        { entryName: 'MyBudget.ynab4/Budget.ymeta' },
        { entryName: 'MyBudget.ynab4/data/devices/deviceA' },
        { entryName: 'MyBudget.ynab4/data/deviceA/Budget.yfull' },
      ];

      mockFiles['MyBudget.ynab4/Budget.ymeta'] = JSON.stringify({
        relativeDataFolderName: 'data',
      });
      mockFiles['MyBudget.ynab4/data/devices/deviceA'] = JSON.stringify({
        hasFullKnowledge: true,
        deviceGUID: 'deviceA',
        shortDeviceId: 'dA',
        knowledge: 'A-10',
      });
      // We don't add the yfull file to mockFiles, so readFile will fail!

      // Act & Assert
      expect(() => parseFile(Buffer.from('dummy'))).toThrow(
        'Error reading Budget.yfull file',
      );
    });

    it('throws error when reading or parsing Budget.yfull fails', () => {
      // Arrange
      mockEntries = [
        { entryName: 'MyBudget.ynab4/' },
        { entryName: 'MyBudget.ynab4/Budget.ymeta' },
        { entryName: 'MyBudget.ynab4/data/devices/deviceA' },
        { entryName: 'MyBudget.ynab4/data/deviceA/Budget.yfull' },
      ];

      mockFiles['MyBudget.ynab4/Budget.ymeta'] = JSON.stringify({
        relativeDataFolderName: 'data',
      });
      mockFiles['MyBudget.ynab4/data/devices/deviceA'] = JSON.stringify({
        hasFullKnowledge: true,
        deviceGUID: 'deviceA',
        shortDeviceId: 'dA',
        knowledge: 'A-10',
      });
      // Budget.yfull has invalid JSON syntax
      mockFiles['MyBudget.ynab4/data/deviceA/Budget.yfull'] = '{invalid-json}';

      // Act & Assert
      expect(() => parseFile(Buffer.from('dummy'))).toThrow(
        'Error parsing Budget.yfull file',
      );
    });

    it('successfully parses zip structure when first entry name does not contain ynab4 (dirMatch is null)', () => {
      // Arrange
      mockEntries = [
        { entryName: 'Budget.ymeta' },
        { entryName: '/data/devices/deviceA' },
        { entryName: '/data/deviceA/Budget.yfull' },
      ];

      mockFiles['Budget.ymeta'] = JSON.stringify({
        relativeDataFolderName: 'data',
      });
      mockFiles['/data/devices/deviceA'] = JSON.stringify({
        hasFullKnowledge: true,
        deviceGUID: 'deviceA',
        shortDeviceId: 'dA',
        knowledge: 'A-10',
      });
      mockFiles['/data/deviceA/Budget.yfull'] = JSON.stringify({
        budget_name: 'Direct YNAB4 Budget',
      });

      // Act
      const data = parseFile(Buffer.from('dummy'));

      // Assert
      expect(data).toEqual({
        budget_name: 'Direct YNAB4 Budget',
      });
    });
  });

  describe('doImport', () => {
    it('successfully imports accounts, categories, payees, transactions and budgets', async () => {
      // Arrange
      const ynabData = {
        accounts: [
          {
            entityId: 'acc-ynab-1',
            accountName: 'Checking',
            onBudget: true,
            hidden: false,
            isTombstone: false,
          },
          {
            entityId: 'acc-ynab-2',
            accountName: 'Savings',
            onBudget: false,
            hidden: true,
            isTombstone: false,
          },
          { entityId: 'acc-ynab-deleted', isTombstone: true },
        ],
        masterCategories: [
          {
            entityId: 'mc-1',
            name: 'Hidden Categories',
            type: 'OUTFLOW',
            isTombstone: false,
            note: 'Hidden master notes',
            subCategories: [
              {
                entityId: 'sub-1',
                name: 'Hidden Categories ` SubA ` mc-1',
                masterCategoryId: 'mc-1',
                note: 'SubA note',
                isTombstone: false,
              },
              { entityId: 'sub-deleted', isTombstone: true },
            ],
          },
          {
            entityId: 'mc-2',
            name: 'Everyday Expenses',
            type: 'OUTFLOW',
            isTombstone: false,
            subCategories: [
              {
                entityId: 'sub-2',
                name: 'Groceries',
                masterCategoryId: 'mc-2',
                isTombstone: false,
              },
              {
                entityId: 'sub-3',
                name: 'Unbudgeted',
                masterCategoryId: 'mc-2',
                isTombstone: false,
              },
            ],
          },
          { entityId: 'mc-deleted', type: 'OUTFLOW', isTombstone: true },
        ],
        payees: [
          {
            entityId: 'payee-ynab-1',
            name: 'Supermarket',
            targetAccountId: null,
            isTombstone: false,
          },
          {
            entityId: 'payee-ynab-transfer',
            name: 'Transfer to Savings',
            targetAccountId: 'acc-ynab-2',
            isTombstone: false,
          },
          { entityId: 'payee-ynab-deleted', isTombstone: true },
        ],
        transactions: [
          {
            entityId: 'tx-1',
            accountId: 'acc-ynab-1',
            amount: -15.5,
            categoryId: 'sub-2',
            date: '2026-06-01',
            memo: 'Weekly shopping',
            cleared: 'Cleared',
            transferTransactionId: 'tx-income',
            targetAccountId: 'acc-ynab-2',
            payeeId: 'payee-ynab-1',
          },
          {
            entityId: 'tx-split',
            accountId: 'acc-ynab-1',
            amount: -100,
            categoryId: 'Category/__Split__',
            date: '2026-06-02',
            cleared: 'Reconciled',
            isTombstone: false,
            payeeId: 'payee-ynab-1',
            subTransactions: [
              {
                entityId: 'subtx-1',
                amount: -40,
                categoryId: 'sub-2',
                memo: 'SubNotes',
                isTombstone: false,
                payeeId: 'payee-ynab-1',
              },
              {
                entityId: 'subtx-2',
                amount: -60,
                categoryId: 'sub-2',
                memo: null,
                isTombstone: false,
                payeeId: 'payee-ynab-1',
              },
              { entityId: 'subtx-deleted', isTombstone: true },
            ],
          },
          {
            entityId: 'tx-offbudget',
            accountId: 'acc-ynab-2',
            amount: -50,
            categoryId: 'sub-2',
            date: '2026-06-01',
            isTombstone: false,
            payeeId: 'payee-ynab-1',
          },
          {
            entityId: 'tx-income',
            accountId: 'acc-ynab-1',
            amount: 500,
            categoryId: 'Category/__ImmediateIncome__',
            date: '2026-06-03',
            cleared: 'Uncleared',
            isTombstone: false,
            payeeId: 'payee-ynab-1',
          },
          { entityId: 'tx-deleted', isTombstone: true },
        ],
        monthlyBudgets: [
          {
            month: '2026-06-01',
            monthlySubCategoryBudgets: [
              {
                categoryId: 'sub-2',
                budgeted: 100,
                overspendingHandling: 'AffectsBuffer',
                isTombstone: false,
              },
              {
                categoryId: 'sub-1',
                budgeted: 50,
                overspendingHandling: 'Confined',
                isTombstone: false,
              },
              { categoryId: 'sub-deleted', isTombstone: true },
            ],
          },
        ],
      };

      // Mock API handlers
      vi.mocked(send).mockImplementation(async (method: string, args?: any) => {
        switch (method) {
          case 'api/account-create':
            return `act-created-${args.account.name}`;
          case 'api/category-group-create':
            return `cg-created-${args.group.name}`;
          case 'api/category-create':
            return `cat-created-${args.category.name}`;
          case 'api/payee-create':
            return `payee-created-${args.payee.name}`;
          case 'api/categories-get':
            return [{ id: 'cat-income-id', name: 'Income' }];
          case 'api/accounts-get':
            return [
              {
                id: 'act-created-Checking',
                name: 'Checking',
                offbudget: false,
              },
              { id: 'act-created-Savings', name: 'Savings', offbudget: true },
            ];
          case 'api/payees-get':
            return [
              { id: 'payee-created-Supermarket', name: 'Supermarket' },
              {
                id: 'payee-created-Transfer to Savings',
                name: 'Transfer to Savings',
                transfer_acct: 'act-created-Savings',
              },
            ];
          default:
            return null;
        }
      });

      // Act
      await doImport(ynabData as any);

      // Assert calls to create entities
      expect(send).toHaveBeenCalledWith('api/account-create', {
        account: { name: 'Checking', offbudget: false, closed: false },
      });
      expect(send).toHaveBeenCalledWith('api/account-create', {
        account: { name: 'Savings', offbudget: true, closed: true },
      });
      expect(send).toHaveBeenCalledWith('api/category-group-create', {
        group: { name: 'Everyday Expenses', is_income: false },
      });
      // The Hidden Categories group name triggers splits by '/' instead of ' ` '
      expect(send).toHaveBeenCalledWith('api/category-create', {
        category: {
          name: 'Hidden Categories/SubA',
          group_id: 'cg-created-Hidden Categories',
        },
      });
      expect(send).toHaveBeenCalledWith('notes-save', {
        id: 'cat-created-Hidden Categories/SubA',
        note: 'SubA note',
      });
      expect(send).toHaveBeenCalledWith('notes-save', {
        id: 'cg-created-Hidden Categories',
        note: 'Hidden master notes',
      });

      // Transactions addition assertions
      expect(send).toHaveBeenCalledWith(
        'api/transactions-add',
        expect.objectContaining({
          accountId: 'act-created-Checking',
          learnCategories: true,
          runTransfers: false,
        }),
      );

      // Budgets set amount assertions
      expect(send).toHaveBeenCalledWith('api/budget-set-amount', {
        month: '2026-06',
        categoryId: 'cat-created-Groceries',
        amount: 10000,
      });
      expect(send).toHaveBeenCalledWith('api/budget-set-carryover', {
        month: '2026-06',
        categoryId: 'cat-created-Groceries',
        flag: false,
      });
      expect(send).toHaveBeenCalledWith('api/budget-set-carryover', {
        month: '2026-06',
        categoryId: 'cat-created-Hidden Categories/SubA',
        flag: true,
      });
    });

    it('throws error if account of transaction is not found during import', async () => {
      // Arrange
      const ynabData = {
        accounts: [],
        masterCategories: [],
        payees: [],
        transactions: [
          {
            entityId: 'tx-orphan-acct',
            accountId: 'acc-does-not-exist',
            amount: -10,
            date: '2026-06-01',
            isTombstone: false,
          },
        ],
        monthlyBudgets: [],
      };

      vi.mocked(send).mockImplementation(async (method: string) => {
        if (method === 'api/categories-get') {
          return [{ id: 'cat-income-id', name: 'Income' }];
        }
        if (method === 'api/accounts-get') {
          return []; // empty accounts
        }
        return null;
      });

      // Act & Assert
      await expect(doImport(ynabData as any)).rejects.toThrow(
        'Could not find account for transaction when importing',
      );
    });
  });
});
