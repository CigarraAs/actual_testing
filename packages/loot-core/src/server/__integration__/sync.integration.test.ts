// @ts-strict-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Timestamp } from '@actual-app/crdt';

import * as post from '#server/post';
import * as prefs from '#server/prefs';
import {
  batchMessages,
  sendMessages,
  setSyncingMode,
  applyMessages,
} from '../sync';
import * as mockSyncServer from '../tests/mockSyncServer';
import * as exceptions from '#platform/exceptions';

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
});
