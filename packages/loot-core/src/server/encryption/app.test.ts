import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

import * as asyncStorage from '#platform/server/asyncStorage';
import * as prefs from '#server/prefs';

import * as encryption from '.';
import { app } from './app';

const mockStore: Record<string, string> = {};

vi.mock('#platform/server/asyncStorage', () => {
  return {
    init: vi.fn(),
    getItem: vi.fn(async (key) => mockStore[key]),
    setItem: vi.fn(async (key, value) => {
      mockStore[key] = value;
    }),
    removeItem: vi.fn(async (key) => {
      delete mockStore[key];
    }),
    multiGet: vi.fn(async (keys) => {
      return keys.reduce((acc, key) => {
        acc[key] = mockStore[key];
        return acc;
      }, {});
    }),
    multiSet: vi.fn(async (keyValues) => {
      keyValues.forEach(([key, value]) => {
        mockStore[key] = value;
      });
    }),
    multiRemove: vi.fn(async (keys) => {
      keys.forEach((key) => {
        delete mockStore[key];
      });
    }),
  };
});

vi.mock('#server/sync', () => {
  return {
    makeTestMessage: vi.fn(async (keyId) => {
      return {
        value: Buffer.from('test-value'),
        meta: {
          keyId,
          algorithm: 'aes-256-gcm',
          iv: 'iv',
          authTag: 'tag',
        },
      };
    }),
    resetSync: vi.fn(async ({ key, salt, testContent }) => {
      return { success: true };
    }),
  };
});

vi.mock('#server/post', () => {
  return {
    post: vi.fn(),
    PostError: class extends Error {
      reason: string;
      constructor(reason: string) {
        super(reason);
        this.reason = reason;
      }
    },
  };
});

vi.mock('#server/server-config', () => {
  return {
    getServer: vi.fn(() => ({
      SYNC_SERVER: 'http://mock-server',
    })),
  };
});

