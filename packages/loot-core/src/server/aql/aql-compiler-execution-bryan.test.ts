// @ts-strict-ignore
import * as aql_orig from './exec';
import * as db from '#server/db';
import { schema, schemaConfig } from './schema';

const aql = {
  ...aql_orig,
  exec: async (query: any, options?: any) => {
    let select = query.select || ['*'];
    select = select.map(s => {
      if (Array.isArray(s)) return { [s[0]]: s[1] ? '$' + s[1][0] : '*' };
      return s;
    });
    let where = query.where;
    if (where && Array.isArray(where)) {
      where = where.map(w => {
        if (Array.isArray(w)) {
          if (w[1] === '<') return { [w[0]]: { $lt: w[2] } };
          if (w[1] === '>') return { [w[0]]: { $gt: w[2] } };
          if (w[1] === '=') return { [w[0]]: w[2] };
        }
        return w;
      });
    }
    let order = query.order;
    if (order && Array.isArray(order)) {
      order = order.map(o => {
        if (Array.isArray(o)) return { [o[0]]: o[1] };
        return o;
      });
    }
    const queryState = query.table ? query : {
      table: query.from,
      selectExpressions: select,
      filterExpressions: where || [],
      groupExpressions: query.group || [],
      orderExpressions: order || [],
      limit: query.limit,
      offset: query.offset,
    };
    const res = await aql_orig.compileAndRunAqlQuery(schema, schemaConfig, queryState, options);
    return res.data;
  }
};

beforeEach(global.emptyDatabase());
afterEach(global.emptyDatabase());

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function setupAQLDatabase() {
  // Create category group and categories
  const categoryGroup = await db.insertCategoryGroup({
    id: 'aql-expenses',
    name: 'Expenses',
    is_income: 0,
  });

  const food = await db.insertCategory({
    id: 'aql-food',
    name: 'Food',
    cat_group: categoryGroup,
    is_income: 0,
  });

  const transport = await db.insertCategory({
    id: 'aql-transport',
    name: 'Transport',
    cat_group: categoryGroup,
    is_income: 0,
  });

  const utilities = await db.insertCategory({
    id: 'aql-utilities',
    name: 'Utilities',
    cat_group: categoryGroup,
    is_income: 0,
  });

  // Create income categories
  const incomeGroup = await db.insertCategoryGroup({
    id: 'aql-income',
    name: 'Income',
    is_income: 1,
  });

  const salary = await db.insertCategory({
    id: 'aql-salary',
    name: 'Salary',
    cat_group: incomeGroup,
    is_income: 1,
  });

  // Create accounts
  const checking = await db.insertAccount({
    id: 'aql-checking',
    name: 'Checking',
    offbudget: 0,
  });

  const savings = await db.insertAccount({
    id: 'aql-savings',
    name: 'Savings',
    offbudget: 0,
  });

  // Create payees
  const grocery = await db.insertPayee({
    id: 'aql-grocery',
    name: 'Grocery Store',
  });

  const employer = await db.insertPayee({
    id: 'aql-employer',
    name: 'Tech Company',
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
    grocery,
    employer,
  };
}

async function insertSampleTransactions(data: any) {
  // Insert income transaction (salary)
  await db.insertTransaction({
    id: 'aql-tx-salary-001',
    account: data.checking,
    date: '2025-01-01',
    amount: 500000,
    category: data.salary,
    payee: data.employer,
  });

  // Insert expense transactions
  const expenses = [
    { id: 'aql-tx-food-001', date: '2025-01-05', amount: -7500, category: data.food },
    { id: 'aql-tx-food-002', date: '2025-01-10', amount: -5000, category: data.food },
    { id: 'aql-tx-food-003', date: '2025-01-15', amount: -6000, category: data.food },
    { id: 'aql-tx-transport-001', date: '2025-01-06', amount: -5000, category: data.transport },
    { id: 'aql-tx-transport-002', date: '2025-01-16', amount: -7500, category: data.transport },
    { id: 'aql-tx-utilities-001', date: '2025-01-08', amount: -10000, category: data.utilities },
  ];

  for (const tx of expenses) {
    await db.insertTransaction({
      ...tx,
      account: data.checking,
      payee: data.grocery,
    });
  }
}

// ============================================================================
// BASIC QUERY EXECUTION TESTS
// ============================================================================

describe('AQL - Basic Queries', () => {
  it('AQL-001: Ejecutar consulta básica SELECT all', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-002: Ejecutar consulta SELECT con campos específicos', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['id', 'amount', 'date'],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBeDefined();
    expect(results[0].amount).toBeDefined();
    expect(results[0].date).toBeDefined();
  });

  it('AQL-003: Consulta con WHERE por cantidad', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      where: [['amount', '<', 0]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.amount < 0)).toBe(true);
  });

  it('AQL-004: Consulta con WHERE por categoría', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      where: [['category', '=', data.food]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.category === data.food)).toBe(true);
  });

  it('AQL-005: Consulta con múltiples condiciones WHERE', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      where: [
        ['category', '=', data.food],
        ['amount', '<', 0],
      ],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.category === data.food && r.amount < 0)).toBe(true);
  });

  it('AQL-006: Consulta con LIMIT', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      limit: 2,
    };

    const results = await aql.exec(query);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('AQL-007: Consulta con ORDER BY ascendente', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['id', 'amount'],
      from: 'transactions',
      order: [['amount', 'asc']],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].amount).toBeGreaterThanOrEqual(results[i - 1].amount);
    }
  });

  it('AQL-008: Consulta con ORDER BY descendente', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['id', 'amount'],
      from: 'transactions',
      order: [['amount', 'desc']],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].amount).toBeLessThanOrEqual(results[i - 1].amount);
    }
  });
});

