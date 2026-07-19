// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import { handlers } from '../main';
import { runHandler } from '../mutators';

describe('Rules Integration Tests - addRule', () => {
  beforeEach(global.emptyDatabase());

  /**
   * INT-DB-F11.1: Crear regla desde el backend (addRule) - Happy Path
   */
  it('INT-DB-F11.1: Crear regla válida', async () => {
    const ruleData = {
      stage: 'pre',
      conditionsOp: 'and',
      conditions: [{ op: 'is', field: 'payee', value: 'kroger' }],
      actions: [{ op: 'set', field: 'category', value: 'food' }],
    };

    const result = await runHandler(handlers['rule-add'], ruleData);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect((result as any).error).toBeUndefined();

    const dbRule = await db.first<db.DbRule>(
      'SELECT * FROM rules WHERE id = ?',
      [result.id],
    );

    expect(dbRule).toBeDefined();
    expect(dbRule?.stage).toBe('pre');
    expect(dbRule?.conditions).toContain('kroger');
  });

  /**
   * INT-DB-F11.2: Crear regla con formato inválido debe retornar error
   */
  it('INT-DB-F11.2: Crear regla con operador inválido retorna error de validación', async () => {
    const ruleData = {
      stage: 'pre',
      conditionsOp: 'and',
      // Operador 'noop' no existe
      conditions: [{ op: 'noop', field: 'date', value: '2026-07' }],
      actions: [{ op: 'set', field: 'notes', value: 'invalid test' }],
    };

    const result = await runHandler(handlers['rule-add'], ruleData);

    // Debe retornar un objeto con error y no insertarlo
    expect((result as any).error).toBeDefined();
    expect((result as any).error.conditionErrors).toBeDefined();
    
    // Verificamos que no se haya insertado en base de datos
    const allRules = await db.all<db.DbRule>('SELECT * FROM rules');
    expect(allRules.length).toBe(0);
  });
});