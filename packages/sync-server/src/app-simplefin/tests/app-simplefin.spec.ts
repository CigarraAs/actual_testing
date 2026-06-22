import { EventEmitter } from 'events';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handlers as app } from '#app-simplefin/app-simplefin';

import {
  mockSimpleFinAccessKey,
  mockSimpleFinAccountsBalancesOnly,
  mockSimpleFinAccountsResponse,
  mockSimpleFinToken,
  mockSimpleFinTransaction,
} from './fixtures';

vi.mock('#services/secrets-service', () => ({
  SecretName: {
    simplefin_token: 'simplefin_token',
    simplefin_accessKey: 'simplefin_accessKey',
    simplefin_accessToken: 'simplefin_accessToken',
  },
  secretsService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('#util/middlewares', () => ({
  requestLoggerMiddleware: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
  validateSessionMiddleware: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

vi.mock('#app-gocardless/util/handle-error', () => ({
  handleError: (fn: (req: unknown, res: unknown) => Promise<void>) => fn,
}));

const { mockHttpsRequest } = vi.hoisted(() => ({
  mockHttpsRequest: vi.fn(),
}));

vi.mock('https', () => ({
  default: { request: mockHttpsRequest },
}));

// Stub global fetch for getAccounts()
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

function mockFetchResponse(
  data: unknown,
  ok = true,
  status = 200,
) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

import { SecretName, secretsService } from '#services/secrets-service';

describe('app-simplefin', () => {
  function setSecrets(token: string | null, accessKey: string | null) {
    vi.mocked(secretsService.get).mockImplementation((name: string) => {
      if (name === SecretName.simplefin_token) return token;
      if (name === SecretName.simplefin_accessKey) return accessKey;
      return null;
    });
  }

  beforeEach(() => {
    setSecrets(mockSimpleFinToken, mockSimpleFinAccessKey);
    vi.mocked(secretsService.set).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /status', () => {
    it('returns configured=true when token is set', async () => {
      const res = await request(app).post('/status');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        data: { configured: true },
      });
    });

    it('returns configured=false when token is null', async () => {
      setSecrets(null, null);

      const res = await request(app).post('/status');

      expect(res.body.data.configured).toBe(false);
    });

    it('returns configured=false when token is "Forbidden"', async () => {
      setSecrets('Forbidden', null);

      const res = await request(app).post('/status');

      expect(res.body.data.configured).toBe(false);
    });
  });

  describe('POST /accounts', () => {
    it('returns accounts when access key is configured', async () => {
      mockFetchResponse(mockSimpleFinAccountsBalancesOnly);

      const res = await request(app).post('/accounts');

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.accounts).toEqual(
        mockSimpleFinAccountsBalancesOnly.accounts,
      );
    });

    it('fetches access key from token when accessKey is not set', async () => {
      setSecrets(mockSimpleFinToken, null);
      mockHttpsRequest.mockImplementation((_url: unknown, _opts: unknown, cb: (res: EventEmitter) => void) => {
        const res = new EventEmitter();
        res.statusCode = 200;
        process.nextTick(() => cb(res));
        process.nextTick(() => res.emit('data', mockSimpleFinAccessKey));
        process.nextTick(() => res.emit('end'));
        return { on: vi.fn(), end: vi.fn() };
      });
      mockFetchResponse(mockSimpleFinAccountsBalancesOnly);

      const res = await request(app).post('/accounts');

      expect(res.body.status).toBe('ok');
      expect(secretsService.set).toHaveBeenCalledWith(
        SecretName.simplefin_accessKey,
        mockSimpleFinAccessKey,
      );
    });

    it('returns invalid token when no token is available', async () => {
      setSecrets(null, null);

      const res = await request(app).post('/accounts');

      expect(res.body.status).toBe('ok');
      expect(res.body.data.error_type).toBe('INVALID_ACCESS_TOKEN');
    });

    it('returns invalid token when token is "Forbidden"', async () => {
      setSecrets('Forbidden', 'Forbidden');

      const res = await request(app).post('/accounts');

      expect(res.body.data.error_type).toBe('INVALID_ACCESS_TOKEN');
    });

    it('returns server down error on API fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const res = await request(app).post('/accounts');

      expect(res.body.data.error_type).toBe('SERVER_DOWN');
    });
  });

  describe('POST /transactions', () => {
    const accountId = 'acc-001';
    const startDate = '2024-01-01';

    it('returns transactions for a single account', async () => {
      mockFetchResponse(mockSimpleFinAccountsResponse);

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.transactions).toBeDefined();
      expect(res.body.data.transactions.booked).toBeInstanceOf(Array);
    });

    it('returns invalid token when accessKey is null', async () => {
      setSecrets(mockSimpleFinToken, null);

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.body.data.error_type).toBe('INVALID_ACCESS_TOKEN');
    });

    it('returns invalid token when accessKey is "Forbidden"', async () => {
      setSecrets(mockSimpleFinToken, 'Forbidden');

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.body.data.error_type).toBe('INVALID_ACCESS_TOKEN');
    });

    it('handles multiple account IDs with matching start dates', async () => {
      mockFetchResponse({
        ...mockSimpleFinAccountsResponse,
        accounts: [
          {
            ...mockSimpleFinAccountsResponse.accounts[0],
            transactions: [mockSimpleFinTransaction],
          },
          mockSimpleFinAccountsResponse.accounts[1],
        ],
      });

      const res = await request(app)
        .post('/transactions')
        .send({
          accountId: ['acc-001', 'acc-002'],
          startDate: ['2024-01-01', '2024-01-01'],
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('throws when accountId and startDate arrays have mismatched lengths', async () => {
      const res = await request(app)
        .post('/transactions')
        .send({
          accountId: ['acc-001', 'acc-002'],
          startDate: ['2024-01-01'],
        });

      expect(res.statusCode).toBe(500);
    });

    it('returns invalid token on Forbidden fetch error', async () => {
      const fetchError = new Error('Forbidden');
      mockFetch.mockRejectedValueOnce(fetchError);

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.body.data.error_type).toBe('INVALID_ACCESS_TOKEN');
    });

    it('returns server down on other fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.body.data.error_type).toBe('SERVER_DOWN');
    });

    it('returns account error when account is not found in response', async () => {
      mockFetchResponse({
        ...mockSimpleFinAccountsResponse,
        accounts: [],
      });

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.body.status).toBe('ok');
      expect(res.body.data.error_type).toBe('ACCOUNT_MISSING');
    });

    it('includes errors when results.hasError is true', async () => {
      mockFetchResponse({
        accounts: [mockSimpleFinAccountsResponse.accounts[0]],
        errors: [],
        sferrors: ['Connection to Test Bank may need attention'],
      });

      const res = await request(app)
        .post('/transactions')
        .send({ accountId, startDate });

      expect(res.statusCode).toBe(200);
    });
  });
});
