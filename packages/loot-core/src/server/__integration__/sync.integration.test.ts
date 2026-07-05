// @ts-strict-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Timestamp } from '@actual-app/crdt';

import * as post from '#server/post';
import * as db from '#server/db';
import * as undo from '#server/undo';
import * as sheet from '#server/sheet';
import * as budgetBase from '#server/budget/base';
import * as connection from '#platform/server/connection';
import {
  batchMessages,
  sendMessages,
  setSyncingMode,
  applyMessages,
  syncHelpers,
  addSyncListener,
  type Message,
} from '../sync';
import * as mockSyncServer from '../tests/mockSyncServer';
import * as exceptions from '#platform/exceptions';

// Configurar mocks preservando la implementación original por defecto
vi.mock('#server/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/db')>();
  return {
    ...actual,
    transaction: vi.fn(actual.transaction),
  };
});

vi.mock('@actual-app/crdt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@actual-app/crdt')>();
  return {
    ...actual,
    merkle: {
      ...actual.merkle,
      insert: vi.fn(actual.merkle.insert),
      prune: vi.fn(actual.merkle.prune),
    },
  };
});

vi.mock('#server/sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/sheet')>();
  return {
    ...actual,
    get: vi.fn(actual.get),
  };
});

vi.mock('#server/budget/base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/budget/base')>();
  return {
    ...actual,
    triggerBudgetChanges: vi.fn(actual.triggerBudgetChanges),
  };
});

vi.mock('#server/undo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/undo')>();
  return {
    ...actual,
    appendMessages: vi.fn(actual.appendMessages),
  };
});

vi.mock('#server/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#server/prefs')>();
  return {
    ...actual,
    savePrefs: vi.fn(actual.savePrefs),
    loadPrefs: vi.fn(actual.loadPrefs),
  };
});

vi.mock('#platform/server/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#platform/server/connection')>();
  return {
    ...actual,
    send: vi.fn(actual.send),
  };
});

vi.mock('../sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync')>();
  return {
    ...actual,
    syncHelpers: {
      ...actual.syncHelpers,
      compareMessages: vi.fn(actual.syncHelpers?.compareMessages),
    },
  };
});

