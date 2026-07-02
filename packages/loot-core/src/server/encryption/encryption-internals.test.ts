import * as internals from './encryption-internals';

describe('Encryption Internals (Browser/SubtleCrypto)', () => {
  test('should encrypt and decrypt using WebCrypto APIs', async () => {
    const key = await internals.createKey({
      secret: 'mypassword',
      salt: 'salt',
    });
    expect(key.base64).toBeDefined();
    expect(key.raw).toBeDefined();

    const importedKey = await internals.importKey(key.base64);
    expect(importedKey.base64).toBe(key.base64);
    expect(importedKey.raw).toBeDefined();

    const testValue = Buffer.from('hello-world');
    const encrypted = await internals.encrypt(
      {
        getValue: () => importedKey,
        getId: () => 'foo',
      } as any,
      testValue,
    );

    expect(encrypted.value).toBeDefined();
    expect(encrypted.meta.keyId).toBe('foo');
    expect(encrypted.meta.algorithm).toBe('aes-256-gcm');

    const decrypted = await internals.decrypt(
      {
        getValue: () => importedKey,
        getId: () => 'foo',
      } as any,
      encrypted.value,
      encrypted.meta,
    );

    expect(decrypted.toString()).toBe('hello-world');
  });

  test('randomBytes should generate expected length', () => {
    const bytes = internals.randomBytes(16);
    expect(bytes.length).toBe(16);
    expect(Buffer.isBuffer(bytes)).toBe(true);
  });

  test('should throw on unsupported algorithm', async () => {
    const key = await internals.createKey({
      secret: 'mypassword',
      salt: 'salt',
    });
    await expect(
      internals.decrypt(
        { getValue: () => key, getId: () => 'foo' } as any,
        Buffer.from(''),
        { algorithm: 'aes-128-cbc', iv: 'iv', authTag: 'tag', keyId: 'foo' },
      ),
    ).rejects.toThrow('unsupported crypto algorithm: aes-128-cbc');
  });
});
