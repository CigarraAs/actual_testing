import * as encryption from '.';

describe('Key Class', () => {
  test('should create key and call getters', async () => {
    const key = await encryption.createKey({
      id: 'key1',
      password: 'mypassword',
      salt: 'salt',
    });

    expect(key.getId()).toBe('key1');
    expect(key.getValue()).toBeDefined();
    
    const serialized = key.serialize();
    expect(serialized.id).toBe('key1');
    expect(serialized.base64).toBeDefined();
  });

  test('should fallback to uuid if id is missing', async () => {
    const key = await encryption.createKey({
      id: null,
      password: 'mypassword',
      salt: 'salt',
    });

    expect(key.getId()).toBeDefined();
    expect(key.getId().length).toBeGreaterThan(0);
  });
});
