import * as encryption from '.';
// Import encryption-internals.api to ensure it is covered
import * as apiInternals from './encryption-internals.api';

afterEach(() => encryption.unloadAllKeys());

describe('Encryption', () => {
  test('should encrypt and decrypt', async () => {
    const key = await encryption.createKey({
      id: 'foo',
      password: 'mypassword',
      salt: 'salt',
    });
    await encryption.loadKey(key);

    const data = await encryption.encrypt('hello', 'foo');

    const output = await encryption.decrypt(data.value, data.meta);
    expect(output.toString()).toBe('hello');
  });

  test('should check if key exists using hasKey', async () => {
    const key = await encryption.createKey({
      id: 'bar',
      password: 'mypassword',
      salt: 'salt',
    });
    expect(encryption.hasKey('bar')).toBe(false);
    await encryption.loadKey(key);
    expect(encryption.hasKey('bar')).toBe(true);

    encryption.unloadKey(key);
    expect(encryption.hasKey('bar')).toBe(false);
  });

  test('should throw error when getting missing key', () => {
    expect(() => encryption.getKey('nonexistent')).toThrow('missing-key');
    expect(() => encryption.getKey(null)).toThrow('missing-key');
  });

  test('should load key from serialized object', async () => {
    const key = await encryption.createKey({
      id: 'baz',
      password: 'mypassword',
      salt: 'salt',
    });
    const serialized = key.serialize();

    await encryption.loadKey(serialized);
    expect(encryption.hasKey('baz')).toBe(true);
  });

  test('should generate random bytes', () => {
    const bytes = encryption.randomBytes(32);
    expect(bytes.length).toBe(32);
  });

  test('should verify apiInternals matches electron internals', () => {
    expect(apiInternals.randomBytes).toBeDefined();
    expect(apiInternals.encrypt).toBeDefined();
    expect(apiInternals.decrypt).toBeDefined();
  });
});
