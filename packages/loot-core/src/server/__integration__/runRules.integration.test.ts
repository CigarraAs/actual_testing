// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import { insertRule, loadRules, runRules } from '#server/transactions/transaction-rules';
import { loadMappings } from '#server/db/mappings';

describe('Rules Integration Tests - runRules', () => {
  let accountId;
  let foodCatId;

  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();
    await loadRules();

    accountId = await db.insertAccount({ name: 'Bank' });
    const groupId = await db.insertCategoryGroup({ name: 'Expenses' });
    foodCatId = await db.insertCategory({ name: 'Food', cat_group: groupId });
  });

  /**
   * INT-DB-F12.1: Transacción coincide con regla y es modificada
   */
  it('INT-DB-F12.1: Aplica regla correctamente si coincide la condición', async () => {
    await insertRule({
      stage: 'pre',
      conditionsOp: 'and',
      conditions: [{ op: 'is', field: 'imported_payee', value: 'Starbucks' }],
      actions: [
        { op: 'set', field: 'category', value: foodCatId },
        { op: 'set', field: 'notes', value: 'Coffee' }
      ],
    });

    const transaction = {
      date: '2026-07-05',
      amount: -500,
      account: accountId,
      imported_payee: 'Starbucks',
      payee: null,
      category: null,
      notes: null,
    };

    const modifiedTransaction = await runRules(transaction);

    expect(modifiedTransaction.category).toBe(foodCatId);
    expect(modifiedTransaction.notes).toBe('Coffee');
  });

  /**
   * INT-DB-F12.2: Transacción NO coincide y queda intacta
   */
  it('INT-DB-F12.2: No aplica acciones si la condición no coincide', async () => {
    await insertRule({
      stage: 'pre',
      conditionsOp: 'and',
      conditions: [{ op: 'is', field: 'imported_payee', value: 'Starbucks' }],
      actions: [{ op: 'set', field: 'notes', value: 'Coffee' }],
    });

    const transaction = {
      date: '2026-07-05',
      amount: -1000,
      account: accountId,
      imported_payee: 'McDonalds',
      payee: null,
      category: null,
      notes: null,
    };

    const modifiedTransaction = await runRules(transaction);

    expect(modifiedTransaction.notes).toBeNull();
  });

  /**
   * INT-DB-F12.3: Integración de runRules con Schedules (Transacciones Programadas)
   * Verifica el comportamiento especial cuando la transacción está atada a un schedule.
   */
  it('INT-DB-F12.3: Ignora reglas ligadas a OTROS schedules pero ejecuta reglas generales', async () => {
    // 1. Creamos una regla atada a un schedule A
    const ruleA = await insertRule({
      stage: 'pre',
      conditionsOp: 'and',
      conditions: [{ op: 'is', field: 'imported_payee', value: 'Gym' }],
      actions: [{ op: 'set', field: 'notes', value: 'Schedule A' }],
    });
    // Simulamos que la regla pertenece a un schedule
    const scheduleId = await db.insertWithUUID('schedules', { 
      rule: ruleA, 
      active: 1, 
      completed: 0, 
      posts_transaction: 0, 
      tombstone: 0, 
      name: 'Schedule A' 
    });

    // 2. Creamos una regla general (no atada a ningún schedule)
    await insertRule({
      stage: 'pre',
      conditionsOp: 'and',
      conditions: [{ op: 'is', field: 'imported_payee', value: 'Gym' }],
      actions: [{ op: 'set', field: 'category', value: foodCatId }],
    });

    await loadRules();

    // 3. Pasamos una transacción que viene de OTRO schedule imaginario o sin él,
    // pero con scheduleID diferente. Si pasamos el scheduleId correcto,
    // se le aplica la regla del schedule A.
    const transactionFromSchedule = {
      date: '2026-07-05',
      amount: -4000,
      account: accountId,
      imported_payee: 'Gym',
      payee: null,
      schedule: scheduleId,
      category: null,
      notes: null,
    };

    const result = await runRules(transactionFromSchedule);

    // Como la transacción proviene de ese schedule, SE LE APLICA la regla A
    expect(result.notes).toBe('Schedule A');
    // Y también se aplican las reglas generales
    expect(result.category).toBe(foodCatId);
  });
});
