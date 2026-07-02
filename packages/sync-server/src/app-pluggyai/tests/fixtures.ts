import type { PluggyAccount, PluggyTransaction } from 'pluggy-sdk';

export const mockPluggyAccount: PluggyAccount = {
  id: 'acc-pluggy-001',
  name: 'Pluggy Checking',
  type: 'DEPOSITORY',
  subtype: 'CHECKING',
  balance: 2450.87,
  currencyCode: 'BRL',
  updatedAt: '2024-06-22T10:00:00Z',
  owner: 'Jane Doe',
} as unknown as PluggyAccount;

export const mockPluggyCreditAccount: PluggyAccount = {
  id: 'acc-pluggy-002',
  name: 'Pluggy Credit Card',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  balance: -1245.99,
  currencyCode: 'BRL',
  updatedAt: '2024-06-22T10:00:00Z',
  owner: 'Jane Doe',
} as unknown as PluggyAccount;

export const mockPluggySandboxAccount: PluggyAccount = {
  id: 'acc-pluggy-sandbox',
  name: 'Sandbox Account',
  type: 'DEPOSITORY',
  subtype: 'CHECKING',
  balance: 999.99,
  currencyCode: 'BRL',
  updatedAt: '2024-06-22T10:00:00Z',
  owner: 'John Doe',
} as unknown as PluggyAccount;

export const mockPluggyAccountsResponse = {
  results: [mockPluggyAccount, mockPluggyCreditAccount],
  total: 2,
  totalPages: 1,
};

export const mockPluggySandboxAccountsResponse = {
  results: [mockPluggySandboxAccount],
  total: 1,
  totalPages: 1,
};

export const mockPluggyTransaction: PluggyTransaction = {
  id: 'tx-pluggy-001',
  description: 'Grocery store purchase',
  descriptionRaw: 'GROCERY STORE',
  amount: -125.5,
  amountInAccountCurrency: -125.5,
  currencyCode: 'BRL',
  date: '2024-06-15',
  status: 'POSTED',
  type: 'DEBIT',
  merchant: {
    name: 'Supermercado Bom',
    businessName: 'Supermercado Bom LTDA',
  },
} as unknown as PluggyTransaction;

export const mockPluggyCreditTransaction: PluggyTransaction = {
  id: 'tx-pluggy-002',
  description: 'Salary',
  descriptionRaw: 'SALARY DEPOSIT',
  amount: 4500.0,
  amountInAccountCurrency: 4500.0,
  currencyCode: 'BRL',
  date: '2024-06-20',
  status: 'POSTED',
  type: 'CREDIT',
  paymentData: {
    payer: {
      name: 'Employer Inc',
      documentNumber: { value: '12345678901234' },
    },
  },
} as unknown as PluggyTransaction;

export const mockPluggyPendingTransaction: PluggyTransaction = {
  id: 'tx-pluggy-003',
  description: 'Online order',
  descriptionRaw: 'ONLINE ORDER',
  amount: -299.99,
  amountInAccountCurrency: -299.99,
  currencyCode: 'BRL',
  date: '2024-06-22',
  status: 'PENDING',
  type: 'DEBIT',
  merchant: {
    name: 'Loja Online',
    businessName: 'Loja Online SA',
  },
} as unknown as PluggyTransaction;

export const mockPluggyTransactionDebitNoMerchant: PluggyTransaction = {
  id: 'tx-pluggy-004',
  description: 'Transfer',
  amount: -500.0,
  amountInAccountCurrency: -500.0,
  currencyCode: 'BRL',
  date: '2024-06-18',
  status: 'POSTED',
  type: 'DEBIT',
  paymentData: {
    receiver: {
      name: 'Friend Name',
    },
  },
} as unknown as PluggyTransaction;

export const mockPluggyTransactionsResponse = {
  results: [
    mockPluggyTransaction,
    mockPluggyCreditTransaction,
    mockPluggyPendingTransaction,
  ],
  total: 3,
  totalPages: 1,
  page: 1,
};

export const mockPluggyPaginatedPage1 = {
  results: [mockPluggyTransaction],
  total: 3,
  totalPages: 3,
  page: 1,
};

export const mockPluggyPaginatedPage2 = {
  results: [mockPluggyCreditTransaction],
  total: 3,
  totalPages: 3,
  page: 2,
};

export const mockPluggyPaginatedPage3 = {
  results: [mockPluggyPendingTransaction],
  total: 3,
  totalPages: 3,
  page: 3,
};
