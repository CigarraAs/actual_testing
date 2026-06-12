import MockDate from 'mockdate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import { loadMappings } from '#server/db/mappings';
import { loadRules } from '#server/transactions/transaction-rules';
import type { RuleConditionEntity } from '#types/models';

import { generateForecast } from './app';
import {
  buildFilterInfo,
  matchesAQLFilter,
  matchesForecastFilters,
} from './forecast-filters';
import {
  buildForecastDateContext,
  createEmptyForecastResult,
} from './forecast-projection';
import { FORECAST_UNASSIGNED_ACCOUNT_ID, getNormalizedSchedules } from './forecast-schedules';
import {
  getAccountRestrictionMode,
  getAccounts,
  matchesAccountCondition,
  resolveAccountIdsFromConditions,
} from './forecast-accounts';

describe('Forecast - Pruebas Adicionales', () => {
  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();
    await loadRules();
    MockDate.set(new Date(2024, 5, 15, 12));
  });

  afterEach(() => {
    MockDate.reset();
  });

  async function createAccount(name: string, balance = 0) {
    const id = await db.insertAccount({ name, type: 'checking', offbudget: 0 });
    if (balance > 0) {
      await db.insertTransaction({ account: id, amount: balance, date: '2024-01-01' });
    }
    return id;
  }

  // ============================================================================
  // FORE-001: generateForecast con transacciones históricas
  // ============================================================================
  it('FORE-001: generateForecast con transacciones históricas', async () => {
    const accountId = await createAccount('Checking', 1000);
    await db.insertTransaction({ account: accountId, amount: -200, date: '2024-02-15' });
    await db.insertTransaction({ account: accountId, amount: -150, date: '2024-05-10' });

    const result = await generateForecast({
      accountIds: [accountId],
      startDate: '2024-01-01',
      endDate: '2024-06-30',
    });
    expect(result.dataPoints.length).toBeGreaterThan(0);
    expect(result.forecastStartDate).toBe('2024-01-01');
    expect(result.lowestBalance).toBeDefined();
  });

  // ============================================================================
  // FORE-002: Forecast con cuentas vacías
  // ============================================================================
  it('FORE-002: generateForecast sin cuentas devuelve vacío', async () => {
    const result = await generateForecast({
      accountIds: [],
      startDate: '2024-01-01',
      endDate: '2024-06-30',
    });
    expect(result.dataPoints).toEqual([]);
    expect(result.lowestBalance.balance).toBe(0);
  });

  // ============================================================================
  // FORE-003: buildForecastDateContext con fechas explícitas
  // ============================================================================
  it('FORE-003: buildForecastDateContext con fechas explícitas', () => {
    const context = buildForecastDateContext('2024-01-01', '2024-12-31');
    expect(context.forecastStartDate).toBe('2024-01-01');
    expect(context.forecastEndDate).toBe('2024-12-31');
    expect(context.forecastDays.length).toBeGreaterThan(0);
    expect(context.endDateObj).toBeDefined();
  });

  // ============================================================================
  // FORE-004: buildForecastDateContext sin fechas
  // ============================================================================
  it('FORE-004: buildForecastDateContext sin fechas usa defaults', () => {
    const context = buildForecastDateContext(undefined, undefined);
    expect(context.forecastStartDate).toBeDefined();
    expect(context.forecastEndDate).toBeDefined();
    expect(context.forecastDays.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // FORE-005: buildFilterInfo con condiciones vacías
  // ============================================================================
  it('FORE-005: buildFilterInfo con condiciones vacías', () => {
    const { filterInfo, resolvedConditionsOp } = buildFilterInfo();
    expect(filterInfo.canRestrictAccounts).toBe(false);
    expect(resolvedConditionsOp).toBe('and');
  });

  // ============================================================================
  // FORE-006: buildFilterInfo con condiciones
  // ============================================================================
  it('FORE-006: buildFilterInfo con condiciones OR', () => {
    const conditions: RuleConditionEntity[] = [
      { op: 'is', field: 'account', value: 'acc-1' },
    ];
    const { filterInfo, resolvedConditionsOp } = buildFilterInfo(conditions, 'or');
    expect(filterInfo.canRestrictAccounts).toBe(true);
    expect(resolvedConditionsOp).toBe('or');
  });

  // ============================================================================
  // FORE-007: createEmptyForecastResult
  // ============================================================================
  it('FORE-007: createEmptyForecastResult con fechas', () => {
    const result = createEmptyForecastResult('2024-01-01', '2024-06-30');
    expect(result.dataPoints).toEqual([]);
    expect(result.forecastStartDate).toBe('2024-01-01');
  });

  // ============================================================================
  // FORE-008: matchesAQLFilter con $gte
  // ============================================================================
  it('FORE-008: matchesAQLFilter filtra con $gte', () => {
    const filter = { amount: { $gte: 100 } };
    expect(matchesAQLFilter({ amount: 200 }, filter)).toBe(true);
    expect(matchesAQLFilter({ amount: 50 }, filter)).toBe(false);
    expect(matchesAQLFilter({ amount: 100 }, filter)).toBe(true);
  });

  // ============================================================================
  // FORE-009: matchesAQLFilter con $and múltiple
  // ============================================================================
  it('FORE-009: matchesAQLFilter con $and múltiple', () => {
    const filter = { $and: [{ amount: { $gte: 100 } }, { amount: { $lte: 500 } }] };
    expect(matchesAQLFilter({ amount: 200 }, filter)).toBe(true);
    expect(matchesAQLFilter({ amount: 50 }, filter)).toBe(false);
    expect(matchesAQLFilter({ amount: 600 }, filter)).toBe(false);
  });

  // ============================================================================
  // FORE-010: matchesAQLFilter con $or
  // ============================================================================
  it('FORE-010: matchesAQLFilter con $or', () => {
    const filter = { $or: [{ amount: { $eq: 100 } }, { amount: { $eq: 200 } }] };
    expect(matchesAQLFilter({ amount: 100 }, filter)).toBe(true);
    expect(matchesAQLFilter({ amount: 200 }, filter)).toBe(true);
    expect(matchesAQLFilter({ amount: 300 }, filter)).toBe(false);
  });

  // ============================================================================
  // FORE-011: matchesAQLFilter con $neq
  // ============================================================================
  it('FORE-011: matchesAQLFilter con $ne', () => {
    const filter = { amount: { $ne: 0 } };
    expect(matchesAQLFilter({ amount: 100 }, filter)).toBe(true);
    expect(matchesAQLFilter({ amount: 0 }, filter)).toBe(false);
  });

  // ============================================================================
  // FORE-012: matchesAQLFilter con $gt / $lt
  // ============================================================================
  it('FORE-012: matchesAQLFilter con $gt y $lt', () => {
    const filter = { amount: { $gt: 50, $lt: 150 } };
    expect(matchesAQLFilter({ amount: 100 }, filter)).toBe(true);
    expect(matchesAQLFilter({ amount: 50 }, filter)).toBe(false);
    expect(matchesAQLFilter({ amount: 150 }, filter)).toBe(false);
  });

  // ============================================================================
  // FORE-013: matchesAQLFilter con comparación directa
  // ============================================================================
  it('FORE-013: matchesAQLFilter con igualdad directa', () => {
    const filter = { name: 'test' };
    expect(matchesAQLFilter({ name: 'test' }, filter)).toBe(true);
    expect(matchesAQLFilter({ name: 'other' }, filter)).toBe(false);
  });

  // ============================================================================
  // FORE-014: matchesForecastFilters sin filtros
  // ============================================================================
  it('FORE-014: matchesForecastFilters sin filtros retorna true', () => {
    const filterInfo = {
      filters: [],
      conditionsOpKey: '$and' as const,
      canRestrictAccounts: false,
    };
    const filterObject: any = {
      id: '1', amount: -50, date: '2024-01-01', notes: null, cleared: false,
      reconciled: false, transfer_id: null, is_parent: false, imported_payee: null,
      account: null, payee: null, category: null,
    };
    expect(matchesForecastFilters(filterObject, filterInfo)).toBe(true);
  });

  // ============================================================================
  // FORE-015: getAccounts con accountIds
  // ============================================================================
  it('FORE-015: getAccounts retorna cuentas con balances', async () => {
    const id1 = await createAccount('Account A', 200);
    const id2 = await createAccount('Account B', 300);

    const accounts = await getAccounts([id1, id2]);
    expect(accounts.length).toBe(2);
    expect(accounts[0].name).toBe('Account A');
    expect(typeof accounts[0].balance_current).toBe('number');
  });

  // ============================================================================
  // FORE-016: getAccounts sin filtro retorna todas
  // ============================================================================
  it('FORE-016: getAccounts sin accountIds retorna todas', async () => {
    await createAccount('A');
    await createAccount('B');
    const accounts = await getAccounts();
    expect(accounts.length).toBe(2);
  });

  // ============================================================================
  // FORE-017: getAccounts con IDs inválidos
  // ============================================================================
  it('FORE-017: getAccounts con IDs que no existen', async () => {
    const accounts = await getAccounts(['nonexistent']);
    expect(accounts.length).toBe(0);
  });

  // ============================================================================
  // FORE-018: matchesAccountCondition - is
  // ============================================================================
  it('FORE-018: matchesAccountCondition con op=is', () => {
    const account = { id: 'acc1', name: 'Test', offbudget: 0 };
    expect(matchesAccountCondition(account, { op: 'is', field: 'account', value: 'acc1' })).toBe(true);
    expect(matchesAccountCondition(account, { op: 'is', field: 'account', value: 'acc2' })).toBe(false);
  });

  // ============================================================================
  // FORE-019: matchesAccountCondition - contains
  // ============================================================================
  it('FORE-019: matchesAccountCondition con op=contains', () => {
    const account = { id: 'a1', name: 'Checking Account', offbudget: 0 };
    expect(matchesAccountCondition(account, {
      op: 'contains', field: 'account', value: 'checking',
    })).toBe(true);
    expect(matchesAccountCondition(account, {
      op: 'contains', field: 'account', value: 'savings',
    })).toBe(false);
  });

  // ============================================================================
  // FORE-020: matchesAccountCondition - onBudget/offBudget
  // ============================================================================
  it('FORE-020: matchesAccountCondition onBudget y offBudget', () => {
    const onBudgetAcc = { id: 'a1', name: 'On', offbudget: 0 };
    const offBudgetAcc = { id: 'a2', name: 'Off', offbudget: 1 };

    expect(matchesAccountCondition(onBudgetAcc, {
      op: 'onBudget', field: 'account', value: '',
    })).toBe(true);
    expect(matchesAccountCondition(offBudgetAcc, {
      op: 'offBudget', field: 'account', value: '',
    })).toBe(true);
    expect(matchesAccountCondition(onBudgetAcc, {
      op: 'offBudget', field: 'account', value: '',
    })).toBe(false);
  });

  // ============================================================================
  // FORE-021: getAccountRestrictionMode casos
  // ============================================================================
  it('FORE-021: getAccountRestrictionMode sin condiciones', () => {
    expect(getAccountRestrictionMode([], 'and')).toBe(false);
  });

  it('FORE-022: getAccountRestrictionMode solo cuentas AND', () => {
    expect(
      getAccountRestrictionMode(
        [{ op: 'is', field: 'account', value: 'x' }],
        'and',
      ),
    ).toBe(true);
  });

  it('FORE-023: getAccountRestrictionMode mixto con OR', () => {
    expect(
      getAccountRestrictionMode(
        [
          { op: 'is', field: 'account', value: 'x' },
          { op: 'is', field: 'amount', value: 100 },
        ],
        'or',
      ),
    ).toBe(false);
  });

  // ============================================================================
  // FORE-024: resolveAccountIdsFromConditions
  // ============================================================================
  it('FORE-024: resolveAccountIdsFromConditions sin condiciones', async () => {
    const result = await resolveAccountIdsFromConditions([], 'and');
    expect(result).toBeUndefined();
  });

  // ============================================================================
  // FORE-025: FORECAST_UNASSIGNED_ACCOUNT_ID
  // ============================================================================
  it('FORE-025: FORECAST_UNASSIGNED_ACCOUNT_ID definido', () => {
    expect(typeof FORECAST_UNASSIGNED_ACCOUNT_ID).toBe('string');
    expect(FORECAST_UNASSIGNED_ACCOUNT_ID.length).toBeGreaterThan(0);
  });
});
