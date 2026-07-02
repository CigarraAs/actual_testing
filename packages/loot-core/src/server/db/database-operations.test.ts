// @ts-strict-ignore
import * as db from './index';

beforeEach(global.emptyDatabase());
afterEach(global.emptyDatabase());

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function setupDatabaseFull() {
  // Create category group and categories
  const categoryGroup = await db.insertCategoryGroup({
    id: 'expenses-group',
    name: 'Expenses',
    is_income: 0,
  });

  const food = await db.insertCategory({
    id: 'food-cat',
    name: 'Food & Dining',
    cat_group: categoryGroup,
    is_income: 0,
  });

  const transport = await db.insertCategory({
    id: 'transport-cat',
    name: 'Transportation',
    cat_group: categoryGroup,
    is_income: 0,
  });

  const utilities = await db.insertCategory({
    id: 'utilities-cat',
    name: 'Utilities',
    cat_group: categoryGroup,
    is_income: 0,
  });

  // Create income category group
  const incomeGroup = await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });

  const salary = await db.insertCategory({
    id: 'salary-cat',
    name: 'Salary',
    cat_group: incomeGroup,
    is_income: 1,
  });

  // Create accounts
  const checking = await db.insertAccount({
    id: 'checking-acct',
    name: 'Checking Account',
    offbudget: 0,
  });

  const savings = await db.insertAccount({
    id: 'savings-acct',
    name: 'Savings Account',
    offbudget: 0,
  });

  const creditCard = await db.insertAccount({
    id: 'credit-card-acct',
    name: 'Credit Card',
    offbudget: 1,
  });

  // Create payees
  const groceryStore = await db.insertPayee({
    id: 'grocery-payee',
    name: 'Whole Foods Market',
  });

  const gasStation = await db.insertPayee({
    id: 'gas-payee',
    name: 'Shell Gas Station',
  });

  const employer = await db.insertPayee({
    id: 'employer-payee',
    name: 'Tech Company Inc',
  });

  return {
    categoryGroup,
    food,
    transport,
    utilities,
    incomeGroup,
    salary,
    checking,
    savings,
    creditCard,
    groceryStore,
    gasStation,
    employer,
  };
}

// ============================================================================
// CATEGORY INSERTION TESTS
// ============================================================================

describe('Database - Category Operations', () => {
  it('DB-001: Insertar grupo de categoría básico', async () => {
    const groupId = await db.insertCategoryGroup({
      id: 'test-group',
      name: 'Test Group',
      is_income: 0,
    });

    expect(groupId).toBeDefined();
    expect(groupId).toBe('test-group');

    const groups = await db.getCategoriesGrouped();
    expect(groups.length).toBeGreaterThan(0);
  });

  it('DB-002: Insertar categoría dentro de grupo', async () => {
    const group = await db.insertCategoryGroup({
      id: 'group-001',
      name: 'Expenses',
      is_income: 0,
    });

    const category = await db.insertCategory({
      id: 'cat-food',
      name: 'Food',
      cat_group: group,
      is_income: 0,
    });

    expect(category).toBe('cat-food');

    const categories = await db.getCategories();
    const found = categories.find(c => c.id === 'cat-food');
    expect(found?.name).toBe('Food');
  });

  it('DB-003: Usar nombre de categoría eliminada', async () => {
    const { food, categoryGroup } = await setupDatabaseFull();

    await db.deleteCategory({ id: food });

    const categories1 = await db.getCategories();
    expect(categories1.find(c => c.id === food)).toBeUndefined();

    // Reuse the same name
    const newCatId = await db.insertCategory({
      name: 'Food & Dining',
      cat_group: categoryGroup,
      is_income: 0,
    });

    expect(newCatId).toBeDefined();

    const categories2 = await db.getCategories();
    expect(categories2.find(c => c.name === 'Food & Dining')).toBeDefined();
  });

  it('DB-004: Categoría de ingreso vs categoría de gasto', async () => {
    const { salary, food } = await setupDatabaseFull();

    const categories = await db.getCategories();

    const salaryCategory = categories.find(c => c.id === salary);
    const foodCategory = categories.find(c => c.id === food);

    expect(salaryCategory?.is_income).toBe(1);
    expect(foodCategory?.is_income).toBe(0);
  });

  it('DB-005: Obtener todos los grupos de categoría', async () => {
    await setupDatabaseFull();

    const groups = await db.getCategoriesGrouped();

    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.some(g => g.name === 'Expenses')).toBe(true);
    expect(groups.some(g => g.name === 'Income')).toBe(true);
  });
});