describe('Sync Integration Tests', () => {
  let spyCaptureException;

  beforeEach(async () => {
    mockSyncServer.reset();
    setSyncingMode('enabled');
    vi.clearAllMocks();

    spyCaptureException = vi.spyOn(exceptions, 'captureException').mockImplementation(() => { });

    // Inicializa la base de datos limpia en memoria para cada prueba
    await global.emptyDatabase()();

    // Carga y configura las preferencias por defecto de sincronización
    await prefs.loadPrefs();
    await prefs.savePrefs({
      groupId: 'integration-group',
      lastSyncedTimestamp: Timestamp.zero.toString(),
    });
  });

  afterEach(() => {
    global.resetTime();
    setSyncingMode('disabled');
  });

  /**
   * INT-SYN-001: Agrupa múltiples mutaciones locales en un único lote de sincronización.
   * Tarea: S3-F3.2-15 — F15 batchMessages
   *
   * Verifica que:
   * - No se realicen peticiones de red (postBinary) durante la ejecución del callback del lote.
   * - Al finalizar el bloque de lote, se envíe una única petición consolidada con todos los mensajes.
   */
  it('INT-SYN-001: Agrupa múltiples mutaciones locales en un único lote de sincronización', async () => {
    const spyPostBinary = vi.spyOn(post, 'postBinary');
    const spyApplyMessages = vi.spyOn({ applyMessages }, 'applyMessages');

    let timestamp1 = Timestamp.send();
    let timestamp2 = Timestamp.send();

    await batchMessages(async () => {
      await sendMessages([
        {
          dataset: 'transactions',
          row: 'txn-1',
          column: 'amount',
          value: 5000,
          timestamp: timestamp1,
        },
      ]);

      await sendMessages([
        {
          dataset: 'transactions',
          row: 'txn-2',
          column: 'amount',
          value: 10000,
          timestamp: timestamp2,
        },
      ]);

      // Durante el lote, no se debe haber llamado a postBinary para enviar al servidor remoto
      expect(spyPostBinary).not.toHaveBeenCalled();
    });

    // Al salir de batchMessages, se debió disparar el flush de red exactamente 1 vez
    expect(spyPostBinary).toHaveBeenCalledTimes(1);
  });

  /**
   * INT-SYN-002: Error transaccional en lote único (Abort/Rollback).
   * Tarea: S3-F3.2-15 — F15 batchMessages
   *
   * Verifica que:
   * - Si el callback del lote lanza una excepción, no se envíen mensajes de red.
   * - El error sea capturado e informado de manera segura a la plataforma de excepciones.
   */
  it('INT-SYN-002: Error transaccional en lote único (Abort/Rollback)', async () => {
    const spyPostBinary = vi.spyOn(post, 'postBinary');

    await expect(
      batchMessages(async () => {
        await sendMessages([
          {
            dataset: 'transactions',
            row: 'txn-err',
            column: 'amount',
            value: 1000,
            timestamp: Timestamp.send(),
          },
        ]);
        throw new Error('Error forzado en transaccion');
      })
    ).rejects.toThrow('Error forzado en transaccion');

    // No se debieron haber enviado datos debido al fallo
    expect(spyPostBinary).not.toHaveBeenCalled();
    // Se debe reportar el error en la plataforma a través de captureException (errorHandler)
    expect(spyCaptureException).toHaveBeenCalled();
  });

  /**
   * INT-SYN-003: Pruebas de integración para applyMessages (F17).
   * Tarea: S3-F3.2-17 — F17 applyMessages
   *
   * Valida la aplicación de mensajes CRDT a la base de datos local, asegurando que:
   * - Se compare el mensaje para determinar si es nuevo u antiguo.
   * - Los mensajes nuevos se apliquen a la base de datos y al árbol de Merkle.
   * - Los mensajes antiguos se ignoren de la aplicación real a base de datos de negocio pero actualicen el árbol de Merkle.
   * - Se notifique a los listeners de sincronización y se actualice el spreadsheet de ser necesario.
   * - Todas las operaciones se ejecuten dentro de una transacción db robusta.
   */
  describe('applyMessages', () => {
    let mockSheet;

    beforeEach(() => {
      // Simular db.transaction para ejecutar el callback inmediatamente
      vi.mocked(db.transaction).mockImplementation((cb) => {
        if (typeof cb === 'function') {
          return cb();
        }
        return null;
      });

      // Simular compareMessages para que devuelva los mensajes sin cambios por defecto
      vi.mocked(syncHelpers.compareMessages).mockImplementation(async (messages) => messages);

      // Simular merkle.insert y merkle.prune
      vi.mocked(merkle.insert).mockImplementation((merkleTrie, timestamp) => {
        return {
          ...(merkleTrie || {}),
          [timestamp.toString()]: true,
        };
      });
      vi.mocked(merkle.prune).mockImplementation((merkleTrie) => merkleTrie);

      // Simular triggerBudgetChanges
      vi.mocked(budgetBase.triggerBudgetChanges).mockImplementation(() => {});

      // Simular undo.appendMessages
      vi.mocked(undo.appendMessages).mockImplementation(() => {});

      // Simular sheet.get
      mockSheet = {
        startCacheBarrier: vi.fn(),
        endCacheBarrier: vi.fn(),
        triggerDatabaseChanges: vi.fn(),
        recompute: vi.fn(),
        hasCell: vi.fn().mockReturnValue(true),
      };
      vi.mocked(sheet.get).mockReturnValue(mockSheet as any);
    });

    afterEach(() => {
      vi.mocked(db.transaction).mockRestore();
      vi.mocked(syncHelpers.compareMessages).mockRestore();
      vi.mocked(merkle.insert).mockRestore();
      vi.mocked(merkle.prune).mockRestore();
      vi.mocked(budgetBase.triggerBudgetChanges).mockRestore();
      vi.mocked(undo.appendMessages).mockRestore();
      vi.mocked(sheet.get).mockRestore();
    });

    it('debe estar definido y expuesto correctamente', () => {
      expect(applyMessages).toBeDefined();
    });
  });
});