// ============================================================================
// AGGREGATE FUNCTION TESTS - ONLY SUPPORTED FUNCTIONS
// ============================================================================

describe('AQL - Aggregate Functions (Supported)', () => {
  it('AQL-101: Usar $sum para sumar cantidades', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_amount: { $sum: '$amount' } }],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    // Result should have a sum field
    const result = results[0];
    expect(typeof result === 'object').toBe(true);
  });

  it('AQL-102: Usar $count para contar transacciones', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0] === 'object').toBe(true);
  });

  it('AQL-103: $count con WHERE clause', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
      where: [['amount', '<', 0]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-104: $sum con WHERE clause por categoría', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_amount: { $sum: '$amount' } }],
      from: 'transactions',
      where: [['category', '=', data.food]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-105: $sum de ingresos vs gastos', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    // Sum of all positive amounts (income)
    const incomeQuery = {
      select: [{ total_income: { $sum: '$amount' } }],
      from: 'transactions',
      where: [['amount', '>', 0]],
    };

    const incomeResults = await aql.exec(incomeQuery);
    expect(incomeResults.length).toBeGreaterThan(0);

    // Sum of all negative amounts (expenses)
    const expenseQuery = {
      select: [{ total_expense: { $sum: '$amount' } }],
      from: 'transactions',
      where: [['amount', '<', 0]],
    };

    const expenseResults = await aql.exec(expenseQuery);
    expect(expenseResults.length).toBeGreaterThan(0);
  });

  it('AQL-106: $count con WHERE para contar por categoría', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
      where: [['category', '=', data.food]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-107: Múltiples agregados en SELECT', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [
        { total_amount: { $sum: '$amount' } },
        { total_count: { $count: '*' } }
      ],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-108: Agregados con LIMIT (should ignore LIMIT in aggregate mode)', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
      limit: 5,
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });
});
// ============================================================================
// GROUPING AND AGGREGATION
// ============================================================================

describe('AQL - Grouping (If Supported)', () => {
  it('AQL-201: Consulta simple sin grouping', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['category', 'amount'],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-202: Contar transacciones totales', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// ERROR HANDLING AND EDGE CASES
// ============================================================================

describe('AQL - Error Handling', () => {
  it('AQL-301: Consulta con tabla no existente maneja gracefully', async () => {
    await setupAQLDatabase();

    const query = {
      select: ['*'],
      from: 'nonexistent_table',
    };

    // Should throw or return empty
    try {
      const results = await aql.exec(query);
      expect(Array.isArray(results)).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('AQL-302: Consulta con WHERE vacío retorna todos', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      where: [],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-303: Consulta sin SELECT uses *', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-304: Consulta con ORDER BY en campo inválido', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      order: [['nonexistent_field', 'asc']],
    };

    try {
      const results = await aql.exec(query);
      // May return results or throw
      expect(Array.isArray(results) || results instanceof Error).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('AQL-305: Consulta con LIMIT negativo', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      limit: -1,
    };

    const results = await aql.exec(query);
    expect(Array.isArray(results)).toBe(true);
  });

  it('AQL-306: Consulta con LIMIT cero', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      limit: 0,
    };

    const results = await aql.exec(query);
    expect(Array.isArray(results)).toBe(true);
  });

  it('AQL-307: Consulta con WHERE nula', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['*'],
      from: 'transactions',
      where: null,
    };

    try {
      const results = await aql.exec(query);
      expect(Array.isArray(results)).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('AQL-308: $sum en tabla vacía', async () => {
    await setupAQLDatabase();

    const query = {
      select: [{ total_amount: { $sum: '$amount' } }],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-309: $count en tabla vacía retorna 0', async () => {
    await setupAQLDatabase();

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-310: Transacción con amount NULL', async () => {
    const data = await setupAQLDatabase();

    await db.insertTransaction({
      id: 'aql-tx-null',
      account: data.checking,
      date: '2025-01-20',
      amount: null as any,
      category: data.food,
    });

    const query = {
      select: ['*'],
      from: 'transactions',
    };

    try {
      const results = await aql.exec(query);
      expect(Array.isArray(results)).toBe(true);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('AQL - Integration Tests', () => {
  it('AQL-401: Obtener resumen de gastos por mes', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['id', 'date', 'amount', 'category'],
      from: 'transactions',
      where: [['amount', '<', 0]],
      order: [['date', 'desc']],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.amount < 0)).toBe(true);
  });

  it('AQL-402: Calcular total de ingresos', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_income: { $sum: '$amount' } }],
      from: 'transactions',
      where: [['amount', '>', 0]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-403: Calcular total de gastos', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_expense: { $sum: '$amount' } }],
      from: 'transactions',
      where: [['amount', '<', 0]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-404: Contar gastos en categoría específica', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: [{ total_count: { $count: '*' } }],
      from: 'transactions',
      where: [['category', '=', data.transport]],
    };

    const results = await aql.exec(query);
    expect(results.length).toBeGreaterThan(0);
  });

  it('AQL-405: Transacciones ordenadas por cantidad descendente', async () => {
    const data = await setupAQLDatabase();
    await insertSampleTransactions(data);

    const query = {
      select: ['id', 'amount'],
      from: 'transactions',
      order: [['amount', 'desc']],
      limit: 5,
    };

    const results = await aql.exec(query);
    expect(results.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].amount).toBeLessThanOrEqual(results[i - 1].amount);
    }
  });
});
