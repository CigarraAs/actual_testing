// @ts-strict-ignore
import { describe, expect, it } from 'vitest';

import { Query, getPrimaryOrderBy, q } from './query';

describe('Query', () => {
  describe('constructor and initial state', () => {
    it('creates a Query with a table name', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.table).toBe('transactions');
    });

    it('initializes empty filter expressions', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.filterExpressions).toEqual([]);
    });

    it('initializes empty select expressions', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.selectExpressions).toEqual([]);
    });

    it('initializes empty group expressions', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.groupExpressions).toEqual([]);
    });

    it('initializes empty order expressions', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.orderExpressions).toEqual([]);
    });

    it('initializes calculation as false', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.calculation).toBe(false);
    });

    it('initializes rawMode as false', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.rawMode).toBe(false);
    });

    it('initializes withDead as false', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.withDead).toBe(false);
    });

    it('initializes validateRefs as true', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.validateRefs).toBe(true);
    });

    it('initializes limit as null', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.limit).toBeNull();
    });

    it('initializes offset as null', () => {
      const query = new Query({ table: 'transactions' });
      expect(query.state.offset).toBeNull();
    });
  });

  describe('filter()', () => {
    it('adds a filter expression', () => {
      const query = q('transactions').filter({ date: '2024-01-01' });
      expect(query.state.filterExpressions).toHaveLength(1);
      expect(query.state.filterExpressions[0]).toEqual({ date: '2024-01-01' });
    });

    it('accumulates multiple filter expressions', () => {
      const query = q('transactions')
        .filter({ date: '2024-01-01' })
        .filter({ amount: { $gt: 0 } });
      expect(query.state.filterExpressions).toHaveLength(2);
    });

    it('returns a new Query instance (immutable)', () => {
      const original = q('transactions');
      const filtered = original.filter({ date: '2024-01-01' });
      expect(filtered).not.toBe(original);
      expect(original.state.filterExpressions).toHaveLength(0);
    });
  });

  describe('unfilter()', () => {
    it('removes all filters when called with no arguments', () => {
      const query = q('transactions')
        .filter({ date: '2024-01-01' })
        .filter({ amount: 100 })
        .unfilter();
      expect(query.state.filterExpressions).toHaveLength(0);
    });

    it('removes specific filters by key', () => {
      const query = q('transactions')
        .filter({ date: '2024-01-01' })
        .filter({ amount: 100 })
        .unfilter(['date']);
      expect(query.state.filterExpressions).toHaveLength(1);
      expect(query.state.filterExpressions[0]).toEqual({ amount: 100 });
    });

    it('keeps all filters if none match', () => {
      const query = q('transactions')
        .filter({ date: '2024-01-01' })
        .unfilter(['nonexistent']);
      expect(query.state.filterExpressions).toHaveLength(1);
    });
  });

  describe('select()', () => {
    it('accepts an array of expressions', () => {
      const query = q('transactions').select(['id', 'date', 'amount']);
      expect(query.state.selectExpressions).toEqual(['id', 'date', 'amount']);
    });

    it('accepts a single string expression', () => {
      const query = q('transactions').select('id');
      expect(query.state.selectExpressions).toEqual(['id']);
    });

    it('accepts a "*" shorthand', () => {
      const query = q('transactions').select('*');
      expect(query.state.selectExpressions).toEqual(['*']);
    });

    it('accepts an object expression', () => {
      const query = q('transactions').select({ total: { $sum: 'amount' } });
      expect(query.state.selectExpressions).toEqual([
        { total: { $sum: 'amount' } },
      ]);
    });

    it('sets calculation to false', () => {
      const query = q('transactions').calculate('amount').select(['id']);
      expect(query.state.calculation).toBe(false);
    });
  });

  describe('calculate()', () => {
    it('sets selectExpressions with result wrapper', () => {
      const query = q('transactions').calculate({ $sum: 'amount' });
      expect(query.state.selectExpressions).toEqual([
        { result: { $sum: 'amount' } },
      ]);
    });

    it('sets calculation to true', () => {
      const query = q('transactions').calculate({ $sum: 'amount' });
      expect(query.state.calculation).toBe(true);
    });
  });

  describe('groupBy()', () => {
    it('adds a string group expression', () => {
      const query = q('transactions').groupBy('category');
      expect(query.state.groupExpressions).toContain('category');
    });

    it('adds an array of group expressions', () => {
      const query = q('transactions').groupBy(['category', 'account']);
      expect(query.state.groupExpressions).toEqual(['category', 'account']);
    });

    it('accumulates group expressions', () => {
      const query = q('transactions')
        .groupBy('category')
        .groupBy('account');
      expect(query.state.groupExpressions).toHaveLength(2);
    });
  });

  describe('orderBy()', () => {
    it('adds a string order expression', () => {
      const query = q('transactions').orderBy('date');
      expect(query.state.orderExpressions).toContain('date');
    });

    it('adds an object order expression', () => {
      const query = q('transactions').orderBy({ date: 'desc' });
      expect(query.state.orderExpressions).toEqual([{ date: 'desc' }]);
    });

    it('adds an array of order expressions', () => {
      const query = q('transactions').orderBy(['date', 'amount']);
      expect(query.state.orderExpressions).toEqual(['date', 'amount']);
    });

    it('accumulates order expressions', () => {
      const query = q('transactions')
        .orderBy('date')
        .orderBy('amount');
      expect(query.state.orderExpressions).toHaveLength(2);
    });
  });

  describe('limit()', () => {
    it('sets the limit', () => {
      const query = q('transactions').limit(10);
      expect(query.state.limit).toBe(10);
    });

    it('returns a new Query instance', () => {
      const original = q('transactions');
      const limited = original.limit(10);
      expect(limited).not.toBe(original);
      expect(original.state.limit).toBeNull();
    });
  });

  describe('offset()', () => {
    it('sets the offset', () => {
      const query = q('transactions').offset(20);
      expect(query.state.offset).toBe(20);
    });

    it('returns a new Query instance', () => {
      const original = q('transactions');
      const offset = original.offset(20);
      expect(offset).not.toBe(original);
      expect(original.state.offset).toBeNull();
    });
  });

  describe('raw()', () => {
    it('sets rawMode to true', () => {
      const query = q('transactions').raw();
      expect(query.state.rawMode).toBe(true);
    });
  });

  describe('withDead()', () => {
    it('sets withDead to true', () => {
      const query = q('transactions').withDead();
      expect(query.state.withDead).toBe(true);
    });
  });

  describe('withoutValidatedRefs()', () => {
    it('sets validateRefs to false', () => {
      const query = q('transactions').withoutValidatedRefs();
      expect(query.state.validateRefs).toBe(false);
    });
  });

  describe('options()', () => {
    it('sets tableOptions', () => {
      const query = q('transactions').options({ splits: 'all' });
      expect(query.state.tableOptions).toEqual({ splits: 'all' });
    });
  });

  describe('reset()', () => {
    it('returns a new query with only the table name', () => {
      const reset = q('transactions')
        .filter({ date: '2024-01' })
        .limit(10)
        .reset();
      expect(reset.state.filterExpressions).toHaveLength(0);
      expect(reset.state.limit).toBeNull();
      expect(reset.state.table).toBe('transactions');
    });
  });

  describe('serialize()', () => {
    it('returns the query state', () => {
      const query = q('transactions').filter({ date: '2024-01-01' });
      const serialized = query.serialize();
      expect(serialized.table).toBe('transactions');
      expect(serialized.filterExpressions).toHaveLength(1);
    });
  });

  describe('serializeAsString()', () => {
    it('returns JSON string representation', () => {
      const query = q('transactions');
      const str = query.serializeAsString();
      expect(typeof str).toBe('string');
      const parsed = JSON.parse(str);
      expect(parsed.table).toBe('transactions');
    });
  });

  describe('chaining', () => {
    it('supports method chaining and preserves all state', () => {
      const query = q('transactions')
        .filter({ date: { $gte: '2024-01-01' } })
        .filter({ account: 'acct1' })
        .select(['id', 'date', 'amount'])
        .orderBy({ date: 'desc' })
        .limit(50)
        .offset(0);

      expect(query.state.filterExpressions).toHaveLength(2);
      expect(query.state.selectExpressions).toEqual(['id', 'date', 'amount']);
      expect(query.state.orderExpressions).toHaveLength(1);
      expect(query.state.limit).toBe(50);
      expect(query.state.offset).toBe(0);
    });
  });
});

describe('getPrimaryOrderBy', () => {
  it('returns null when no order expressions and no default', () => {
    const query = q('transactions');
    const result = getPrimaryOrderBy(query, null);
    expect(result).toBeNull();
  });

  it('returns the default order when no order expressions', () => {
    const query = q('transactions');
    const result = getPrimaryOrderBy(query, { date: 'asc' });
    expect(result).toEqual({ order: 'asc', date: 'asc' });
  });

  it('returns the first order when it is a string', () => {
    const query = q('transactions').orderBy('date');
    const result = getPrimaryOrderBy(query, null);
    expect(result).toEqual({ field: 'date', order: 'asc' });
  });

  it('returns the first order when it is an object', () => {
    const query = q('transactions').orderBy({ date: 'desc' });
    const result = getPrimaryOrderBy(query, null);
    expect(result).toEqual({ field: 'date', order: 'desc' });
  });
});

describe('q()', () => {
  it('creates a Query for the given table', () => {
    const query = q('accounts');
    expect(query).toBeInstanceOf(Query);
    expect(query.state.table).toBe('accounts');
  });
});
