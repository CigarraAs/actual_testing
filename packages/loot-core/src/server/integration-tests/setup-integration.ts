import { createServer, type Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '__fixtures__',
  'test-db.sqlite',
);

export function getFixturePath(): string {
  return FIXTURE_PATH;
}

export function copyFixtureToTemp(): string {
  const tempDir = path.resolve(__dirname, '..', '..', '__fixtures__');
  const tempPath = path.join(tempDir, `test-db-${Date.now()}.sqlite`);
  fs.copyFileSync(FIXTURE_PATH, tempPath);
  return tempPath;
}

export interface TestServer {
  server: Server;
  port: number;
  url: string;
}

export function createTestApp(): ReturnType<typeof createServer> {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          build: {
            name: '@actual-app/sync-server',
            description: 'actual syncing server',
            version: '26.5.2',
          },
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/mode') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('test');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not-found' }));
  });
}

export function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const app = createTestApp();

    app.listen(0, () => {
      const address = app.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        const elapsed = Date.now() - startTime;
        console.log(`[test-server] started on port ${port} (${elapsed}ms)`);
        resolve({
          server: app,
          port,
          url: `http://localhost:${port}`,
        });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    app.on('error', reject);
  });
}

export function stopTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
