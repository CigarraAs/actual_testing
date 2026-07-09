// @ts-strict-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks de módulos
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('Mocked file content'),
  access: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('Mocked file content'),
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('#server/transactions/import/parse-file', () => ({
  parseFile: vi.fn(),
}));

import { batchUpdateTransactions } from '#server/transactions';
import { addTransactions } from '#server/accounts/sync';
import * as db from '#server/db';
import * as transfer from '#server/transactions/transfer';
import * as rules from '#server/transactions/transaction-rules';
import { parseFile } from '#server/transactions/import/parse-file';
import { importTransactions } from '#server/accounts/app';

describe('Transactions Integration Tests (MOCKS)', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(async () => {
    vi.clearAllMocks();
    await global.emptyDatabase()();

    // Estrategia: no mockear sendMessages ni batchMessages.
    // En modo 'disabled' (configurado en setup.ts), sendMessages escribe
    // los datos localmente en la BD en memoria sin hacer sync remoto.
    // Esto permite que getTransactionsByIds() encuentre los registros
    // insertados y llame a transfer.onInsert, etc.

    vi.spyOn(db, 'insertTransaction');
    vi.spyOn(db, 'updateTransaction');
    vi.spyOn(db, 'deleteTransaction');

    vi.spyOn(transfer, 'onInsert').mockResolvedValue(undefined);
    vi.spyOn(transfer, 'onUpdate').mockResolvedValue(undefined);
    vi.spyOn(transfer, 'onDelete').mockResolvedValue(undefined);

    vi.spyOn(rules, 'updateCategoryRules').mockResolvedValue(undefined);
    vi.spyOn(rules, 'runRules').mockImplementation(async (tx) => tx);

    // Cuentas requeridas por las transacciones (las vistas JOIN con accounts)
    await db.insertAccount({ id: 'acct_1', name: 'Test Account 1' });
    await db.insertAccount({ id: 'origen', name: 'Account Origen' });
    await db.insertAccount({ id: 'destino', name: 'Account Destino' });
  });

  describe('F08: batchUpdateTransactions', () => {
    /**
     * INT-TRANS-008-01: Inserción de una transacción simple.
     * Tarea: S3-F3.2-08 — F08 batchUpdateTransactions
     *
     * Verifica que:
     * - Al pasar un array `added`, se llame a `db.insertTransaction` una vez.
     * - La transacción insertada contenga los campos esperados.
     */
    it('debería insertar una transacción simple y llamar a db.insertTransaction', async () => {
      const added = [{ id: 'txn_001', account: 'acct_1', amount: -5000, date: '2026-07-01' }];

      await batchUpdateTransactions({ added });

      expect(db.insertTransaction).toHaveBeenCalledTimes(1);
      expect(db.insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'txn_001', amount: -5000 }),
      );
    });

    /**
     * INT-TRANS-008-02: Actualización de una transacción existente.
     * Tarea: S3-F3.2-08 — F08 batchUpdateTransactions
     *
     * Verifica que:
     * - Al pasar un array `updated`, se llame a `db.updateTransaction` una vez.
     * - Se actualice el monto y demás campos de la transacción.
     */
    it('debería actualizar una transacción y llamar a db.updateTransaction', async () => {
      const updated = [{ id: 'txn_001', amount: -10000, date: '2026-07-01' }];

      await batchUpdateTransactions({ updated });

      expect(db.updateTransaction).toHaveBeenCalledTimes(1);
      expect(db.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'txn_001', amount: -10000 }),
      );
    });

    /**
     * INT-TRANS-008-03: Eliminación (soft delete) de una transacción.
     * Tarea: S3-F3.2-08 — F08 batchUpdateTransactions
     *
     * Verifica que:
     * - Al pasar un array `deleted`, se llame a `db.deleteTransaction` una vez.
     * - La eliminación se realiza por ID.
     */
    it('debería eliminar una transacción (soft delete) y llamar a db.deleteTransaction', async () => {
      const deleted = [{ id: 'txn_001' }];

      await batchUpdateTransactions({ deleted });

      expect(db.deleteTransaction).toHaveBeenCalledTimes(1);
      expect(db.deleteTransaction).toHaveBeenCalledWith({ id: 'txn_001' });
    });

    /**
     * INT-TRANS-008-04: Procesamiento de transferencia con runTransfers: true.
     * Tarea: S3-F3.2-08 — F08 batchUpdateTransactions
     *
     * Verifica que:
     * - Si se inserta una transacción con transfer_id y `runTransfers: true`,
     *   se invoca `transfer.onInsert` con la transacción correspondiente.
     * - Para que esto funcione, la transacción debe existir en la BD.
     */
    it('debería procesar transferencia (runTransfers: true) y llamar a transfer.onInsert', async () => {
      const added = [{
        id: 'txn_transf',
        account: 'origen',
        amount: -10000,
        transfer_id: 'transf_001',
        date: '2026-07-01',
      }];

      await batchUpdateTransactions({ added, runTransfers: true });

      expect(transfer.onInsert).toHaveBeenCalledTimes(1);
      expect(transfer.onInsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'txn_transf', transfer_id: 'transf_001' }),
      );
    });

    /**
     * INT-TRANS-008-05: Aprendizaje de categorías con learnCategories: true.
     * Tarea: S3-F3.2-08 — F08 batchUpdateTransactions
     *
     * Verifica que:
     * - Si se actualiza una transacción con `category` y se establece
     *   `learnCategories: true`, se invoca `rules.updateCategoryRules`.
     */
    it('debería aprender categorías (learnCategories: true) y llamar a rules.updateCategoryRules', async () => {
      const updated = [{ id: 'txn_001', category: 'comida', date: '2026-07-01' }];

      await batchUpdateTransactions({ updated, learnCategories: true });

      expect(rules.updateCategoryRules).toHaveBeenCalledTimes(1);
    });
  });

  describe('F10: addTransactions', () => {
    /**
     * INT-TRANS-010-01: Agregar transacciones nuevas a una cuenta.
     * Tarea: S3-F3.2-10 — F10 addTransactions
     *
     * Verifica que:
     * - Se inserten todas las transacciones proporcionadas.
     * - Se llame a `db.insertTransaction` por cada una.
     * - El resultado sea un array de IDs.
     */
    it('debería agregar transacciones nuevas y llamar a db.insertTransaction', async () => {
      const transactions = [
        { amount: 100, account: 'acct_1', date: '2026-07-01' },
        { amount: -50, account: 'acct_1', date: '2026-07-02' },
      ];

      const result = await addTransactions('acct_1', transactions);

      expect(db.insertTransaction).toHaveBeenCalledTimes(2);
      expect(db.insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ account: 'acct_1', amount: 100 }),
      );
      expect(db.insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ account: 'acct_1', amount: -50 }),
      );
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    /**
     * INT-TRANS-010-02: Inserción con imported_id duplicado (sin deduplicación).
     * Tarea: S3-F3.2-10 — F10 addTransactions
     *
     * Nota: addTransactions NO verifica duplicados por imported_id; esa
     * responsabilidad es de reconcileTransactions.
     * Verifica que se inserten todas las transacciones, incluso si alguna
     * comparte imported_id con una existente.
     */
    it('debería insertar todas las transacciones aunque tengan imported_id duplicado', async () => {
      // Insertamos una transacción existente con imported_id 'bank_001'
      await db.insertTransaction({
        id: 'existing',
        account: 'acct_1',
        imported_id: 'bank_001',
        amount: -50,
        date: '2026-07-01',
      } as any);

      vi.mocked(db.insertTransaction).mockClear();

      const transactions = [
        { imported_id: 'bank_001', amount: -50, date: '2026-07-01' },
        { imported_id: 'bank_002', amount: -30, date: '2026-07-01' },
      ];

      await addTransactions('acct_1', transactions);

      // Ambas transacciones se insertan (addTransactions no deduplica)
      expect(db.insertTransaction).toHaveBeenCalledTimes(2);
      expect(db.insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ imported_id: 'bank_002', amount: -30 }),
      );
    });

    /**
     * INT-TRANS-010-03: Aplicación de reglas automáticas (runRules).
     * Tarea: S3-F3.2-10 — F10 addTransactions
     *
     * Verifica que:
     * - Se llame a `rules.runRules` con cada transacción.
     * - Las reglas pueden modificar la categoría u otros campos.
     * - La transacción insertada refleje dichas modificaciones.
     */
    it('debería aplicar reglas automáticas (runRules) a las transacciones', async () => {
      vi.mocked(rules.runRules).mockImplementation(async (tx) => ({
        ...tx,
        category: 'comida_automatica',
      }));

      const transactions = [{ amount: -100, account: 'acct_1', payee: 'Supermercado', date: '2026-07-01' }];
      await addTransactions('acct_1', transactions);

      expect(rules.runRules).toHaveBeenCalledTimes(1);
      expect(db.insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'comida_automatica' }),
      );
    });

    /**
     * INT-TRANS-010-04: Retorno de IDs de las transacciones agregadas.
     * Tarea: S3-F3.2-10 — F10 addTransactions
     *
     * Verifica que el resultado de addTransactions sea un array de strings
     * con los IDs generados para cada transacción insertada.
     */
    it('debería retornar los IDs de las transacciones agregadas', async () => {
      const transactions = [{ amount: 100, account: 'acct_1', date: '2026-07-01' }];
      const result = await addTransactions('acct_1', transactions);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(typeof result[0]).toBe('string');
    });
  });

  describe('F09: importTransactions', () => {
    /**
     * INT-TRANS-009-01: Importación exitosa de transacciones.
     * Tarea: S3-F3.2-09 — F09 importTransactions
     *
     * Verifica que:
     * - La función importTransactions procesa la lista de transacciones.
     * - No se reportan errores.
     * - Se insertan todas las transacciones en la BD.
     */
    it('debería importar transacciones exitosamente', async () => {
      const mockTransactions = [
        { imported_id: 'bank_001', amount: -100, date: '2026-07-01' },
        { imported_id: 'bank_002', amount: -200, date: '2026-07-02' },
      ];

      const result = await importTransactions({
        accountId: 'acct_1',
        transactions: mockTransactions as any,
        isPreview: false,
      });

      expect(result.errors).toEqual([]);
      expect(result.added).toHaveLength(2);
      expect(db.insertTransaction).toHaveBeenCalledTimes(2);
    });
  });
});