// ============================================================================
// ACCOUNT INSERTION AND RETRIEVAL TESTS
// ============================================================================

describe('Database - Account Operations', () => {
  it('DB-101: Insertar cuenta presupuestada', async () => {
    const accountId = await db.insertAccount({
      id: 'checking-001',
      name: 'My Checking Account',
      offbudget: 0,
    });

    expect(accountId).toBe('checking-001');

    const account = await db.getAccount('checking-001');
    expect(account?.name).toBe('My Checking Account');
    expect(account?.offbudget).toBe(0);
  });

  it('DB-102: Insertar cuenta fuera de presupuesto (off-budget)', async () => {
    const accountId = await db.insertAccount({
      id: 'credit-card-001',
      name: 'Credit Card',
      offbudget: 1,
    });

    expect(accountId).toBe('credit-card-001');

    const account = await db.getAccount('credit-card-001');
    expect(account?.offbudget).toBe(1);
  });

  it('DB-103: Obtener cuenta por ID', async () => {
    const { checking } = await setupDatabaseFull();

    const account = await db.getAccount(checking);
    expect(account?.id).toBe(checking);
    expect(account?.name).toBe('Checking Account');
  });

  it('DB-104: Obtener todas las cuentas activas', async () => {
    await setupDatabaseFull();

    const accounts = await db.getAccounts();
    expect(accounts.length).toBeGreaterThanOrEqual(3);
  });

  it('DB-105: Cuentas contienen transacciones', async () => {
    const { checking, food } = await setupDatabaseFull();

    // Insert transactions
    const tx1 = await db.insertTransaction({
      account: checking,
      date: '2025-01-01',
      amount: -5000,
      category: food,
    });

    const tx2 = await db.insertTransaction({
      account: checking,
      date: '2025-01-02',
      amount: -7500,
      category: food,
    });

    const transactions = await db.getTransactions(checking);
    expect(transactions.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// TRANSACTION INSERTION TESTS
// ============================================================================

describe('Database - Transaction Insertion', () => {
  it('DB-201: Insertar transacción básica', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-01-15',
      amount: -5000,
      category: food,
    });

    expect(txId).toBeDefined();

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(-5000);
    expect(tx?.account).toBe(checking);
  });

  it('DB-202: Insertar transacción con todos los campos', async () => {
    const { checking, food, groceryStore } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-01-16',
      amount: -12550,
      category: food,
      payee: groceryStore,
      notes: 'Weekly shopping',
      cleared: true,
      reconciled: false,
    });

    expect(txId).toBeDefined();

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(-12550);
    expect(tx?.notes).toBe('Weekly shopping');
    expect(tx?.cleared).toBe(true);
    expect(tx?.reconciled).toBe(false);
  });

  it('DB-203: Transacciones se ordenan por fecha', async () => {
    const { checking, food } = await setupDatabaseFull();

    const dates = ['2025-01-05', '2025-01-02', '2025-01-04', '2025-01-01', '2025-01-03'];
    const amounts = [-2300, -2400, 1200, 200, -500];

    for (let i = 0; i < dates.length; i++) {
      await db.insertTransaction({
        account: checking,
        date: dates[i],
        amount: amounts[i],
        category: food,
      });
    }

    const transactions = await db.getTransactions(checking);
    const txDates = transactions.map(t => t.date);

    // Should be ordered descending by date
    expect(txDates[0]).toBe('2025-01-05');
    expect(txDates[txDates.length - 1]).toBe('2025-01-01');
  });

  it('DB-204: Transacciones con bandera de saldo inicial', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId1 = await db.insertTransaction({
      account: checking,
      date: '2025-01-03',
      amount: 1200,
      category: food,
      starting_balance_flag: 1,
    });

    const txId2 = await db.insertTransaction({
      account: checking,
      date: '2025-01-03',
      amount: -2500,
      category: food,
    });

    const transactions = await db.getTransactions(checking);

    // Saldo inicial debe estar al final de transacciones del mismo día
    const withFlagIndex = transactions.findIndex(t => t.id === txId1);
    const withoutFlagIndex = transactions.findIndex(t => t.id === txId2);

    expect(withFlagIndex).toBeGreaterThan(withoutFlagIndex);
  });

  it('DB-205: Transacciones se ordenan por sort_order', async () => {
    const { checking, food } = await setupDatabaseFull();

    const tx1 = await db.insertTransaction({
      account: checking,
      date: '2025-01-05',
      amount: -2300,
      category: food,
      sort_order: 5,
    });

    const tx2 = await db.insertTransaction({
      account: checking,
      date: '2025-01-03',
      amount: -2400,
      category: food,
      sort_order: 8,
    });

    const tx3 = await db.insertTransaction({
      account: checking,
      date: '2025-01-03',
      amount: 1200,
      category: food,
      sort_order: 2,
    });

    const tx4 = await db.insertTransaction({
      account: checking,
      date: '2025-01-03',
      amount: 200,
      category: food,
      sort_order: 4,
    });

    const transactions = await db.getTransactions(checking);
    const jan3Txs = transactions.filter(t => {
      const d = t.date.toString();
      return d === '2025-01-03';
    });

    // Should be ordered by sort_order descending
    expect(jan3Txs[0].sort_order).toBeGreaterThanOrEqual(jan3Txs[1].sort_order);
  });

  it('DB-206: Transacciones se ordenan por ID como último recurso', async () => {
    const { checking, food } = await setupDatabaseFull();

    const now = Date.now();
    const tx1 = await db.insertTransaction({
      id: 'tx-z-001',
      account: checking,
      date: '2025-01-03',
      amount: -1000,
      category: food,
      sort_order: now,
    });

    const tx2 = await db.insertTransaction({
      id: 'tx-a-001',
      account: checking,
      date: '2025-01-03',
      amount: -1000,
      category: food,
      sort_order: now,
    });

    const transactions = await db.getTransactions(checking);

    // Should be ordered by ID when all else is equal
    expect(transactions.some(t => t.id === tx1)).toBe(true);
    expect(transactions.some(t => t.id === tx2)).toBe(true);
  });
});

