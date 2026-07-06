// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import { getRules, loadRules } from '#server/transactions/transaction-rules';
import { loadMappings } from '#server/db/mappings';

describe('Rules Integration Tests - loadRules', () => {
  beforeEach(async () => {
    await global.emptyDatabase()();
    await loadMappings();
  });

  /**
   * INT-DB-F14.1: Cargar reglas válidas e ignorar tombstone=1
   */
  it('INT-DB-F14.1: Cargar reglas válidas ignorando eliminadas', async () => {
    await loadRules();
    expect(getRules().length).toBe(0);

    // Regla 1 (Válida)
    await db.insertWithUUID('rules', {
      stage: 'pre',
      conditions_op: 'and',
      conditions: JSON.stringify([{ op: 'is', field: 'payee', value: 'amazon' }]),
      actions: JSON.stringify([{ op: 'set', field: 'category', value: 'shopping' }]),
      tombstone: 0,
    });

    // Regla 2 (Tombstone=1, debe ser ignorada)
    await db.insertWithUUID('rules', {
      stage: 'pre',
      conditions_op: 'and',
      conditions: JSON.stringify([{ op: 'is', field: 'payee', value: 'delete_me' }]),
      actions: JSON.stringify([{ op: 'set', field: 'category', value: 'none' }]),
      tombstone: 1,
    });

    await loadRules();
    const loadedRules = getRules();

    expect(loadedRules.length).toBe(1);
    expect(loadedRules[0].conditions[0].value).toBe('amazon');
  });

  /**
   * INT-DB-F14.2: Cargar reglas defectuosas (null conditions/actions) son omitidas por SQL
   */
  it('INT-DB-F14.2: Reglas sin conditions/actions son omitidas de la carga', async () => {
    // Simulamos una inserción corrupta o parcial, en la base de datos es posible
    // (pero el query de loadRules incluye WHERE conditions IS NOT NULL AND actions IS NOT NULL)
    await db.insertWithUUID('rules', {
      stage: 'pre',
      conditions_op: 'and',
      conditions: null,
      actions: null,
      tombstone: 0,
    });

    await loadRules();
    const loadedRules = getRules();

    // La query de loadRules excluye rules con actions/conditions nulos
    expect(loadedRules.length).toBe(0);
  });
});
