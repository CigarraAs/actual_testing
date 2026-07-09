// @ts-strict-ignore
import { describe, it, expect, afterEach } from 'vitest';

import * as encryption from '#server/encryption';

const FINANCIAL_DATA = [
  { type: 'transaction', payload: '{"account":"Checking","payee":"Amazon","category":"Shopping","amount":-15000,"date":20260615}' },
  { type: 'budget', payload: '{"category":"Groceries","month":"2026-06","amount":50000}' },
  { type: 'account', payload: '{"name":"Savings","offBudget":false,"balance":250000}' },
  { type: 'message', payload: '{"dataset":"transactions","row":"txn-001","column":"amount","value":5000}' },
];

describe('System Test: Security — E2EE encryption (SYS-004)', () => {
  afterEach(() => encryption.unloadAllKeys());

  /**
   * SYS-004.1: Crear clave, cifrar datos financieros y verificar opacidad.
   * RNF-003 – Encriptación E2EE.
   *
   * Verifica que:
   * - Se puede crear una clave de encriptación a partir de contraseña y salt.
   * - Los datos financieros cifrados no contienen información en texto plano.
   * - El descifrado con la misma clave recupera exactamente los datos originales.
   */
  it('SYS-004.1: Cifrar y descifrar datos financieros — round-trip', async () => {
    const key = await encryption.createKey({
      id: 'sys004-key',
      password: 'MyS3cur3P@ssw0rd!',
      salt: 'sys004-salt',
    });
    await encryption.loadKey(key);
    expect(encryption.hasKey('sys004-key')).toBe(true);

    for (const { type, payload } of FINANCIAL_DATA) {
      const encrypted = await encryption.encrypt(payload, 'sys004-key');

      expect(encrypted).toBeDefined();
      expect(encrypted.value).toBeDefined();
      expect(encrypted.meta).toBeDefined();
      expect(encrypted.meta.keyId).toBe('sys004-key');
      expect(encrypted.meta.algorithm).toBe('aes-256-gcm');
      expect(encrypted.meta.iv).toBeTruthy();
      expect(encrypted.meta.authTag).toBeTruthy();

      const ciphertext = encrypted.value.toString();
      const sensitiveTerms = ['Checking', 'Amazon', 'Groceries', '50000', '250000', 'Shopping', 'Savings'];
      for (const term of sensitiveTerms) {
        expect(ciphertext).not.toContain(term);
      }

      const decrypted = await encryption.decrypt(encrypted.value, encrypted.meta);
      expect(decrypted.toString()).toBe(payload);
    }
  });

  /**
   * SYS-004.2: Verificar que sin la clave correcta no se puede descifrar.
   * RNF-003 – Encriptación E2EE.
   *
   * Verifica que:
   * - Intentar descifrar sin tener la clave cargada lanza error 'missing-key'.
   * - El servidor (sin acceso a la clave) no puede leer el contenido.
   */
  it('SYS-004.2: Sin clave cargada no se puede descifrar', async () => {
    const key = await encryption.createKey({
      id: 'sys004-restricted',
      password: 'SecretKey123!',
      salt: 'sys004-salt-2',
    });
    await encryption.loadKey(key);

    const payload = '{"balance":999999,"routing":"021000021","account":"1234567890"}';
    const encrypted = await encryption.encrypt(payload, 'sys004-restricted');

    encryption.unloadAllKeys();
    expect(encryption.hasKey('sys004-restricted')).toBe(false);

    expect(() => encryption.getKey('sys004-restricted')).toThrow('missing-key');
    await expect(
      encryption.decrypt(encrypted.value, encrypted.meta),
    ).rejects.toThrow('missing-key');
  });

  /**
   * SYS-004.3: Verificar que una clave diferente no puede descifrar datos
   * ajenos. RNF-003 – Encriptación E2EE.
   */
  it('SYS-004.3: Clave diferente no descifra datos de otra clave', async () => {
    const keyA = await encryption.createKey({
      id: 'sys004-key-a',
      password: 'PasswordAlpha1!',
      salt: 'salt-alpha',
    });
    const keyB = await encryption.createKey({
      id: 'sys004-key-b',
      password: 'PasswordBeta2@',
      salt: 'salt-beta',
    });
    await encryption.loadKey(keyA);
    await encryption.loadKey(keyB);

    const payload = '{"source":"key-a-owner","content":"This should only be readable by key A"}';
    const encryptedByA = await encryption.encrypt(payload, 'sys004-key-a');

    encryption.unloadKey(keyA);
    expect(encryption.hasKey('sys004-key-a')).toBe(false);

    await expect(
      encryption.decrypt(encryptedByA.value, {
        ...encryptedByA.meta,
        keyId: 'sys004-key-b',
      }),
    ).rejects.toThrow();
  });

  /**
   * SYS-004.4: Serialización y deserialización de claves.
   * RNF-003 – Encriptación E2EE.
   *
   * Verifica que una clave se puede serializar, almacenar como string,
   * y luego reconstruir para descifrar datos previamente cifrados.
   */
  it('SYS-004.4: Serializar clave, descargar, recargar y descifrar', async () => {
    const key = await encryption.createKey({
      id: 'sys004-persist',
      password: 'LongTermStorage!!',
      salt: 'persist-salt',
    });
    await encryption.loadKey(key);

    const payload = '{"document":"tax-return-2026","year":2026,"totalIncome":8500000}';
    const encrypted = await encryption.encrypt(payload, 'sys004-persist');

    const serialized = key.serialize();
    expect(serialized.id).toBe('sys004-persist');
    expect(serialized.base64).toBeTruthy();

    encryption.unloadAllKeys();
    expect(encryption.hasKey('sys004-persist')).toBe(false);

    await encryption.loadKey(serialized);
    expect(encryption.hasKey('sys004-persist')).toBe(true);

    const decrypted = await encryption.decrypt(encrypted.value, encrypted.meta);
    expect(decrypted.toString()).toBe(payload);
  });
});
