export const mockSimpleFinAccessKey = 'https://user:pass@beta-bridge.simplefin.org/simplefin';

export const mockSimpleFinToken = Buffer.from(
  'https://beta-bridge.simplefin.org/simplefin/claim',
).toString('base64');

export const mockSimpleFinAccount = {
  id: 'acc-001',
  name: 'SimpleFIN Checking',
  currency: 'USD',
  balance: '2450.87',
  'balance-date': 1719000000,
  org: {
    name: 'Test Bank',
    domain: 'testbank.com',
  },
};

export const mockSimpleFinAccount2 = {
  id: 'acc-002',
  name: 'SimpleFIN Savings',
  currency: 'USD',
  balance: '8765.43',
  'balance-date': 1719000000,
  org: {
    name: 'Test Bank',
    domain: 'testbank.com',
  },
};

export const mockSimpleFinTransaction = {
  id: 'tx-001',
  posted: 1719000000,
  transacted_at: 1718900000,
  amount: '-45.50',
  payee: 'Grocery Store',
  description: 'Weekly groceries',
};

export const mockSimpleFinTransactionPending = {
  id: 'tx-002',
  posted: 0,
  transacted_at: 1719000000,
  amount: '89.99',
  payee: 'Online Store',
  description: 'Headphones order',
  pending: true,
};

export const mockSimpleFinTransaction2 = {
  id: 'tx-003',
  posted: 1719100000,
  transacted_at: 1719100000,
  amount: '1500.00',
  payee: 'Employer Inc',
  description: 'Salary deposit',
};

export const mockSimpleFinAccountsResponse = {
  accounts: [
    {
      ...mockSimpleFinAccount,
      transactions: [mockSimpleFinTransaction, mockSimpleFinTransactionPending],
    },
    {
      ...mockSimpleFinAccount2,
      transactions: [mockSimpleFinTransaction2],
    },
  ],
  errors: [],
};

export const mockSimpleFinAccountsBalancesOnly = {
  accounts: [
    {
      ...mockSimpleFinAccount,
      transactions: [],
    },
    {
      ...mockSimpleFinAccount2,
      transactions: [],
    },
  ],
  errors: [],
};