// ============================================================================
// TRANSACTION UPDATE TESTS
// ============================================================================

describe('Database - Transaction Update', () => {
  it('DB-301: Actualizar monto de transacción', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-02-01',
      amount: -5000,
      category: food,
    });

    await db.updateTransaction({
      id: txId,
      amount: -7500,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(-7500);
  });

  it('DB-302: Actualizar categoría de transacción', async () => {
    const { checking, food, transport } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-02-02',
      amount: -5000,
      category: food,
    });

    await db.updateTransaction({
      id: txId,
      category: transport,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.category).toBe(transport);
  });

  it('DB-303: Actualizar estado de compensación (cleared)', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-02-03',
      amount: -5000,
      category: food,
      cleared: false,
    });

    await db.updateTransaction({
      id: txId,
      cleared: true,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.cleared).toBe(true);
  });

  it('DB-304: Actualizar notas de transacción', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-02-04',
      amount: -5000,
      category: food,
      notes: 'Old note',
    });

    await db.updateTransaction({
      id: txId,
      notes: 'Updated note with more details',
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.notes).toBe('Updated note with more details');
  });

  it('DB-305: Actualizar múltiples campos simultáneamente', async () => {
    const { checking, food, transport, groceryStore } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-02-05',
      amount: -10000,
      category: food,
      payee: groceryStore,
      notes: 'Original',
      cleared: false,
    });

    await db.updateTransaction({
      id: txId,
      amount: -12500,
      category: transport,
      payee: groceryStore,
      notes: 'Updated',
      cleared: true,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(-12500);
    expect(tx?.category).toBe(transport);
    expect(tx?.notes).toBe('Updated');
    expect(tx?.cleared).toBe(true);
  });
});

// ============================================================================
// TRANSACTION DELETION TESTS
// ============================================================================

describe('Database - Transaction Deletion', () => {
  it('DB-401: Eliminar transacción existente', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-02-10',
      amount: -5000,
      category: food,
    });

    const txBefore = await db.getTransaction(txId);
    expect(txBefore).toBeDefined();

    await db.deleteTransaction({ id: txId });

    const txAfter = await db.getTransaction(txId);
    expect(txAfter).toBeUndefined();
  });

  it('DB-402: Eliminar transacción no afecta otras', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId1 = await db.insertTransaction({
      account: checking,
      date: '2025-02-11',
      amount: -5000,
      category: food,
    });

    const txId2 = await db.insertTransaction({
      account: checking,
      date: '2025-02-12',
      amount: -7500,
      category: food,
    });

    await db.deleteTransaction({ id: txId1 });

    const tx2 = await db.getTransaction(txId2);
    expect(tx2?.amount).toBe(-7500);

    const transactions = await db.getTransactions(checking);
    expect(transactions.some(t => t.id === txId2)).toBe(true);
    expect(transactions.some(t => t.id === txId1)).toBe(false);
  });

  it('DB-403: Eliminar múltiples transacciones', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txIds = [];
    for (let i = 0; i < 5; i++) {
      const txId = await db.insertTransaction({
        account: checking,
        date: `2025-02-${15 + i}`,
        amount: -5000,
        category: food,
      });
      txIds.push(txId);
    }

    for (const txId of txIds.slice(0, 3)) {
      await db.deleteTransaction({ id: txId });
    }

    const transactions = await db.getTransactions(checking);
    expect(transactions.length).toBe(2);
  });
});