describe('Encryption App Handlers', () => {
  beforeEach(async () => {
    await prefs.loadPrefs();
    await asyncStorage.setItem('user-token', 'mock-token');
  });

  afterEach(async () => {
    prefs.unloadPrefs();
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
    encryption.unloadAllKeys();
  });

  test('key-make should succeed when prefs are loaded', async () => {
    const keyMakeHandler = app.handlers['key-make'];
    const result = await keyMakeHandler({ password: 'mypassword' });
    expect(result).toEqual({ success: true });
  });

  test('key-make should throw when prefs are not loaded', async () => {
    prefs.unloadPrefs();
    const keyMakeHandler = app.handlers['key-make'];
    await expect(keyMakeHandler({ password: 'mypassword' })).rejects.toThrow(
      'key-make must be called with file loaded',
    );
  });

  test('key-test should handle network error', async () => {
    const { post } = await import('#server/post');
    vi.mocked(post).mockRejectedValueOnce(new Error('network error'));

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({
      password: 'mypassword',
      cloudFileId: 'file-id',
    });
    expect(result).toEqual({ error: { reason: 'network' } });
  });

  test('key-test should handle old-key-style (null test)', async () => {
    const { post } = await import('#server/post');
    vi.mocked(post).mockResolvedValueOnce({
      id: 'key-id',
      salt: 'salt',
      test: null,
    });

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({
      password: 'mypassword',
      cloudFileId: 'file-id',
    });
    expect(result).toEqual({ error: { reason: 'old-key-style' } });
  });

  test('key-test should handle decrypt-failure', async () => {
    const { post } = await import('#server/post');
    vi.mocked(post).mockResolvedValueOnce({
      id: 'key-id',
      salt: 'salt',
      test: JSON.stringify({
        value: Buffer.from('invalid-val').toString('base64'),
        meta: {
          keyId: 'key-id',
          algorithm: 'aes-256-gcm',
          iv: 'iv',
          authTag: 'tag',
        },
      }),
    });

    // Mock encryption.decrypt to throw error
    const spyDecrypt = vi
      .spyOn(encryption, 'decrypt')
      .mockRejectedValueOnce(new Error('decrypt error'));

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({
      password: 'mypassword',
      cloudFileId: 'file-id',
    });
    expect(result).toEqual({ error: { reason: 'decrypt-failure' } });
    expect(encryption.hasKey('key-id')).toBe(false);
    spyDecrypt.mockRestore();
  });

  test('key-test should succeed and save keys', async () => {
    const { post } = await import('#server/post');
    const mockKeyId = 'key-id';
    const mockSalt = 'salt';
    const mockPassword = 'mypassword';

    // We need to construct a valid decryption payload for keyTest
    const key = await encryption.createKey({
      id: mockKeyId,
      password: mockPassword,
      salt: mockSalt,
    });
    await encryption.loadKey(key);
    const encrypted = await encryption.encrypt('test-message', mockKeyId);

    vi.mocked(post).mockResolvedValueOnce({
      id: mockKeyId,
      salt: mockSalt,
      test: JSON.stringify({
        value: encrypted.value.toString('base64'),
        meta: encrypted.meta,
      }),
    });

    // Unload the key before running test so keyTest can create and load it itself
    encryption.unloadKey(key);

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({
      password: mockPassword,
      cloudFileId: 'file-id',
    });
    expect(result).toEqual({});

    // Verify key was loaded
    expect(encryption.hasKey(mockKeyId)).toBe(true);

    // Verify key was saved to asyncStorage
    const keysJson = await asyncStorage.getItem('encrypt-keys');
    expect(keysJson).toBeDefined();
    const keys = JSON.parse(keysJson);
    expect(keys['file-id']).toEqual(key.serialize());

    // Verify prefs were updated with encryptKeyId
    expect(prefs.getPrefs().encryptKeyId).toBe(mockKeyId);
  });

  test('key-test should fallback to prefs cloudFileId if not provided', async () => {
    const { post } = await import('#server/post');
    const mockKeyId = 'key-id';
    const mockSalt = 'salt';
    const mockPassword = 'mypassword';

    const key = await encryption.createKey({
      id: mockKeyId,
      password: mockPassword,
      salt: mockSalt,
    });
    await encryption.loadKey(key);
    const encrypted = await encryption.encrypt('test-message', mockKeyId);

    vi.mocked(post).mockResolvedValueOnce({
      id: mockKeyId,
      salt: mockSalt,
      test: JSON.stringify({
        value: encrypted.value.toString('base64'),
        meta: encrypted.meta,
      }),
    });

    encryption.unloadKey(key);

    // Set cloudFileId in prefs
    await prefs.savePrefs({ cloudFileId: 'prefs-file-id' });

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({ password: mockPassword });
    expect(result).toEqual({});
    expect(vi.mocked(post)).toHaveBeenCalledWith(
      expect.stringContaining('/user-get-key'),
      expect.objectContaining({ fileId: 'prefs-file-id' }),
    );
  });

  test('key-test should throw error when no server is configured', async () => {
    const { getServer } = await import('#server/server-config');
    vi.mocked(getServer).mockReturnValueOnce(null);

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({
      password: 'mypassword',
      cloudFileId: 'file-id',
    });
    expect(result).toEqual({ error: { reason: 'network' } });
  });

  test('key-test should succeed without saving to prefs when prefs are not loaded', async () => {
    const { post } = await import('#server/post');
    const mockKeyId = 'key-id';
    const mockSalt = 'salt';
    const mockPassword = 'mypassword';

    const key = await encryption.createKey({
      id: mockKeyId,
      password: mockPassword,
      salt: mockSalt,
    });
    await encryption.loadKey(key);
    const encrypted = await encryption.encrypt('test-message', mockKeyId);

    vi.mocked(post).mockResolvedValueOnce({
      id: mockKeyId,
      salt: mockSalt,
      test: JSON.stringify({
        value: encrypted.value.toString('base64'),
        meta: encrypted.meta,
      }),
    });

    encryption.unloadKey(key);
    prefs.unloadPrefs(); // Unload prefs

    const keyTestHandler = app.handlers['key-test'];
    const result = await keyTestHandler({
      password: mockPassword,
      cloudFileId: 'file-id',
    });
    expect(result).toEqual({});
    expect(prefs.getPrefs()).toBeNull();
  });
});
