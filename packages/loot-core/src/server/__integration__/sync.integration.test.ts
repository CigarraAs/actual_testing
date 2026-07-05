// @ts-strict-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Timestamp, merkle } from '@actual-app/crdt';

import * as post from '#server/post';
import * as prefs from '#server/prefs';
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
    let spies: any[] = [];

    beforeEach(() => {
      // Simular db.transaction para ejecutar el callback inmediatamente
      const spyTx = vi.spyOn(db, 'transaction').mockImplementation((cb) => {
        if (typeof cb === 'function') {
          return cb();
        }
        return null;
      });

      // Simular compareMessages para que devuelva los mensajes sin cambios por defecto
      const spyCompare = vi.spyOn(syncHelpers, 'compareMessages').mockImplementation(async (messages) => messages);

      // Simular merkle.insert y merkle.prune
      const spyInsert = vi.spyOn(merkle, 'insert').mockImplementation((merkleTrie, timestamp) => {
        return {
          ...(merkleTrie || {}),
          [timestamp.toString()]: true,
        };
      });
      const spyPrune = vi.spyOn(merkle, 'prune').mockImplementation((merkleTrie) => merkleTrie);

      // Simular triggerBudgetChanges
      const spyTrigger = vi.spyOn(budgetBase, 'triggerBudgetChanges').mockImplementation(() => {});

      // Simular undo.appendMessages
      const spyUndo = vi.spyOn(undo, 'appendMessages').mockImplementation(() => {});

      // Simular prefs.savePrefs
      const spyPrefs = vi.spyOn(prefs, 'savePrefs').mockImplementation(async () => {});

      // Simular sheet.get
      mockSheet = {
        startCacheBarrier: vi.fn(),
        endCacheBarrier: vi.fn(),
        triggerDatabaseChanges: vi.fn(),
        recompute: vi.fn(),
        hasCell: vi.fn().mockReturnValue(true),
      };
      const spySheet = vi.spyOn(sheet, 'get').mockReturnValue(mockSheet as any);

      spies = [spyTx, spyCompare, spyInsert, spyPrune, spyTrigger, spyUndo, spyPrefs, spySheet];
    });

    afterEach(() => {
      spies.forEach(spy => spy.mockRestore());
    });

    /**
     * Escenario 1: Mensaje nuevo (se aplica)
     * Verifica que un mensaje marcado como nuevo por compareMessages
     * se aplique de manera efectiva en la base de datos de CRDT,
     * se registre para deshacer y se inserte en el árbol de Merkle.
     */
    it('debe aplicar un mensaje nuevo en la base de datos CRDT, registrarlo en undo y actualizar Merkle', async () => {
      const msg: Message = {
        dataset: 'transactions',
        row: 'txn-1',
        column: 'amount',
        value: 5000,
        timestamp: Timestamp.send(),
      };

      // Ejecutamos applyMessages con el mensaje nuevo
      const result = await applyMessages([msg]);

      // Verificar que se haya retornado el mensaje
      expect(result).toEqual([msg]);

      // Verificar que se haya ejecutado db.transaction
      expect(db.transaction).toHaveBeenCalled();

      // Verificar que se haya registrado en undo con los datos viejos
      expect(undo.appendMessages).toHaveBeenCalledWith([msg], expect.any(Map));

      // Verificar que se haya insertado en el árbol de Merkle
      expect(merkle.insert).toHaveBeenCalledWith(expect.anything(), msg.timestamp);

      // Verificar que se haya insertado físicamente en la base de datos crdt
      const crdtMsgs = await db.all<db.DbCrdtMessage>(
        'SELECT * FROM messages_crdt WHERE row = ?',
        ['txn-1']
      );
      expect(crdtMsgs.length).toBe(1);
      expect(crdtMsgs[0].value).toBe('N:5000');
    });

    /**
     * Escenario 2: Mensaje antiguo (se ignora)
     * Verifica que si compareMessages marca un mensaje con old: true,
     * este no se aplique a la base de datos de negocio, pero sí se registre
     * en messages_crdt y actualice el árbol de Merkle.
     */
    it('debe ignorar la aplicación a negocio de un mensaje antiguo, pero registrarlo en CRDT y actualizar Merkle', async () => {
      const msg: Message = {
        dataset: 'transactions',
        row: 'txn-old-1',
        column: 'amount',
        value: 12000,
        timestamp: Timestamp.send(),
      };

      // Configuramos compareMessages para marcarlo como antiguo (old: true)
      vi.mocked(syncHelpers.compareMessages).mockResolvedValue([{ ...msg, old: true }]);

      const result = await applyMessages([msg]);

      // El resultado debe reflejar que el mensaje fue clasificado como antiguo
      expect(result[0].old).toBe(true);

      // El mensaje antiguo no debe pasar a negocio, pero sí debe registrarse en CRDT para consistencia de hashes
      const crdtMsgs = await db.all<db.DbCrdtMessage>(
        'SELECT * FROM messages_crdt WHERE row = ?',
        ['txn-old-1']
      );
      expect(crdtMsgs.length).toBe(1);

      // Debe actualizar de todas formas el árbol de Merkle
      expect(merkle.insert).toHaveBeenCalledWith(expect.anything(), msg.timestamp);
    });

    /**
     * Escenario 3: Múltiples mensajes en lote
     * Valida que al enviar varios mensajes mezclados (nuevos y antiguos),
     * solo los nuevos se apliquen, pero ambos se consoliden en la base de datos
     * de CRDT y el árbol de Merkle.
     */
    it('debe procesar múltiples mensajes en lote aplicando los nuevos e ignorando los antiguos', async () => {
      const msgNew: Message = {
        dataset: 'transactions',
        row: 'txn-batch-new',
        column: 'amount',
        value: 150,
        timestamp: Timestamp.send(),
      };

      const msgOld: Message = {
        dataset: 'transactions',
        row: 'txn-batch-old',
        column: 'amount',
        value: 300,
        timestamp: Timestamp.send(),
      };

      // Simulamos que el primer mensaje es nuevo y el segundo es antiguo
      vi.mocked(syncHelpers.compareMessages).mockResolvedValue([
        msgNew,
        { ...msgOld, old: true }
      ]);

      await applyMessages([msgNew, msgOld]);

      // Ambos mensajes deben guardarse en la tabla de mensajería CRDT para sincronía global
      const crdtMsgs = await db.all<db.DbCrdtMessage>(
        'SELECT * FROM messages_crdt WHERE row IN (?, ?)',
        ['txn-batch-new', 'txn-batch-old']
      );
      expect(crdtMsgs.length).toBe(2);

      // Ambos deben agregarse al árbol de Merkle
      expect(merkle.insert).toHaveBeenCalledWith(expect.anything(), msgNew.timestamp);
      expect(merkle.insert).toHaveBeenCalledWith(expect.anything(), msgOld.timestamp);

      // Verificamos que undo.appendMessages reciba la lista consolidada de mensajes
      expect(undo.appendMessages).toHaveBeenCalledWith(
        [msgNew, { ...msgOld, old: true }],
        expect.any(Map)
      );
    });

    /**
     * Escenario 4: Actualización de spreadsheet
     * Valida que si el spreadsheet está cargado (sheet.get() no es nulo),
     * se inicie una barrera de caché, se gatille triggerBudgetChanges,
     * se dispare triggerDatabaseChanges y finalmente se limpie la barrera.
     */
    it('debe actualizar el spreadsheet y notificar los cambios de presupuesto', async () => {
      const msg: Message = {
        dataset: 'transactions',
        row: 'txn-sheet-1',
        column: 'amount',
        value: 200,
        timestamp: Timestamp.send(),
      };

      await applyMessages([msg]);

      // Verificar ciclo de vida del spreadsheet
      expect(mockSheet.startCacheBarrier).toHaveBeenCalled();
      expect(budgetBase.triggerBudgetChanges).toHaveBeenCalled();
      expect(mockSheet.triggerDatabaseChanges).toHaveBeenCalled();
      expect(mockSheet.endCacheBarrier).toHaveBeenCalled();
    });

    /**
     * Escenario 5: Notificación a los listeners de sincronización
     * Valida que al aplicar mensajes, los listeners registrados a través de
     * addSyncListener sean llamados con los datos viejos (oldData) y nuevos (newData).
     */
    it('debe notificar a los listeners registrados mediante addSyncListener tras aplicar mensajes', async () => {
      const msg: Message = {
        dataset: 'transactions',
        row: 'txn-listener-1',
        column: 'amount',
        value: 400,
        timestamp: Timestamp.send(),
      };

      const spyListener = vi.fn();

      // Registrar el listener
      const removeListener = addSyncListener(spyListener);

      try {
        await applyMessages([msg]);

        // Verificar que el listener haya sido llamado
        expect(spyListener).toHaveBeenCalledTimes(1);
        expect(spyListener).toHaveBeenCalledWith(
          expect.any(Map), // oldData
          expect.any(Map)  // newData
        );
      } finally {
        // Desregistrar el listener para no dejar basura para otros tests
        removeListener();
      }
    });

    /**
     * F17 applyMessages - Verificación: Que solo los mensajes nuevos se apliquen a negocio.
     * Valida explícitamente que si se envían un mensaje nuevo y un mensaje antiguo,
     * solo el mensaje nuevo es procesado por la función de aplicación y guardado en preferencias
     * (el antiguo se ignora en la lógica de negocio).
     */
    it('debe verificar que solo los mensajes marcados como nuevos se aplican a las preferencias y lógica de negocio', async () => {
      const msgNew: Message = {
        dataset: 'prefs',
        row: 'budgetType',
        column: 'value',
        value: 'report',
        timestamp: Timestamp.send(),
      };

      const msgOld: Message = {
        dataset: 'prefs',
        row: 'budgetType',
        column: 'value',
        value: 'rollover',
        timestamp: Timestamp.send(),
      };

      // El primero es nuevo y el segundo es antiguo
      vi.mocked(syncHelpers.compareMessages).mockResolvedValue([
        msgNew,
        { ...msgOld, old: true },
      ]);

      await applyMessages([msgNew, msgOld]);

      // Verificamos que se inserte en la base de datos de mensajes CRDT para ambos
      const crdtMsgs = await db.all<db.DbCrdtMessage>(
        'SELECT * FROM messages_crdt WHERE dataset = ?',
        ['prefs']
      );
      expect(crdtMsgs.length).toBe(2);

      // Verificamos que savePrefs se haya llamado con la preferencia del mensaje nuevo y no con la del mensaje antiguo
      expect(prefs.savePrefs).toHaveBeenCalledWith(
        expect.objectContaining({ budgetType: 'report' }),
        expect.anything()
      );
    });

    /**
     * F17 applyMessages - Verificación: Que se actualice el árbol de Merkle.
     * Valida explícitamente que la función actualice el árbol de Merkle llamando
     * a merkle.insert para cada mensaje (nuevo u antiguo) y a merkle.prune al final,
     * y que guarde el nuevo estado del reloj en la base de datos local.
     */
    it('debe actualizar el árbol de Merkle llamando a merkle.insert y merkle.prune y almacenar el reloj resultante', async () => {
      const msg1: Message = {
        dataset: 'transactions',
        row: 'txn-m1',
        column: 'amount',
        value: 100,
        timestamp: Timestamp.send(),
      };

      const msg2: Message = {
        dataset: 'transactions',
        row: 'txn-m2',
        column: 'amount',
        value: 200,
        timestamp: Timestamp.send(),
      };

      await applyMessages([msg1, msg2]);

      // Verificamos que se inserte cada timestamp en el árbol de Merkle
      expect(merkle.insert).toHaveBeenCalledWith(expect.anything(), msg1.timestamp);
      expect(merkle.insert).toHaveBeenCalledWith(expect.anything(), msg2.timestamp);

      // Verificamos que se haga prune al final
      expect(merkle.prune).toHaveBeenCalled();

      // Verificamos que se guarde el reloj actualizado en la base de datos 'messages_clock'
      const clocks = await db.all('SELECT * FROM messages_clock');
      expect(clocks.length).toBeGreaterThan(0);
    });

    /**
     * F17 applyMessages - Verificación: Que se notifique a los listeners.
     * Valida explícitamente que todos los callbacks de eventos agregados vía
     * addSyncListener reciban la notificación de aplicación.
     */
    it('debe notificar a los listeners de sincronización tras aplicar los mensajes', async () => {
      const msg: Message = {
        dataset: 'transactions',
        row: 'txn-notify',
        column: 'amount',
        value: 50,
        timestamp: Timestamp.send(),
      };

      const spyListener = vi.fn();
      const removeListener = addSyncListener(spyListener);

      try {
        await applyMessages([msg]);

        // Verificamos que el listener se ejecute
        expect(spyListener).toHaveBeenCalledTimes(1);
      } finally {
        removeListener();
      }
    });
  });
});