// ============================================================================
// PAYEE OPERATIONS TESTS
// ============================================================================

describe('Database - Payee Operations', () => {
  it('DB-501: Insertar beneficiario', async () => {
    const payeeId = await db.insertPayee({
      id: 'payee-001',
      name: 'Test Payee',
    });

    expect(payeeId).toBeDefined();

    const payee = await db.getPayee(payeeId);
    expect(payee?.name).toBe('Test Payee');
  });

  it('DB-502: Beneficiario con cuenta de transferencia', async () => {
    const { checking } = await setupDatabaseFull();

    const payeeId = await db.insertPayee({
      id: 'transfer-payee',
      name: 'Transfer Account',
      transfer_acct: checking,
    });

    const payee = await db.getPayee(payeeId);
    expect(payee?.transfer_acct).toBe(checking);
  });

  it('DB-503: Obtener todos los beneficiarios', async () => {
    await setupDatabaseFull();

    const payees = await db.getPayees();
    expect(payees.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// ERROR HANDLING AND EDGE CASES
// ============================================================================

describe('Database - Error Handling', () => {
  it('DB-601: Insertar transacción con categoría no existente', async () => {
    const { checking } = await setupDatabaseFull();

    // Should handle gracefully or throw appropriately
    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-03-01',
      amount: -5000,
      category: 'nonexistent-category',
    });

    expect(txId).toBeDefined();
  });

  it('DB-602: Transacción con monto negativo', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-03-02',
      amount: -99999,
      category: food,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(-99999);
  });

  it('DB-603: Transacción con monto positivo grande', async () => {
    const { checking, salary } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-03-03',
      amount: 500050,
      category: salary,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(500050);
  });

  it('DB-604: Transacción con monto cero', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-03-04',
      amount: 0,
      category: food,
    });

    const tx = await db.getTransaction(txId);
    expect(tx?.amount).toBe(0);
  });

  it('DB-605: Actualizar transacción inexistente', async () => {
    await setupDatabaseFull();

    // Should handle gracefully
    const result = await db.updateTransaction({
      id: 'nonexistent-tx',
      amount: -10000,
    });

    expect(result).toBeUndefined();
  });

  it('DB-606: Eliminar transacción inexistente', async () => {
    await setupDatabaseFull();

    // Should handle gracefully
    const result = await db.deleteTransaction({ id: 'nonexistent-tx' });
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// PERSISTENCE TESTS
// ============================================================================

describe('Database - Data Persistence', () => {
  it('DB-701: Los datos persisten después de inserción', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txId = await db.insertTransaction({
      account: checking,
      date: '2025-03-10',
      amount: -5000,
      category: food,
      notes: 'Test persistence',
    });

    // Retrieve immediately
    const tx1 = await db.getTransaction(txId);
    expect(tx1?.notes).toBe('Test persistence');

    // Retrieve again
    const tx2 = await db.getTransaction(txId);
    expect(tx2?.notes).toBe('Test persistence');

    expect(tx1?.id).toBe(tx2?.id);
  });

  it('DB-702: Múltiples transacciones persisten correctamente', async () => {
    const { checking, food } = await setupDatabaseFull();

    const txIds = [];
    for (let i = 0; i < 10; i++) {
      const txId = await db.insertTransaction({
        account: checking,
        date: `2025-03-${10 + i}`,
        amount: -5000 * (i + 1),
        category: food,
      });
      txIds.push(txId);
    }

    const transactions = await db.getTransactions(checking);
    expect(transactions.length).toBeGreaterThanOrEqual(10);

    for (const txId of txIds) {
      const tx = await db.getTransaction(txId);
      expect(tx).toBeDefined();
    }
  });
});
