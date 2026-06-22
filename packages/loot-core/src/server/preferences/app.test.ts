import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

import * as asyncStorage from '#platform/server/asyncStorage';
import { PostError } from '#server/errors';
import * as prefs from '#server/prefs';

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
      SIGNUP_SERVER: 'http://mock-signup-server',
    })),
  };
});

beforeEach(async () => {
  await global.emptyDatabase()();
  await prefs.loadPrefs();
});

afterEach(async () => {
  prefs.unloadPrefs();
  for (const key of Object.keys(mockStore)) {
    delete mockStore[key];
  }
});

describe('Preferences App Handlers', () => {
  test('preferences/save should save preference', async () => {
    const saveHandler = app.handlers['preferences/save'];
    await saveHandler({ id: 'theme', value: 'dark' });

    const getHandler = app.handlers['preferences/get'];
    const result = await getHandler();
    expect(result.theme).toBe('dark');
  });

  test('preferences/save should do nothing if id is missing', async () => {
    const saveHandler = app.handlers['preferences/save'];
    // @ts-expect-error
    await saveHandler({ id: null, value: 'dark' });

    const getHandler = app.handlers['preferences/get'];
    const result = await getHandler();
    expect(Object.keys(result).length).toBe(0);
  });

  test('save-global-prefs should do nothing if no prefs provided', async () => {
    const saveGlobalHandler = app.handlers['save-global-prefs'];
    // @ts-expect-error
    const result = await saveGlobalHandler(null);
    expect(result).toBe('ok');
  });

  test('save-global-prefs and load-global-prefs should work for all options', async () => {
    const saveGlobalHandler = app.handlers['save-global-prefs'];
    const loadGlobalHandler = app.handlers['load-global-prefs'];

    await saveGlobalHandler({
      maxMonths: 12,
      categoryExpandedState: 1,
      floatingSidebar: true,
      language: 'es',
      theme: 'midnight',
      preferredDarkTheme: 'midnight',
      installedCustomLightTheme: 'custom-light',
      installedCustomDarkTheme: 'custom-dark',
      customCssOverride: 'css-override',
      serverSelfSignedCert: 'cert',
      syncServerConfig: 'config',
      notifyWhenUpdateIsAvailable: 'false',
    });

    const result = await loadGlobalHandler();
    expect(result.maxMonths).toBe(12);
    expect(result.categoryExpandedState).toBe(1);
    expect(result.floatingSidebar).toBe(true);
    expect(result.language).toBe('es');
    expect(result.theme).toBe('midnight');
    expect(result.preferredDarkTheme).toBe('midnight');
    expect(result.installedCustomLightTheme).toBe('custom-light');
    expect(result.installedCustomDarkTheme).toBe('custom-dark');
    expect(result.customCssOverride).toBe('css-override');
    expect(result.serverSelfSignedCert).toBe('cert');
    expect(result.syncServerConfig).toBe('config');
    expect(result.notifyWhenUpdateIsAvailable).toBe('false');
  });

  test('load-global-prefs should return default values when empty', async () => {
    const loadGlobalHandler = app.handlers['load-global-prefs'];
    const result = await loadGlobalHandler();
    expect(result.floatingSidebar).toBe(false);
    expect(result.maxMonths).toBe(1);
    expect(result.theme).toBe('auto');
    expect(result.preferredDarkTheme).toBe('dark');
    expect(result.notifyWhenUpdateIsAvailable).toBe(true);
  });

  test('save-prefs and load-prefs (metadata prefs) should save and load', async () => {
    const savePrefsHandler = app.handlers['save-prefs'];
    const loadPrefsHandler = app.handlers['load-prefs'];

    // @ts-expect-error
    expect(await savePrefsHandler(null)).toBe('ok');

    await savePrefsHandler({ budgetName: 'New Budget Name' });
    const result = await loadPrefsHandler();
    expect(result.budgetName).toBe('New Budget Name');
  });

  test('save-prefs should sync budget name with server if cloudFileId exists', async () => {
    const { post } = await import('#server/post');
    const savePrefsHandler = app.handlers['save-prefs'];

    await asyncStorage.setItem('user-token', 'mock-token');
    await prefs.savePrefs({ cloudFileId: 'my-cloud-file-id' });

    await savePrefsHandler({ budgetName: 'Cloud Budget Name' });

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/update-user-filename'),
      expect.objectContaining({
        token: 'mock-token',
        fileId: 'my-cloud-file-id',
        name: 'Cloud Budget Name',
      }),
    );
  });

  test('save-prefs should throw when sync server is not set', async () => {
    const { getServer } = await import('#server/server-config');
    const savePrefsHandler = app.handlers['save-prefs'];

    vi.mocked(getServer).mockReturnValueOnce(null);
    await prefs.savePrefs({ cloudFileId: 'my-cloud-file-id' });

    await expect(
      savePrefsHandler({ budgetName: 'Cloud Budget Name' }),
    ).rejects.toThrow('No sync server set');
  });

  test('save-server-prefs should return error if not logged in', async () => {
    const saveServerPrefsHandler = app.handlers['save-server-prefs'];
    const result = await saveServerPrefsHandler({ prefs: { foo: 'bar' } });
    expect(result).toEqual({ error: 'not-logged-in' });
  });

  test('save-server-prefs should call post on success', async () => {
    const { post } = await import('#server/post');
    const saveServerPrefsHandler = app.handlers['save-server-prefs'];

    await asyncStorage.setItem('user-token', 'mock-token');
    const result = await saveServerPrefsHandler({ prefs: { foo: 'bar' } });
    expect(result).toEqual({});
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/server-prefs'),
      expect.objectContaining({
        token: 'mock-token',
        prefs: { foo: 'bar' },
      }),
    );
  });

  test('save-server-prefs should throw when server not configured', async () => {
    const { getServer } = await import('#server/server-config');
    const saveServerPrefsHandler = app.handlers['save-server-prefs'];

    vi.mocked(getServer).mockReturnValueOnce(null);
    await asyncStorage.setItem('user-token', 'mock-token');
    await expect(
      saveServerPrefsHandler({ prefs: { foo: 'bar' } }),
    ).rejects.toThrow('No sync server configured.');
  });

  test('save-server-prefs should handle PostError', async () => {
    const { post } = await import('#server/post');
    const saveServerPrefsHandler = app.handlers['save-server-prefs'];

    await asyncStorage.setItem('user-token', 'mock-token');
    vi.mocked(post).mockRejectedValueOnce(new PostError('invalid-token'));

    const result = await saveServerPrefsHandler({ prefs: { foo: 'bar' } });
    expect(result).toEqual({ error: 'invalid-token' });
  });

  test('save-server-prefs should handle PostError with missing reason', async () => {
    const { post } = await import('#server/post');
    const saveServerPrefsHandler = app.handlers['save-server-prefs'];

    await asyncStorage.setItem('user-token', 'mock-token');
    // @ts-expect-error
    vi.mocked(post).mockRejectedValueOnce(new PostError(null));

    const result = await saveServerPrefsHandler({ prefs: { foo: 'bar' } });
    expect(result).toEqual({ error: 'network-failure' });
  });

  test('save-server-prefs should bubble up generic errors', async () => {
    const { post } = await import('#server/post');
    const saveServerPrefsHandler = app.handlers['save-server-prefs'];

    await asyncStorage.setItem('user-token', 'mock-token');
    vi.mocked(post).mockRejectedValueOnce(new Error('generic database error'));

    await expect(
      saveServerPrefsHandler({ prefs: { foo: 'bar' } }),
    ).rejects.toThrow('generic database error');
  });
});
