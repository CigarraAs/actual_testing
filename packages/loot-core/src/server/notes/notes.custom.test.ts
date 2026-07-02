import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';

import { app } from './app';

describe('Notes - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  async function setupDatabase() {
    const account = await db.insertAccount({
      name: 'Cuenta Principal',
      type: 'checking',
      offbudget: 0,
    });

    await db.insertCategoryGroup({
      id: 'expenses',
      name: 'Gastos',
      is_income: 0,
    });

    await db.insertCategory({
      id: 'food-cat',
      name: 'Comida',
      cat_group: 'expenses',
      is_income: 0,
    });

    return account;
  }

  // ============================================================================
  // NOTE-001: Registrar nota en transacción
  // ============================================================================
  it('NOTE-001: Registrar nota en transacción', async () => {
    const account = await setupDatabase();

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: 'Compra de frutas y verduras en el mercado',
    });
    const transaction = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(transaction[0].notes).toBe('Compra de frutas y verduras en el mercado');
  });

  // ============================================================================
  // NOTE-002: Nota vacía permitida
  // ============================================================================
  it('NOTE-002: Transacción sin nota permitida', async () => {
    const account = await setupDatabase();

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -3000,
      notes: null,
    });

    const transaction = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(transaction[0].notes).toBeNull();
  });

  // ============================================================================
  // NOTE-003: Nota largo permitido
  // ============================================================================
  it('NOTE-003: Notas largas soportadas', async () => {
    const account = await setupDatabase();

    const longNote =
      'Esta es una nota muy larga que contiene muchos detalles sobre la transacción, incluyendo información adicional sobre el lugar, la hora, las cantidades específicas y cualquier otra información relevante que el usuario desee registrar para referencia futura.';

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: longNote,
    });

    const transaction = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(transaction[0].notes).toBe(longNote);
  });

  // ============================================================================
  // NOTE-004: Notas con caracteres especiales
  // ============================================================================
  it('NOTE-004: Caracteres especiales en notas', async () => {
    const account = await setupDatabase();

    const specialNote =
      'Compra €50, con descuento 20% (¡especial!). Detalles: @tienda, #oferta, "calidad"';

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: specialNote,
    });

    const transaction = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(transaction[0].notes).toBe(specialNote);
  });

  // ============================================================================
  // NOTE-005: Notas con saltos de línea
  // ============================================================================
  it('NOTE-005: Notas con múltiples líneas', async () => {
    const account = await setupDatabase();

    const multilineNote =
      'Compra en mercado\nProductos: frutas, verduras\nHorario: 10:00 AM\nTotal: $50';

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: multilineNote,
    });

    const transaction = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(transaction[0].notes).toContain('\n');
  });

  // ============================================================================
  // NOTE-006: Buscar transacciones por nota
  // ============================================================================
  it('NOTE-006: Buscar transacciones por texto de nota', async () => {
    const account = await setupDatabase();

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: 'Compra en Mercado San Pedro',
    });

    await db.insertTransaction({
      account,
      date: '2026-06-20',
      category: 'food-cat',
      amount: -3000,
      notes: 'Compra en tienda local',
    });

    const results = await db.all(
      "SELECT * FROM transactions WHERE notes LIKE ? AND acct = ?",
      ['%Mercado%', account],
    ) as any[];

    expect(results.length).toBe(1);
    expect(results[0].notes).toContain('Mercado San Pedro');
  });

  // ============================================================================
  // NOTE-007: Actualizar nota existente
  // ============================================================================
  it('NOTE-007: Modificar nota de transacción', async () => {
    const account = await setupDatabase();

    const txId = await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: 'Nota original',
    });

    await db.runQuery('UPDATE transactions SET notes = ? WHERE id = ?', [
      'Nota actualizada',
      txId,
    ]);

    const updated = await db.all(
      'SELECT notes FROM transactions WHERE id = ?',
      [txId],
    ) as any[];

    expect(updated[0].notes).toBe('Nota actualizada');
  });

  // ============================================================================
  // NOTE-008: Notas con etiquetas
  // ============================================================================
  it('NOTE-008: Notas con etiquetas/categorías', async () => {
    const account = await setupDatabase();

    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -5000,
      notes: '#urgente #importante Compra essential',
    });

    const transaction = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(transaction[0].notes).toContain('#urgente');
    expect(transaction[0].notes).toContain('#importante');
  });

  // ============================================================================
  // NOTE-009: Historial de múltiples notas
  // ============================================================================
  it('NOTE-009: Registrar múltiples notas en diferentes transacciones', async () => {
    const account = await setupDatabase();

    const notes = ['Primera compra', 'Segunda compra', 'Tercera compra', 'Cuarta compra'];

    for (const note of notes) {
      await db.insertTransaction({
        account,
        date: '2026-06-15',
        category: 'food-cat',
        amount: -2000,
        notes: note,
      });
    }

    const allTransactions = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    expect(allTransactions.length).toBe(4);
    expect(allTransactions.map(t => t.notes)).toEqual(notes);
  });

  // ============================================================================
  // NOTE-010: Integridad de datos en notas variadas
  // ============================================================================
  it('NOTE-010: Integridad de datos en notas', async () => {
    const account = await setupDatabase();

    const testNotes = [
      'Nota simple',
      'Nota con números 12345',
      'Nota con símbolos !@#$%^&*()',
      'Nota con emojis 😀🎉',
      'Nota con acentos: ñáéíóú',
    ];

    for (const note of testNotes) {
      await db.insertTransaction({
        account,
        date: '2026-06-15',
        category: 'food-cat',
        amount: -2000,
        notes: note,
      });
    }

    const allTransactions = await db.all(
      'SELECT notes FROM transactions WHERE acct = ?',
      [account],
    ) as any[];

    for (let i = 0; i < testNotes.length; i++) {
      expect(allTransactions[i].notes).toBe(testNotes[i]);
    }
  });

  // ============================================================================
  // NOTE-011: Guardar nota en tabla notes (módulo notes real)
  // ============================================================================
  it('NOTE-011: Guardar nota usando la tabla notes', async () => {
    await setupDatabase();

    await db.runQuery('INSERT INTO notes (id, note) VALUES (?, ?)', [
      'note-001',
      'Nota de prueba en módulo notes',
    ]);

    const note = await db.first<{ id: string; note: string }>(
      'SELECT id, note FROM notes WHERE id = ?',
      ['note-001'],
    );

    expect(note).toBeDefined();
    expect(note.id).toBe('note-001');
    expect(note.note).toBe('Nota de prueba en módulo notes');
  });

  // ============================================================================
  // NOTE-012: Actualizar nota en tabla notes
  // ============================================================================
  it('NOTE-012: Actualizar nota existente en tabla notes', async () => {
    await setupDatabase();

    await db.runQuery('INSERT INTO notes (id, note) VALUES (?, ?)', [
      'note-002',
      'Contenido original',
    ]);
    await db.runQuery('UPDATE notes SET note = ? WHERE id = ?', [
      'Contenido modificado',
      'note-002',
    ]);

    const updated = await db.first<{ id: string; note: string }>(
      'SELECT id, note FROM notes WHERE id = ?',
      ['note-002'],
    );

    expect(updated.note).toBe('Contenido modificado');
  });

  // ============================================================================
  // NOTE-013: Consultar nota inexistente retorna null
  // ============================================================================
  it('NOTE-013: Consultar nota inexistente retorna null', async () => {
    await setupDatabase();

    const note = await db.first<{ id: string; note: string }>(
      'SELECT id, note FROM notes WHERE id = ?',
      ['nonexistent-id'],
    );

    expect(note).toBeNull();
  });

  // ============================================================================
  // NOTE-014: Transacción con nota extensa y búsqueda por substring
  // ============================================================================
  it('NOTE-014: Búsqueda parcial en notas de transacción', async () => {
    const account = await setupDatabase();

    await db.insertTransaction({
      account,
      date: '2026-06-01',
      category: 'food-cat',
      amount: -1000,
      notes: 'Factura #A12345 - Pago realizado',
    });
    await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -2000,
      notes: 'Factura #B67890 - Pendiente',
    });

    const facturaA = await db.all(
      "SELECT notes FROM transactions WHERE notes LIKE ? AND acct = ?",
      ['%#A12345%', account],
    ) as any[];

    expect(facturaA.length).toBe(1);
    expect(facturaA[0].notes).toContain('#A12345');
  });

  // ============================================================================
  // NOTE-016: notes-save handler guarda nota
  // ============================================================================
  it('NOTE-016: notes-save handler guarda nota en tabla notes', async () => {
    await setupDatabase();

    await app.handlers['notes-save']({ id: 'note-016', note: 'Nota desde handler' });

    const note = await db.first(
      'SELECT id, note FROM notes WHERE id = ?',
      ['note-016'],
    ) as any;
    expect(note.note).toBe('Nota desde handler');
  });

  // ============================================================================
  // NOTE-017: notes-get handler recupera nota
  // ============================================================================
  it('NOTE-017: notes-get handler recupera nota existente', async () => {
    await setupDatabase();

    await db.runQuery('INSERT INTO notes (id, note) VALUES (?, ?)', [
      'note-017',
      'Contenido para get',
    ]);

    const result = await app.handlers['notes-get']({ id: 'note-017' });
    expect(result).toBeDefined();
    expect(result!.note).toBe('Contenido para get');
  });

  // ============================================================================
  // NOTE-018: notes-get para nota inexistente retorna null
  // ============================================================================
  it('NOTE-018: notes-get handler retorna null para nota inexistente', async () => {
    await setupDatabase();

    const result = await app.handlers['notes-get']({ id: 'no-existe' });
    expect(result).toBeNull();
  });

  // ============================================================================
  // NOTE-019: notes-save sobrescribe nota existente
  // ============================================================================
  it('NOTE-019: notes-save handler actualiza nota existente', async () => {
    await setupDatabase();

    await app.handlers['notes-save']({ id: 'note-019', note: 'Primera versión' });
    await app.handlers['notes-save']({ id: 'note-019', note: 'Versión actualizada' });

    const note = await db.first(
      'SELECT id, note FROM notes WHERE id = ?',
      ['note-019'],
    ) as any;
    expect(note.note).toBe('Versión actualizada');
  });

  // ============================================================================
  // NOTE-020: notes-save-undoable handler también funciona
  // ============================================================================
  it('NOTE-020: notes-save-undoable handler guarda nota', async () => {
    await setupDatabase();

    await app.handlers['notes-save-undoable']({
      id: 'note-020',
      note: 'Nota undoable',
    });

    const note = await db.first(
      'SELECT id, note FROM notes WHERE id = ?',
      ['note-020'],
    ) as any;
    expect(note.note).toBe('Nota undoable');
  });

  // ============================================================================
  // FN06-CP-001: Crear una nota en una transacción
  // ============================================================================
  it('FN06-CP-001: Crear una nota en una transacción', async () => {
    // 1. Configuramos la base de datos insertando una cuenta y categoría
    const account = await setupDatabase();

    // 2. Insertamos una transacción con una nota inicial
    const txId = await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -1500,
      notes: 'Nota inicial de prueba',
    });

    // 3. Consultamos la base de datos para verificar que la nota se guardó correctamente
    const transaction = await db.first<any>(
      'SELECT notes FROM transactions WHERE id = ?',
      [txId],
    );
    expect(transaction.notes).toBe('Nota inicial de prueba');
  });

  // ============================================================================
  // FN06-CP-002: Editar una nota en una transacción existente
  // ============================================================================
  it('FN06-CP-002: Editar una nota en una transacción existente', async () => {
    const account = await setupDatabase();

    // 1. Creamos la transacción con nota
    const txId = await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -2500,
      notes: 'Nota antigua',
    });

    // 2. Actualizamos la nota de la transacción
    await db.runQuery('UPDATE transactions SET notes = ? WHERE id = ?', [
      'Nota editada y actualizada',
      txId,
    ]);

    // 3. Verificamos que los cambios persistan en la base de datos
    const transaction = await db.first<any>(
      'SELECT notes FROM transactions WHERE id = ?',
      [txId],
    );
    expect(transaction.notes).toBe('Nota editada y actualizada');
  });

  // ============================================================================
  // FN06-CP-003: Eliminar una nota de una transacción (usando cadena vacía)
  // ============================================================================
  it('FN06-CP-003: Eliminar una nota de una transacción (usando cadena vacía)', async () => {
    const account = await setupDatabase();

    // 1. Creamos la transacción con una nota
    const txId = await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -3500,
      notes: 'Nota a eliminar',
    });

    // 2. Actualizamos la nota usando una cadena vacía ("") para simular la eliminación por UI
    await db.runQuery('UPDATE transactions SET notes = ? WHERE id = ?', [
      '',
      txId,
    ]);

    // 3. Verificamos que la nota ahora esté vacía
    const transaction = await db.first<any>(
      'SELECT notes FROM transactions WHERE id = ?',
      [txId],
    );
    expect(transaction.notes).toBe('');
  });

  // ============================================================================
  // FN06-CP-004: Registrar nota extensa y validar su almacenamiento e integridad
  // ============================================================================
  it('FN06-CP-004: Registrar nota extensa con caracteres especiales y emojis', async () => {
    const account = await setupDatabase();

    // 1. Definimos una nota muy larga con caracteres especiales, saltos de línea y emojis
    const extensiveNote =
      'Línea 1: Compra especial para el evento 🎉\n' +
      'Línea 2: Detalles técnicos, caracteres raros: áéíóú ñ, €100.00, %desc, &ref!\n' +
      'Línea 3: Texto extra largo '.repeat(10);

    // 2. Insertamos la transacción con esta nota
    const txId = await db.insertTransaction({
      account,
      date: '2026-06-15',
      category: 'food-cat',
      amount: -4500,
      notes: extensiveNote,
    });

    // 3. Comprobamos la integridad de los datos recuperados de la base de datos
    const transaction = await db.first<any>(
      'SELECT notes FROM transactions WHERE id = ?',
      [txId],
    );
    expect(transaction.notes).toBe(extensiveNote);
  });
});
