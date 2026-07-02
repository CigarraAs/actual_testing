// @ts-strict-ignore
import { describe, it, expect, beforeEach } from 'vitest';

import * as db from '#server/db';
import { handlers } from '../main';
import { runHandler } from '../mutators';
import * as monthUtils from '#shared/months';

describe('Accounts Integration Tests', () => {
  beforeEach(global.emptyDatabase());

  /**
   * INT-DB-01: Crear cuenta on-budget directamente desde el código (persistencia).
   * Tarea: S3-F3.2-01 — F01 createAccount
   *
   * Verifica que:
   * - La cuenta queda guardada con closed=0 y el nombre correcto.
   * - Se genera una transacción de apertura cuyo monto equivale a 1000 dólares
   *   (amountToInteger(1000) = 100000 centavos).
   */
  it('INT-DB-01: Crear cuenta on-budget directamente desde el código (persistencia)', async () => {
    const accountId = await runHandler(handlers['account-create'], {
      name: 'Corriente',
      balance: 1000, // dólares — amountToInteger lo convierte a centavos internamente
      offBudget: false,
    });

    // Validar registro en tabla accounts
    const account = await db.first<{ closed: number; name: string }>(
      'SELECT name, closed FROM accounts WHERE id = ?',
      [accountId],
    );
    expect(account).toBeDefined();
    expect(account?.name).toBe('Corriente');
    expect(account?.closed).toBe(0);

    // Validar transacción de apertura (columna SQL = acct; campo lógico = account)
    const transaction = await db.first<{ amount: number }>(
      'SELECT amount FROM transactions WHERE acct = ? AND amount > 0',
      [accountId],
    );
    expect(transaction).toBeDefined();
    expect(transaction?.amount).toBe(100000); // 1000 * 100 = 100000 centavos
  });

  /**
   * INT-DB-02: Calcular balance después de múltiples transacciones.
   * Tarea: S3-F3.2-03 — F03 getAccountBalance
   *
   * Transacciones: +20000, -5000, -3000, +10000 → suma = 22000 centavos
   * getAccountBalance recibe { id, cutoff } y devuelve suma de amount en centavos.
   */
  it('INT-DB-02: Calcular balance después de múltiples transacciones', async () => {
    const accountId = await runHandler(handlers['account-create'], {
      name: 'Cuenta Test Balance',
      balance: 0,
      offBudget: false,
    });

    // Insertar transacciones directamente (campo lógico: account)
    await db.insertTransaction({ id: 't1', account: accountId, amount: 20000, date: '2026-06-01', cleared: true });
    await db.insertTransaction({ id: 't2', account: accountId, amount: -5000, date: '2026-06-02', cleared: true });
    await db.insertTransaction({ id: 't3', account: accountId, amount: -3000, date: '2026-06-03', cleared: true });
    await db.insertTransaction({ id: 't4', account: accountId, amount: 10000, date: '2026-06-04', cleared: true });

    // getAccountBalance usa la firma { id, cutoff }
    const balance = await runHandler(handlers['account-balance'], { id: accountId, cutoff: '2026-06-30' });
    expect(balance).toBe(22000); // 20000 - 5000 - 3000 + 10000 = 22000
  });

  /**
   * INT-DB-03: Balance considerando transferencia entre cuentas.
   * Tarea: S3-F3.2-03 — F03 getAccountBalance
   *
   * Origen parte de 50000 y transfiere 10000 → queda 40000.
   * Destino parte de 10000 y recibe 10000 → queda 20000.
   */
  it('INT-DB-03: Balance considerando transferencia entre cuentas', async () => {
    const origenId = await runHandler(handlers['account-create'], { name: 'Origen', balance: 500 }); // 500 → 50000 centavos
    const destinoId = await runHandler(handlers['account-create'], { name: 'Destino', balance: 100 }); // 100 → 10000 centavos

    const transferId = 'transf_001';
    await db.insertTransaction({
      id: 'txn_origen',
      account: origenId,
      amount: -10000,
      date: '2026-06-05',
      transfer_id: transferId,
      cleared: true,
    });
    await db.insertTransaction({
      id: 'txn_destino',
      account: destinoId,
      amount: 10000,
      date: '2026-06-05',
      transfer_id: transferId,
      cleared: true,
    });

    const balanceOrigen = await runHandler(handlers['account-balance'], { id: origenId, cutoff: '2026-06-30' });
    const balanceDestino = await runHandler(handlers['account-balance'], { id: destinoId, cutoff: '2026-06-30' });

    expect(balanceOrigen).toBe(40000); // 50000 - 10000
    expect(balanceDestino).toBe(20000); // 10000 + 10000
  });

  /**
   * INT-DB-04: Cerrar cuenta desde código (persistencia).
   * Tarea: S3-F3.2-02 — F02 closeAccount
   *
   * closeAccount({ id }) necesita parámetros en objeto.
   * Se inserta una transacción previa para que la cuenta tenga numTransactions > 0
   * (de lo contrario closeAccount la eliminaría en lugar de marcarla closed=1).
   * Balance es 0 para no requerir transferAccountId.
   */
  it('INT-DB-04: Cerrar cuenta desde código (persistencia)', async () => {
    const accountId = await runHandler(handlers['account-create'], { name: 'Cerrar', balance: 0, offBudget: false });

    // Insertar una transacción neta cero para evitar que closeAccount elimine la cuenta
    await db.insertTransaction({ id: 'ctrl_pos', account: accountId, amount: 500, date: '2026-06-01', cleared: true });
    await db.insertTransaction({ id: 'ctrl_neg', account: accountId, amount: -500, date: '2026-06-01', cleared: true });

    // closeAccount espera { id }, balance=0 no requiere transferAccountId
    await runHandler(handlers['account-close'], { id: accountId });

    const account = await db.first<{ closed: number }>(
      'SELECT closed FROM accounts WHERE id = ?',
      [accountId],
    );
    expect(account).toBeDefined();
    expect(account?.closed).toBe(1);
  });
});

