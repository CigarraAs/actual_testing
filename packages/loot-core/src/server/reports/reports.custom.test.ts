import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

import * as db from '#server/db';

import { reportModel, app } from './app';
import type { CustomReportData, CustomReportEntity } from '#types/models';

describe('Reports - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  function createReportEntity(overrides: Partial<CustomReportEntity> = {}): CustomReportEntity {
    return {
      id: uuidv4(),
      name: 'Reporte de Prueba',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      isDateStatic: true,
      dateRange: '2026',
      mode: 'total',
      groupBy: 'Category',
      interval: 'Monthly',
      balanceType: 'netAssets',
      sortBy: 'desc',
      showEmpty: false,
      showOffBudget: false,
      showHiddenCategories: false,
      showUncategorized: false,
      trimIntervals: false,
      includeCurrentInterval: true,
      graphType: 'BarGraph',
      conditions: [],
      conditionsOp: 'and',
      ...overrides,
    };
  }

  // ============================================================================
  // REP-001: Validación de reporte con campos requeridos
  // ============================================================================
  it('REP-001: reportModel.validate acepta reporte válido', () => {
    const report = createReportEntity();
    const result = reportModel.validate(report);
    expect(result.name).toBe('Reporte de Prueba');
    expect(result.conditionsOp).toBe('and');
  });

  // ============================================================================
  // REP-002: Validación rechaza conditionsOp inválido
  // ============================================================================
  it('REP-002: reportModel.validate rechaza conditionsOp inválido', () => {
    const report = createReportEntity({ conditionsOp: 'invalid' as 'and' });
    expect(() => reportModel.validate(report)).toThrow(
      'Invalid filter conditionsOp: invalid',
    );
  });

  // ============================================================================
  // REP-003: Validación con and/or válidos
  // ============================================================================
  it('REP-003: reportModel.validate acepta conditionsOp or', () => {
    const report = createReportEntity({ conditionsOp: 'or' });
    const result = reportModel.validate(report);
    expect(result.conditionsOp).toBe('or');
  });

  // ============================================================================
  // REP-004: Conversión toJS de datos de BD a entidad
  // ============================================================================
  it('REP-004: reportModel.toJS convierte datos a entidad', () => {
    const reportData: CustomReportData = {
      id: 'r1',
      name: 'Mi Reporte',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      date_static: 1,
      date_range: '2026',
      mode: 'total',
      group_by: 'Category',
      sort_by: 'desc',
      balance_type: 'netAssets',
      show_empty: 1,
      show_offbudget: 0,
      show_hidden: 1,
      show_uncategorized: 0,
      trim_intervals: 1,
      include_current: 1,
      graph_type: 'BarGraph',
      conditions: [],
      conditions_op: 'and',
      interval: 'Monthly',
    };
    const entity = reportModel.toJS(reportData);
    expect(entity.name).toBe('Mi Reporte');
    expect(entity.showEmpty).toBe(true);
    expect(entity.showOffBudget).toBe(false);
    expect(entity.trimIntervals).toBe(true);
  });

  // ============================================================================
  // REP-005: fromJS convierte entidad a datos de BD
  // ============================================================================
  it('REP-005: reportModel.fromJS convierte entidad a datos', () => {
    const entity = createReportEntity({ name: 'Exportado', showEmpty: true, isDateStatic: false });
    const data = reportModel.fromJS(entity);
    expect(data.show_empty).toBe(1);
    expect(data.date_static).toBe(0);
    expect(data.sort_by).toBe('desc');
  });

  // ============================================================================
  // REP-006: Round-trip toJS -> fromJS -> toJS
  // ============================================================================
  it('REP-006: Round-trip toJS y fromJS mantiene integridad', () => {
    const originalData: CustomReportData = {
      id: 'rt',
      name: 'Round Trip',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      date_static: 1,
      date_range: 'last30Days',
      mode: 'summary',
      group_by: 'Payee',
      sort_by: 'asc',
      balance_type: 'totalTotals',
      show_empty: 0,
      show_offbudget: 0,
      show_hidden: 0,
      show_uncategorized: 0,
      trim_intervals: 0,
      include_current: 1,
      graph_type: 'LineGraph',
      conditions: [{ op: 'is', field: 'amount', value: 100 }],
      conditions_op: 'or',
      interval: 'Monthly',
    };
    const entity = reportModel.toJS(originalData);
    const backToData = reportModel.fromJS(entity);
    const backToEntity = reportModel.toJS(backToData);
    expect(backToEntity.name).toBe(originalData.name);
    expect(backToEntity.sortBy).toBe(originalData.sort_by);
    expect(backToEntity.conditionsOp).toBe(originalData.conditions_op);
    expect(backToEntity.conditions).toEqual(originalData.conditions);
  });

  // ============================================================================
  // REP-007: toJS mapea todos los campos booleanos
  // ============================================================================
  it('REP-007: toJS mapea booleanos correctamente', () => {
    const reportData: CustomReportData = {
      id: 'b1',
      name: 'Booleanos',
      start_date: '',
      end_date: '',
      date_static: 1,
      date_range: '',
      mode: '',
      group_by: '',
      sort_by: 'desc',
      balance_type: '',
      show_empty: 1,
      show_offbudget: 1,
      show_hidden: 1,
      show_uncategorized: 1,
      trim_intervals: 1,
      include_current: 0,
      graph_type: '',
      conditions: [],
      conditions_op: 'and',
      interval: '',
    };
    const entity = reportModel.toJS(reportData);
    expect(entity.isDateStatic).toBe(true);
    expect(entity.showEmpty).toBe(true);
    expect(entity.showOffBudget).toBe(true);
    expect(entity.showHiddenCategories).toBe(true);
    expect(entity.showUncategorized).toBe(true);
    expect(entity.trimIntervals).toBe(true);
    expect(entity.includeCurrentInterval).toBe(false);
  });

  // ============================================================================
  // REP-008: toJS maneja valores nulos
  // ============================================================================
  it('REP-008: toJS maneja valores nulos', () => {
    const reportData: CustomReportData = {
      id: 'n1',
      name: null as unknown as string,
      start_date: null as unknown as string,
      end_date: null as unknown as string,
      date_range: null as unknown as string,
      mode: null as unknown as string,
      group_by: null as unknown as string,
      sort_by: null as unknown as string,
      interval: null as unknown as string,
      balance_type: null as unknown as string,
      graph_type: null as unknown as string,
      date_static: 0,
      show_empty: 0,
      show_offbudget: 0,
      show_hidden: 0,
      show_uncategorized: 0,
      trim_intervals: 0,
      include_current: 0,
      conditions: undefined,
      conditions_op: 'and',
    };
    const entity = reportModel.toJS(reportData);
    expect(entity.name).toBe('');
    expect(entity.startDate).toBeNull();
    expect(entity.endDate).toBeNull();
    expect(entity.sortBy).toBeNull();
    expect(entity.conditions).toEqual([]);
  });

  // ============================================================================
  // REP-009: report/get handler - sin reportes
  // ============================================================================
  it('REP-009: report/get retorna array vacío sin reportes', async () => {
    const reports = await app.handlers['report/get']();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(0);
  });

  // ============================================================================
  // REP-010: report/create handler crea reporte
  // ============================================================================
  it('REP-010: report/create handler crea reporte', async () => {
    const reportId = await app.handlers['report/create'](
      createReportEntity({ name: 'Creado por handler' }),
    );
    expect(reportId).toBeDefined();
    expect(typeof reportId).toBe('string');

    const reports = await app.handlers['report/get']();
    expect(reports.length).toBe(1);
    expect(reports[0].name).toBe('Creado por handler');
  });

  // ============================================================================
  // REP-011: report/create rechaza nombre vacío
  // ============================================================================
  it('REP-011: report/create rechaza nombre vacío', async () => {
    await expect(
      app.handlers['report/create'](createReportEntity({ name: '' })),
    ).rejects.toThrow('Report name is required');
  });

  // ============================================================================
  // REP-012: report/create rechaza nombre duplicado
  // ============================================================================
  it('REP-012: report/create rechaza nombre duplicado', async () => {
    await app.handlers['report/create'](createReportEntity({ name: 'Único' }));
    await expect(
      app.handlers['report/create'](createReportEntity({ name: 'Único' })),
    ).rejects.toThrow('There is already a report named Único');
  });

  // ============================================================================
  // REP-013: report/update handler actualiza reporte
  // ============================================================================
  it('REP-013: report/update handler actualiza nombre', async () => {
    const reportId = await app.handlers['report/create'](
      createReportEntity({ name: 'Original' }),
    );
    await app.handlers['report/update'](
      createReportEntity({ id: reportId, name: 'Actualizado' }),
    );

    const reports = await app.handlers['report/get']();
    expect(reports[0].name).toBe('Actualizado');
  });

  // ============================================================================
  // REP-014: report/update rechaza nombre vacío
  // ============================================================================
  it('REP-014: report/update rechaza nombre vacío', async () => {
    const reportId = await app.handlers['report/create'](
      createReportEntity({ name: 'OK' }),
    );
    await expect(
      app.handlers['report/update'](createReportEntity({ id: reportId, name: '' })),
    ).rejects.toThrow('Report name is required');
  });

  // ============================================================================
  // REP-015: report/update rechaza sin id
  // ============================================================================
  it('REP-015: report/update rechaza sin id', async () => {
    await expect(
      app.handlers['report/update'](createReportEntity({ id: '', name: 'X' })),
    ).rejects.toThrow('Report recall error');
  });

  // ============================================================================
  // REP-016: report/update con nombre que ya existe
  // ============================================================================
  it('REP-016: report/update rechaza nombre duplicado', async () => {
    await app.handlers['report/create'](createReportEntity({ name: 'Primero' }));
    const reportId2 = await app.handlers['report/create'](
      createReportEntity({ name: 'Segundo' }),
    );
    await expect(
      app.handlers['report/update'](
        createReportEntity({ id: reportId2, name: 'Primero' }),
      ),
    ).rejects.toThrow('There is already a report named Primero');
  });

  // ============================================================================
  // REP-017: report/update permite mismo nombre (sin cambio)
  // ============================================================================
  it('REP-017: report/update permite mismo nombre sin cambios', async () => {
    const reportId = await app.handlers['report/create'](
      createReportEntity({ name: 'Mismo' }),
    );
    await app.handlers['report/update'](
      createReportEntity({ id: reportId, name: 'Mismo' }),
    );

    const reports = await app.handlers['report/get']();
    expect(reports[0].name).toBe('Mismo');
  });

  // ============================================================================
  // REP-018: report/delete handler elimina reporte
  // ============================================================================
  it('REP-018: report/delete handler elimina reporte', async () => {
    const reportId = await app.handlers['report/create'](
      createReportEntity({ name: 'Eliminar' }),
    );
    await app.handlers['report/delete'](reportId);

    const reports = await app.handlers['report/get']();
    expect(reports.length).toBe(0);
  });

  // ============================================================================
  // REP-019: report/get ordena alfabéticamente
  // ============================================================================
  it('REP-019: report/get retorna ordenado alfabéticamente', async () => {
    await app.handlers['report/create'](createReportEntity({ name: 'Zeta' }));
    await app.handlers['report/create'](createReportEntity({ name: 'Alfa' }));
    await app.handlers['report/create'](createReportEntity({ name: 'Beta' }));

    const reports = await app.handlers['report/get']();
    expect(reports.length).toBe(3);
    expect(reports[0].name).toBe('Alfa');
    expect(reports[1].name).toBe('Beta');
    expect(reports[2].name).toBe('Zeta');
  });

  // ============================================================================
  // REP-020: fromJS con condiciones y valores por defecto
  // ============================================================================
  it('REP-020: fromJS aplica valor por defecto sortBy', () => {
    const entity = createReportEntity({ sortBy: undefined as any });
    const data = reportModel.fromJS(entity);
    expect(data.sort_by).toBe('desc');
  });

  // ============================================================================
  // FN06-CP-009: Crear y recuperar reporte financiero personalizado
  // ============================================================================
  it('FN06-CP-009: Crear y recuperar reporte financiero personalizado (Net Worth o Spending)', async () => {
    // 1. Configuramos el reporte utilizando la entidad modelo
    const reportData = createReportEntity({
      name: 'Mi Reporte de Patrimonio Neto',
      mode: 'total',
      graphType: 'LineGraph',
      balanceType: 'netAssets',
    });

    // 2. Creamos el reporte utilizando el handler de app
    const reportId = await app.handlers['report/create'](reportData);
    expect(reportId).toBeDefined();

    // 3. Obtenemos todos los reportes y verificamos la persistencia del que acabamos de crear
    const reports = await app.handlers['report/get']();
    const createdReport = reports.find(r => r.id === reportId);
    expect(createdReport).toBeDefined();
    expect(createdReport!.name).toBe('Mi Reporte de Patrimonio Neto');
    expect(createdReport!.graphType).toBe('LineGraph');
  });

  // ============================================================================
  // FN06-CP-010: Validar unicidad del nombre del reporte
  // ============================================================================
  it('FN06-CP-010: Validar unicidad del nombre del reporte (error al duplicar)', async () => {
    // 1. Creamos un reporte inicial con un nombre específico
    const report1 = createReportEntity({ name: 'Reporte Mensual Fijo' });
    await app.handlers['report/create'](report1);

    // 2. Intentamos crear otro reporte con el mismo nombre
    const report2 = createReportEntity({ name: 'Reporte Mensual Fijo' });

    // 3. Esperamos que el handler lance una excepción controlada
    await expect(
      app.handlers['report/create'](report2),
    ).rejects.toThrow('There is already a report named Reporte Mensual Fijo');
  });

  // ============================================================================
  // FN06-CP-011: Validar campos obligatorios en el reporte
  // ============================================================================
  it('FN06-CP-011: Validar campos obligatorios en el reporte (como name)', async () => {
    // 1. Intentamos crear un reporte sin nombre (cadena vacía)
    const invalidReport = createReportEntity({ name: '' });

    // 2. Verificamos que el handler lance el error de validación de nombre obligatorio
    await expect(
      app.handlers['report/create'](invalidReport),
    ).rejects.toThrow('Report name is required');
  });

  // ============================================================================
  // FN06-CP-012: Validar selección de rangos de fecha y consistencia
  // ============================================================================
  it('FN06-CP-012: Validar selección de rangos de fecha y consistencia del reporte', async () => {
    // 1. Creamos un reporte configurado con un rango estático y fechas específicas
    const reportData = createReportEntity({
      name: 'Reporte Primer Semestre 2026',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      isDateStatic: true,
      dateRange: 'custom',
    });

    const reportId = await app.handlers['report/create'](reportData);

    // 2. Recuperamos el reporte de la base de datos
    const reports = await app.handlers['report/get']();
    const retrieved = reports.find(r => r.id === reportId);

    // 3. Verificamos la consistencia de los rangos de fecha guardados
    expect(retrieved).toBeDefined();
    expect(retrieved!.startDate).toBe('2026-01-01');
    expect(retrieved!.endDate).toBe('2026-06-30');
    expect(retrieved!.isDateStatic).toBe(true);
  });
});
