// mock-indexeddb.ts
import { indexedDB, IDBRequest, IDBOpenDBRequest } from 'fake-indexeddb';
import path from 'path';

(global as any).indexedDB = indexedDB;
(global as any).IDBRequest = IDBRequest;
(global as any).IDBOpenDBRequest = IDBOpenDBRequest;
(global as any).window = global;
(global as any).globalThis = global;

process.env.PUBLIC_URL = path.resolve(__dirname, '../../../node_modules/@jlongster/sql.js/dist/');

console.log('[Mock] indexedDB mockeado y PUBLIC_URL configurada');