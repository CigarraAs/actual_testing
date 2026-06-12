// @ts-strict-ignore
import { describe, expect, it, vi } from 'vitest';

vi.mock('i18next', () => ({
  t: (key: string) => key,
}));

import {
  LazyLoadFailedError,
  getBankSyncError,
  getDownloadError,
  getOpenIdErrors,
  getSecretsError,
  getSyncError,
  getTestKeyError,
  getUploadError,
  getUserAccessErrors,
} from './errors';

describe('errors', () => {
  describe('getUploadError', () => {
    it('returns unauthorized message', () => {
      const result = getUploadError({ reason: 'unauthorized' });
      expect(result).toBe('You are not logged in.');
    });

    it('returns encrypt-failure message when key is missing', () => {
      const result = getUploadError({
        reason: 'encrypt-failure',
        meta: { isMissingKey: true },
      });
      expect(result).toContain('missing your encryption key');
    });

    it('returns encrypt-failure message when key exists', () => {
      const result = getUploadError({
        reason: 'encrypt-failure',
        meta: { isMissingKey: false },
      });
      expect(result).toContain('generate a new key');
    });

    it('returns file-has-reset message', () => {
      const result = getUploadError({ reason: 'file-has-reset' });
      expect(result).toContain('resetting your file');
    });

    it('returns file-has-new-key message', () => {
      const result = getUploadError({ reason: 'file-has-new-key' });
      expect(result).toContain('missing the key');
    });

    it('returns network message', () => {
      const result = getUploadError({ reason: 'network' });
      expect(result).toContain('network connection');
    });

    it('returns default message for unknown reason', () => {
      const result = getUploadError({ reason: 'some-unknown-error' });
      expect(result).toContain('internal error occurred');
    });
  });

  describe('getDownloadError', () => {
    it('returns network message', () => {
      const result = getDownloadError({ reason: 'network' });
      expect(result).toContain('network connection');
    });

    it('returns download-failure message', () => {
      const result = getDownloadError({ reason: 'download-failure' });
      expect(result).toContain('network connection');
    });

    it('returns not-zip-file message', () => {
      const result = getDownloadError({ reason: 'not-zip-file' });
      expect(result).toContain('Downloaded file is invalid');
    });

    it('returns invalid-zip-file message', () => {
      const result = getDownloadError({ reason: 'invalid-zip-file' });
      expect(result).toContain('Downloaded file is invalid');
    });

    it('returns invalid-meta-file message', () => {
      const result = getDownloadError({ reason: 'invalid-meta-file' });
      expect(result).toContain('Downloaded file is invalid');
    });

    it('returns decrypt-failure message with fileName', () => {
      const result = getDownloadError({
        reason: 'decrypt-failure',
        fileName: 'mybudget.actual',
      });
      expect(result).toContain('mybudget.actual');
    });

    it('returns decrypt-failure message without fileName', () => {
      const result = getDownloadError({ reason: 'decrypt-failure' });
      expect(result).toContain('(unknown)');
    });

    it('returns out-of-sync-migrations message', () => {
      const result = getDownloadError({ reason: 'out-of-sync-migrations' });
      expect(result).toContain('cannot be loaded');
    });

    it('returns clock-drift message', () => {
      const result = getDownloadError({ reason: 'clock-drift' });
      expect(result).toContain('device time');
    });

    it('returns default message for unknown reason with fileId meta', () => {
      const result = getDownloadError({
        reason: 'unknown',
        meta: { fileId: 'abc123' },
      });
      expect(result).toContain('Something went wrong');
    });

    it('returns default message for unknown reason without meta', () => {
      const result = getDownloadError({ reason: 'unknown-error' });
      expect(result).toContain('Something went wrong');
    });
  });

  describe('getTestKeyError', () => {
    it('returns network message', () => {
      const result = getTestKeyError({ reason: 'network' });
      expect(result).toContain('connect to the server');
    });

    it('returns old-key-style message', () => {
      const result = getTestKeyError({ reason: 'old-key-style' });
      expect(result).toContain('old unsupported key');
    });

    it('returns decrypt-failure message', () => {
      const result = getTestKeyError({ reason: 'decrypt-failure' });
      expect(result).toContain('decrypt file with this password');
    });

    it('returns default message for unknown reason', () => {
      const result = getTestKeyError({ reason: 'some-unknown' });
      expect(result).toContain('Something went wrong');
    });
  });

  describe('getSyncError', () => {
    it('returns out-of-sync message for out-of-sync-migrations', () => {
      const result = getSyncError('out-of-sync-migrations', 'my-budget-id');
      expect(result).toContain('cannot be loaded');
    });

    it('returns out-of-sync message for out-of-sync-data', () => {
      const result = getSyncError('out-of-sync-data', 'my-budget-id');
      expect(result).toContain('cannot be loaded');
    });

    it('returns budget-not-found message with id', () => {
      const result = getSyncError('budget-not-found', 'my-test-budget');
      expect(result).toContain('not found');
    });

    it('returns clock-drift message', () => {
      const result = getSyncError('clock-drift', 'my-budget-id');
      expect(result).toContain('device time');
    });

    it('returns unknown problem message for unknown error', () => {
      const result = getSyncError('some-unknown-error', 'my-budget-id');
      expect(result).toContain('unknown problem');
    });
  });

  describe('getBankSyncError', () => {
    it('returns error message when message exists', () => {
      const result = getBankSyncError({ message: 'Custom error occurred' });
      expect(result).toBe('Custom error occurred');
    });

    it('returns default message when no message property', () => {
      const result = getBankSyncError({});
      expect(result).toContain('unknown problem syncing');
    });
  });

  describe('getUserAccessErrors', () => {
    it('returns unauthorized message', () => {
      const result = getUserAccessErrors('unauthorized');
      expect(result).toBe('You are not logged in.');
    });

    it('returns token-expired message', () => {
      const result = getUserAccessErrors('token-expired');
      expect(result).toContain('expired');
    });

    it('returns user-cant-be-empty message', () => {
      const result = getUserAccessErrors('user-cant-be-empty');
      expect(result).toContain('select a user');
    });

    it('returns invalid-file-id message', () => {
      const result = getUserAccessErrors('invalid-file-id');
      expect(result).toContain('invalid');
    });

    it('returns file-denied message', () => {
      const result = getUserAccessErrors('file-denied');
      expect(result).toContain('permissions');
    });

    it('returns user-already-have-access message', () => {
      const result = getUserAccessErrors('user-already-have-access');
      expect(result).toContain('already has access');
    });

    it('returns default message for unknown reason', () => {
      const result = getUserAccessErrors('some-unknown');
      expect(result).toContain('internal error');
    });
  });

  describe('getSecretsError', () => {
    it('returns unauthorized message', () => {
      const result = getSecretsError('some error', 'unauthorized');
      expect(result).toBe('You are not logged in.');
    });

    it('returns not-admin message', () => {
      const result = getSecretsError('some error', 'not-admin');
      expect(result).toContain('admin');
    });

    it('returns the passed error for default case', () => {
      const result = getSecretsError('Custom error text', 'some-unknown');
      expect(result).toBe('Custom error text');
    });
  });

  describe('getOpenIdErrors', () => {
    it('returns unauthorized message', () => {
      const result = getOpenIdErrors('unauthorized');
      expect(result).toBe('You are not logged in.');
    });

    it('returns configuration-error message', () => {
      const result = getOpenIdErrors('configuration-error');
      expect(result).toContain('configuration is not valid');
    });

    it('returns unable-to-change-file-config-enabled message', () => {
      const result = getOpenIdErrors('unable-to-change-file-config-enabled');
      expect(result).toContain('Unable to enable OpenID');
    });

    it('returns default message for unknown reason', () => {
      const result = getOpenIdErrors('some-unknown');
      expect(result).toContain('internal error');
    });
  });

  describe('LazyLoadFailedError', () => {
    it('creates error with correct type', () => {
      const error = new LazyLoadFailedError('myModule', new Error('cause'));
      expect(error.type).toBe('app-init-failure');
    });

    it('creates error with correct meta', () => {
      const error = new LazyLoadFailedError('myModule', new Error('cause'));
      expect(error.meta).toEqual({ name: 'myModule' });
    });

    it('creates error with correct message', () => {
      const error = new LazyLoadFailedError('myModule', new Error('cause'));
      expect(error.message).toContain('myModule');
    });

    it('is instanceof Error', () => {
      const error = new LazyLoadFailedError('myModule', new Error('cause'));
      expect(error).toBeInstanceOf(Error);
    });

    it('stores cause', () => {
      const cause = new Error('original cause');
      const error = new LazyLoadFailedError('myModule', cause);
      expect(error.cause).toBe(cause);
    });
  });
});
