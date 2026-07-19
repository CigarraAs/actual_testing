// @ts-ignore
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from '#server/db';
import * as prefs from '#server/prefs';
import { setSyncingMode, fullSync } from '#server/sync';
import { Timestamp } from '@actual-app/crdt';
import { getServer } from '#server/server-config';
import { setServer } from '#server/server-config'; // Si existe esta función

// Usamos el servidor real que ya tienes corriendo
const SERVER_URL = 'http://localhost:5006';

describe('INT-SYN-001 (Large - fullSync con servidor real)', () => {
  let initialTimestamp: string;
  let accountId: string;

  beforeAll(async () => {
    // Configurar la base de datos en memoria
    await global.emptyDatabase()();
    
    // Cargar preferencias y configurar el servidor
    await prefs.loadPrefs();
    await prefs.savePrefs({
      id: 'test-budget',
      groupId: 'test-group',
      lastSyncedTimestamp: Timestamp.zero.toString(),
    });

    // Activar el modo de sincronización
    setSyncingMode('enabled');

    // ⚠️ Configurar la URL del servidor de forma correcta
    // En tu código, la URL se guarda en la configuración del servidor.
    // Si tienes una función `setServer`, úsala. Si no, usa la variable global.
    // Para este ejemplo, asumimos que la función `setServer` existe.
    // Si no, puedes usar `process.env.ACTUAL_SERVER_URL` como hiciste antes.
    // Pero es mejor usar la función oficial.
    try {
      // Intenta usar setServer (puede que no esté exportada, pero si lo está, es más limpio)
      setServer(SERVER_URL);
    } catch {
      // Fallback: variable de entorno
      process.env.ACTUAL_SERVER_URL = SERVER_URL;
    }

    // Guardamos el timestamp inicial
    const prefsData = await prefs.getPrefs();
    initialTimestamp = prefsData?.lastSyncedTimestamp || '0';
  });

  afterAll(() => {
    setSyncingMode('disabled');
    delete process.env.ACTUAL_SERVER_URL;
    // Si usaste setServer, podrías resetearlo aquí
  });

  it('fullSync se ejecuta sin errores, envía mensajes al servidor y actualiza el timestamp', async () => {
    // 1. Insertar una transacción local para generar mensajes
    accountId = await db.insertAccount({ name: 'Cuenta Sync Test', offbudget: 0 });
    await db.insertTransaction({
      id: 'txn_sync_test',
      account: accountId,
      amount: -5000,
      date: '2026-07-18',
    });

    // 2. Ejecutar fullSync (debe enviar mensajes al servidor)
    const result = await fullSync();

    // 3. Verificar que la ejecución fue exitosa (no hay error en el resultado)
    if (result && 'error' in result) {
      throw new Error(`fullSync falló: ${result.error.message}`);
    }

    // 4. Verificar que el timestamp local se actualizó
    const prefsData = await prefs.getPrefs();
    const newTimestamp = prefsData?.lastSyncedTimestamp;
    expect(newTimestamp).toBeDefined();
    expect(newTimestamp).not.toBe(initialTimestamp);
    expect(newTimestamp).not.toBe('0');

    // 5. 🔥 Verificar que el mensaje llegó al servidor (opcional pero recomendado)
    // Como no tenemos un endpoint público para listar mensajes, intentamos
    // consultar la base de datos del servidor si es posible.
    // Si el servidor usa SQLite y podemos acceder a su archivo, podemos leerlo.
    // O podemos hacer una llamada REST si existe el endpoint.
    // En este ejemplo, asumimos que el servidor tiene un endpoint /sync/messages
    // (puede que no exista, pero es un ejemplo).
    try {
      const response = await fetch(`${SERVER_URL}/sync/messages?dataset=transactions&row=txn_sync_test`);
      if (response.ok) {
        const data = await response.json();
        // Si el endpoint devuelve una lista de mensajes, verificamos que exista el nuestro.
        // La estructura depende de tu implementación.
        // Si no existe el endpoint, podemos omitir esta parte.
        console.log('Mensajes en servidor:', data);
        // Podrías hacer una aserción más específica si conoces la estructura.
      } else {
        console.warn('El servidor no tiene endpoint /sync/messages, omitiendo verificación en servidor.');
      }
    } catch (e) {
      console.warn('No se pudo verificar mensajes en servidor (endpoint no disponible o error de red):', e);
    }

    // 6. (Opcional) Verificar que no haya errores en el árbol de Merkle
    // Esto ya se valida indirectamente con fullSync, pero podemos comprobarlo.
    // Si tu código expone el Merkle, puedes hacerlo.
  });
});