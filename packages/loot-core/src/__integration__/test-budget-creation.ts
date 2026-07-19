// @ts-ignore
import * as API from '@actual-app/api';
// @ts-ignore
import { createTestServer, stopServer } from '@actual-app/sync-server/test-utils';
import path from 'path';
import fs from 'fs';

async function test() {
  const SERVER_URL = await createTestServer();
  console.log(`Servidor de prueba iniciado en: ${SERVER_URL}`);

  const dirA = path.resolve(__dirname, '.data-client-a-test');
  if (fs.existsSync(dirA)) fs.rmSync(dirA, { recursive: true, force: true });
  
  await API.init({ dataDir: dirA, serverURL: SERVER_URL, password: 'any-password' });
  await API.internal.send('create-budget', { budgetName: 'Test Sync Budget' });
  const budgets = await API.getBudgets();
  console.log('Budgets:', budgets);
  await API.shutdown();
  stopServer();
}

test().catch(console.error);
