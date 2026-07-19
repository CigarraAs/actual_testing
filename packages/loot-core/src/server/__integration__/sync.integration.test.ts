// @ts-strict-ignore
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Timestamp } from '@actual-app/crdt';

import * as post from '#server/post';
import * as prefs from '#server/prefs';
import * as db from '#server/db';
import * as exceptions from '#platform/exceptions';
import {
  batchMessages,
  sendMessages,
  setSyncingMode,
  applyMessages,
  type Message,
} from '../sync';
import * as mockSyncServer from '../tests/mockSyncServer';

describe('Sync Integration Tests', () => {
  let spyCaptureException;

  beforeEach(async () => {
    mockSyncServer.reset();
    setSyncingMode('enabled');
    vi.clearAllMocks();

    spyCaptureException = vi.spyOn(exceptions, 'captureException').mockImplementation(() => {});

    await global.emptyDatabase()();
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

  // ====================================================================
  // INT-SYN-001: batchMessages (con spy en postBinary, permitido por el plan)
  // ====================================================================
  it('INT-SYN-001: Agrupa múltiples mutaciones locales en un único lote de sincronización', async () => {
    const spyPostBinary = vi.spyOn(post, 'postBinary');

    await batchMessages(async () => {
      await sendMessages([
        {
          dataset: 'transactions',
          row: 'txn-1',
          column: 'amount',
          value: 5000,
          timestamp: Timestamp.send(),
        },
      ]);
      await sendMessages([
        {
          dataset: 'transactions',
          row: 'txn-2',
          column: 'amount',
          value: 10000,
          timestamp: Timestamp.send(),
        },
      ]);
      expect(spyPostBinary).not.toHaveBeenCalled();
    });

    expect(spyPostBinary).toHaveBeenCalledTimes(1);
  });

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

    expect(spyPostBinary).not.toHaveBeenCalled();
    expect(spyCaptureException).toHaveBeenCalled();
  });

  // ====================================================================
  // F17: applyMessages (pruebas reales SIN MOCKS)
  // ====================================================================
  describe('INT-SYN-003: F17 applyMessages (Small - SIN MOCKS)', () => {
    it('Aplica mensaje nuevo y lo persiste en messages_crdt', async () => {
      const msg: Message = {
        dataset: 'transactions',
        row: 'txn_real_1',
        column: 'amount',
        value: 5000,
        timestamp: Timestamp.send(),
      };

      await applyMessages([msg]);

      const crdtRow = await db.first<{ value: string }>(
        'SELECT value FROM messages_crdt WHERE row = ?',
        ['txn_real_1']
      );
      expect(crdtRow).toBeDefined();
      expect(crdtRow?.value).toBe('N:5000');
    });

    it('LWW: el mensaje más reciente prevalece', async () => {
      const row = 'txn_lww';
      // 1. Primer mensaje (timestamp anterior)
      const msg1: Message = {
        dataset: 'transactions',
        row,
        column: 'amount',
        value: 1000,
        timestamp: Timestamp.send(),
      };
      await applyMessages([msg1]);

      // 2. Segundo mensaje (timestamp posterior)
      const msg2: Message = {
        dataset: 'transactions',
        row,
        column: 'amount',
        value: 2000,
        timestamp: Timestamp.send(),
      };
      await applyMessages([msg2]);

      // 3. Verificar que el valor final sea 2000 (el más reciente)
      const rowData = await db.first<{ value: string }>(
        'SELECT value FROM messages_crdt WHERE row = ? ORDER BY timestamp DESC LIMIT 1',
        [row]
      );
      expect(rowData?.value).toBe('N:2000');
    });
  });
});