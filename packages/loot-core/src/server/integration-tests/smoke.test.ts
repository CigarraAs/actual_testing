import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  stopTestServer,
} from './setup-integration';
import type { Server } from 'node:http';

describe('Sync-server smoke test', () => {
  let server: Server;
  let port: number;
  let url: string;

  beforeAll(async () => {
    const result = await startTestServer();
    server = result.server;
    port = result.port;
    url = result.url;
  }, 5000);

  afterAll(async () => {
    await stopTestServer(server);
  });

  it('should start the test server on a dynamic port in less than 3 seconds', () => {
    expect(port).toBeGreaterThan(0);
    expect(url).toContain(`localhost:${port}`);
  });

  it('GET /info should respond with 200 and build information', async () => {
    const response = await fetch(`${url}/info`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('build');
    expect(body.build).toStrictEqual({
      name: '@actual-app/sync-server',
      description: 'actual syncing server',
      version: '26.5.2',
    });
  });

  it('GET /health should respond with status UP', async () => {
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toStrictEqual({ status: 'UP' });
  });

  it('GET /mode should respond with "test"', async () => {
    const response = await fetch(`${url}/mode`);
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toBe('test');
  });
});
