// @ts-ignore
import { indexedDB, IDBRequest, IDBOpenDBRequest } from 'fake-indexeddb';

// Mock de indexedDB para que la API funcione en Node
(global as any).indexedDB = indexedDB;
(global as any).IDBRequest = IDBRequest;
(global as any).IDBOpenDBRequest = IDBOpenDBRequest;

if (typeof globalThis === 'undefined') {
  (global as any).globalThis = global;
}
(global as any).window = global;

console.log('[Setup] indexedDB mockeado correctamente');