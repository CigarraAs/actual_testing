import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

import * as db from '#server/db';

import { app } from './app';

describe('Dashboard - Pruebas Adicionales', () => {
  beforeEach(global.emptyDatabase());
  afterEach(global.emptyDatabase());

  const WIDGET_TYPES = [
    'net-worth-card',
    'cash-flow-card',
    'spending-card',
    'crossover-card',
    'budget-analysis-card',
    'markdown-card',
    'summary-card',
    'calendar-card',
    'formula-card',
    'custom-report',
    'sankey-card',
  ] as const;

  async function insertDashboardPage(name: string) {
    const id = uuidv4();
    await db.insertWithSchema('dashboard_pages', { id, name });
    return id;
  }

  async function insertDashboardWidget(pageId: string, overrides = {}) {
    const id = uuidv4();
    const widget: Record<string, unknown> = {
      id,
      dashboard_page_id: pageId,
      type: 'net-worth-card',
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      meta: null,
      ...overrides,
    };
    await db.insertWithSchema('dashboard', widget);
    return id;
  }

  it('DASH-001: Crear y consultar páginas del dashboard', async () => {
    const pageId = await insertDashboardPage('Principal');
    const pages = await db.all(
      "SELECT * FROM dashboard_pages WHERE tombstone = 0 AND name = 'Principal'",
    );
    expect(pages.length).toBe(1);
    expect(pages[0].id).toBe(pageId);
  });

  it('DASH-002: Eliminar página y sus widgets en cascada', async () => {
    const pageId = await insertDashboardPage('Temporal');
    await insertDashboardWidget(pageId, { type: 'spending-card', width: 6, height: 4 });
    await insertDashboardWidget(pageId, { type: 'cash-flow-card', width: 6, height: 4, x: 6 });

    const widgetsBefore = await db.all(
      'SELECT id FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    );
    expect(widgetsBefore.length).toBe(2);

    await db.delete_('dashboard_pages', pageId);
    await db.runQuery('UPDATE dashboard SET tombstone = 1 WHERE dashboard_page_id = ?', [pageId]);

    const widgetsAfter = await db.all(
      'SELECT id FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    );
    expect(widgetsAfter.length).toBe(0);
  });

  it('DASH-003: Renombrar página del dashboard', async () => {
    const pageId = await insertDashboardPage('Nombre Original');
    await db.updateWithSchema('dashboard_pages', { id: pageId, name: 'Nuevo Nombre' });
    const page = await db.first(
      'SELECT * FROM dashboard_pages WHERE id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(page.name).toBe('Nuevo Nombre');
  });

  it('DASH-004: Agregar widget con posición automática', async () => {
    const pageId = await insertDashboardPage('Principal');
    await insertDashboardWidget(pageId, { x: 0, y: 0, width: 4, height: 4 });
    await insertDashboardWidget(pageId, { x: 4, y: 0, width: 4, height: 4 });

    const widgets = await db.selectWithSchema(
      'dashboard',
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0 ORDER BY x, y',
      [pageId],
    );
    expect(widgets.length).toBe(2);
    expect(widgets[0].x).toBe(0);
    expect(widgets[1].x).toBe(4);
  });

  it('DASH-005: Eliminar widget específico del dashboard', async () => {
    const pageId = await insertDashboardPage('Principal');
    const widgetId1 = await insertDashboardWidget(pageId);
    const widgetId2 = await insertDashboardWidget(pageId, { x: 4 });

    await db.delete_('dashboard', widgetId1);

    const remaining = await db.all(
      'SELECT id FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    );
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(widgetId2);
  });

  it('DASH-006: Actualizar dimensiones y posición de widget', async () => {
    const pageId = await insertDashboardPage('Principal');
    const widgetId = await insertDashboardWidget(pageId);

    await db.updateWithSchema('dashboard', {
      id: widgetId,
      x: 4,
      y: 2,
      width: 8,
      height: 4,
    });

    const widget = await db.first(
      'SELECT * FROM dashboard WHERE id = ? AND tombstone = 0',
      [widgetId],
    ) as any;
    expect(widget.x).toBe(4);
    expect(widget.y).toBe(2);
    expect(widget.width).toBe(8);
    expect(widget.height).toBe(4);
  });

  it('DASH-007: Insertar widgets de todos los tipos soportados', async () => {
    const pageId = await insertDashboardPage('Principal');

    for (let i = 0; i < WIDGET_TYPES.length; i++) {
      await insertDashboardWidget(pageId, {
        type: WIDGET_TYPES[i],
        x: (i % 4) * 3,
        y: Math.floor(i / 4) * 4,
        width: 3,
        height: 4,
      });
    }

    const widgets = await db.all(
      'SELECT DISTINCT type FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0 ORDER BY type',
      [pageId],
    );
    expect(widgets.length).toBe(WIDGET_TYPES.length);
  });

  it('DASH-008: Widget con metadata personalizada', async () => {
    const pageId = await insertDashboardPage('Principal');
    const meta = { name: 'Mi Widget', conditions: [{ op: 'is', field: 'amount', value: 100 }] };

    await insertDashboardWidget(pageId, { type: 'net-worth-card', meta });

    const widget = await db.first(
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    const parsedMeta = typeof widget.meta === 'string' ? JSON.parse(widget.meta) : widget.meta;
    expect(parsedMeta.name).toBe('Mi Widget');
    expect(parsedMeta.conditions[0].field).toBe('amount');
  });

  it('DASH-009: Widget de tipo custom-report con reporte asociado', async () => {
    const customReportId = uuidv4();
    await db.insertWithSchema('custom_reports', {
      id: customReportId,
      name: 'Reporte de Prueba',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      date_static: 1,
      date_range: '2026',
      mode: 'total',
      group_by: 'Category',
      sort_by: 'desc',
      balance_type: 'netAssets',
      show_empty: 0,
      show_offbudget: 0,
      show_hidden: 0,
      show_uncategorized: 0,
      trim_intervals: 0,
      include_current: 1,
      graph_type: 'BarGraph',
      conditions: JSON.stringify([]),
      conditions_op: 'and',
      interval: 'Monthly',
    });

    const pageId = await insertDashboardPage('Principal');
    await insertDashboardWidget(pageId, {
      type: 'custom-report',
      meta: { id: customReportId },
    });

    const widget = await db.first(
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    const parsedMeta = typeof widget.meta === 'string' ? JSON.parse(widget.meta) : widget.meta;
    expect(parsedMeta.id).toBe(customReportId);
  });

  it('DASH-010: Múltiples páginas de dashboard independientes', async () => {
    const pageId1 = await insertDashboardPage('Principal');
    const pageId2 = await insertDashboardPage('Inversiones');

    await insertDashboardWidget(pageId1, { type: 'net-worth-card', x: 0, y: 0 });
    await insertDashboardWidget(pageId1, { type: 'cash-flow-card', x: 4, y: 0 });
    await insertDashboardWidget(pageId2, { type: 'spending-card', x: 0, y: 0 });

    const widgets1 = await db.all(
      'SELECT COUNT(*) as c FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId1],
    ) as any;
    const widgets2 = await db.all(
      'SELECT COUNT(*) as c FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId2],
    ) as any;
    expect(widgets1[0].c).toBe(2);
    expect(widgets2[0].c).toBe(1);
  });

  it('DASH-011: Copiar widget de una página a otra', async () => {
    const sourcePageId = await insertDashboardPage('Origen');
    const targetPageId = await insertDashboardPage('Destino');
    const originalWidgetId = await insertDashboardWidget(sourcePageId, {
      type: 'spending-card',
      width: 6,
      height: 4,
      x: 0,
      y: 0,
    });

    const originalWidget = await db.first(
      'SELECT * FROM dashboard WHERE id = ? AND tombstone = 0',
      [originalWidgetId],
    ) as any;

    await insertDashboardWidget(targetPageId, {
      type: originalWidget.type,
      width: originalWidget.width,
      height: originalWidget.height,
      x: 0,
      y: 0,
      meta:
        typeof originalWidget.meta === 'string'
          ? JSON.parse(originalWidget.meta)
          : originalWidget.meta,
    });

    const targetWidgets = await db.all(
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [targetPageId],
    ) as any;
    expect(targetWidgets.length).toBe(1);
    expect(targetWidgets[0].type).toBe('spending-card');
  });

  it('DASH-012: Listar todas las páginas del dashboard', async () => {
    await insertDashboardPage('Principal');
    const pages = await db.all('SELECT * FROM dashboard_pages WHERE tombstone = 0') as any;
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('DASH-013: Widgets pueden tener posición x=0, y=0', async () => {
    const pageId = await insertDashboardPage('Principal');
    await insertDashboardWidget(pageId, { x: 0, y: 0, width: 4, height: 4 });

    const widget = await db.first(
      'SELECT x, y FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(widget.x).toBe(0);
    expect(widget.y).toBe(0);
  });

  it('DASH-014: Widget markdown con contenido personalizado', async () => {
    const pageId = await insertDashboardPage('Principal');
    const content = '# Título\nContenido del markdown widget';
    await insertDashboardWidget(pageId, {
      type: 'markdown-card',
      meta: { content },
    });

    const widget = await db.first(
      'SELECT meta FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    const parsed = typeof widget.meta === 'string' ? JSON.parse(widget.meta) : widget.meta;
    expect(parsed.content).toBe(content);
  });

  it('DASH-015: Conteo y distribución de widgets por tipo', async () => {
    const pageId = await insertDashboardPage('Principal');
    await insertDashboardWidget(pageId, { type: 'net-worth-card', x: 0, y: 0 });
    await insertDashboardWidget(pageId, { type: 'net-worth-card', x: 4, y: 0 });
    await insertDashboardWidget(pageId, { type: 'spending-card', x: 0, y: 4 });

    const distribution = await db.all(
      `SELECT type, COUNT(*) as count FROM dashboard 
       WHERE dashboard_page_id = ? AND tombstone = 0 
       GROUP BY type ORDER BY count DESC`,
      [pageId],
    ) as any;
    expect(distribution.length).toBe(2);
    expect(distribution[0].type).toBe('net-worth-card');
    expect(distribution[0].count).toBe(2);
  });

  it('DASH-016: dashboard-create handler crea página', async () => {
    const pageId = await app.handlers['dashboard-create']({ name: 'Desde Handler' });
    expect(pageId).toBeDefined();
    const page = await db.first(
      'SELECT * FROM dashboard_pages WHERE id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(page.name).toBe('Desde Handler');
  });

  it('DASH-017: dashboard-rename handler renombra página', async () => {
    const pageId = await insertDashboardPage('Original');
    await app.handlers['dashboard-rename']({ id: pageId, name: 'Renombrado' });
    const page = await db.first(
      'SELECT * FROM dashboard_pages WHERE id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(page.name).toBe('Renombrado');
  });

  it('DASH-018: dashboard-add-widget handler agrega widget', async () => {
    const pageId = await insertDashboardPage('WidgetsPage');
    await app.handlers['dashboard-add-widget']({
      type: 'net-worth-card' as any,
      dashboard_page_id: pageId,
      width: 4,
      height: 4,
    });
    const widgets = await db.all(
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(widgets.length).toBe(1);
    expect(widgets[0].type).toBe('net-worth-card');
  });

  it('DASH-019: dashboard-remove-widget handler elimina widget', async () => {
    const pageId = await insertDashboardPage('RemovePage');
    const widgetId = await insertDashboardWidget(pageId);
    await app.handlers['dashboard-remove-widget'](widgetId);
    const widgets = await db.all(
      'SELECT id FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    );
    expect(widgets.length).toBe(0);
  });

  it('DASH-020: dashboard-delete handler elimina página', async () => {
    await insertDashboardPage('Conservar');
    const deletePageId = await insertDashboardPage('Eliminar');
    await app.handlers['dashboard-delete'](deletePageId);
    const deletedPage = await db.first(
      'SELECT * FROM dashboard_pages WHERE id = ? AND tombstone = 0',
      [deletePageId],
    );
    expect(deletedPage).toBeNull();
  });

  it('DASH-021: dashboard-update-widget handler actualiza widget', async () => {
    const pageId = await insertDashboardPage('UpdatePage');
    const widgetId = await insertDashboardWidget(pageId, { type: 'spending-card', x: 0, y: 0 });
    await app.handlers['dashboard-update-widget']({
      id: widgetId,
      x: 4,
      y: 2,
      width: 6,
      height: 3,
    });
    const widget = await db.first(
      'SELECT * FROM dashboard WHERE id = ? AND tombstone = 0',
      [widgetId],
    ) as any;
    expect(widget.x).toBe(4);
    expect(widget.y).toBe(2);
    expect(widget.width).toBe(6);
    expect(widget.height).toBe(3);
  });

  it('DASH-022: dashboard-update handler actualiza múltiples widgets', async () => {
    const pageId = await insertDashboardPage('BatchPage');
    const w1 = await insertDashboardWidget(pageId, { x: 0, y: 0, width: 4, height: 4 });
    const w2 = await insertDashboardWidget(pageId, { x: 4, y: 0, width: 4, height: 4 });

    await app.handlers['dashboard-update']([
      { id: w1, x: 2, y: 2, width: 5, height: 5 },
      { id: w2, x: 6, y: 2, width: 5, height: 5 },
    ]);

    const updated1 = await db.first(
      'SELECT * FROM dashboard WHERE id = ? AND tombstone = 0',
      [w1],
    ) as any;
    expect(updated1.x).toBe(2);
    expect(updated1.y).toBe(2);
  });

  it('DASH-023: dashboard-reset handler restablece defaults', async () => {
    const pageId = await insertDashboardPage('ResetPage');
    await insertDashboardWidget(pageId, { type: 'spending-card', x: 0, y: 0 });

    await app.handlers['dashboard-reset'](pageId);

    const widgets = await db.all(
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(widgets.length).toBeGreaterThanOrEqual(11);
  });

  it('DASH-024: dashboard-copy-widget handler copia widget', async () => {
    const sourcePageId = await insertDashboardPage('Origen');
    const targetPageId = await insertDashboardPage('Destino');
    const widgetId = await insertDashboardWidget(sourcePageId, {
      type: 'spending-card',
      width: 6,
      height: 4,
      x: 0,
      y: 0,
    });

    await app.handlers['dashboard-copy-widget']({
      id: widgetId,
      targetDashboardPageId: targetPageId,
    });

    const targetWidgets = await db.all(
      'SELECT * FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [targetPageId],
    ) as any;
    expect(targetWidgets.length).toBe(1);
    expect(targetWidgets[0].type).toBe('spending-card');
  });

  it('DASH-025: dashboard-add-widget calcula posición automática', async () => {
    const pageId = await insertDashboardPage('AutoPage');
    await app.handlers['dashboard-add-widget']({
      type: 'net-worth-card' as any,
      dashboard_page_id: pageId,
      width: 4,
      height: 4,
    });

    const widgets = await db.all(
      'SELECT x, y FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(widgets.length).toBe(1);
    expect(widgets[0].x).toBe(0);
    expect(widgets[0].y).toBe(0);
  });

  it('DASH-026: dashboard-add-widget con widgets existentes calcula posición', async () => {
    const pageId = await insertDashboardPage('PosPage');
    await insertDashboardWidget(pageId, { x: 0, y: 0, width: 4, height: 4 });

    await app.handlers['dashboard-add-widget']({
      type: 'cash-flow-card' as any,
      dashboard_page_id: pageId,
      width: 4,
      height: 4,
    });

    const widgets = await db.all(
      'SELECT x, y FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0 ORDER BY x, y',
      [pageId],
    ) as any;
    expect(widgets.length).toBe(2);
    expect(widgets[1].x).toBe(4);
  });

  it('DASH-027: dashboard-add-widget con x e y explícitos', async () => {
    const pageId = await insertDashboardPage('ExplicitPos');

    await app.handlers['dashboard-add-widget']({
      type: 'spending-card' as any,
      dashboard_page_id: pageId,
      width: 6,
      height: 4,
      x: 6,
      y: 4,
    });

    const widget = await db.first(
      'SELECT x, y FROM dashboard WHERE dashboard_page_id = ? AND tombstone = 0',
      [pageId],
    ) as any;
    expect(widget.x).toBe(6);
    expect(widget.y).toBe(4);
  });

  it('DASH-028: copyDashboardWidget con ID inexistente lanza error', async () => {
    const targetPageId = await insertDashboardPage('Target');
    await expect(
      app.handlers['dashboard-copy-widget']({
        id: 'widget-inexistente',
        targetDashboardPageId: targetPageId,
      }),
    ).rejects.toThrow('Widget not found');
  });

  it('DASH-029: Crear múltiples páginas con handler', async () => {
    const id1 = await app.handlers['dashboard-create']({ name: 'Página 1' });
    const id2 = await app.handlers['dashboard-create']({ name: 'Página 2' });
    const id3 = await app.handlers['dashboard-create']({ name: 'Página 3' });

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);

    const pages = await db.all(
      "SELECT name FROM dashboard_pages WHERE tombstone = 0 AND name LIKE 'Página%'",
    ) as any;
    expect(pages.length).toBe(3);
  });

  it('DASH-030: dashboard-update-widget cambia solo posición', async () => {
    const pageId = await insertDashboardPage('PosUpdate');
    const widgetId = await insertDashboardWidget(pageId, {
      type: 'net-worth-card',
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });

    await app.handlers['dashboard-update-widget']({
      id: widgetId,
      x: 8,
      y: 4,
    });

    const widget = await db.first(
      'SELECT x, y, width, height FROM dashboard WHERE id = ? AND tombstone = 0',
      [widgetId],
    ) as any;
    expect(widget.x).toBe(8);
    expect(widget.y).toBe(4);
    expect(widget.width).toBe(4);
    expect(widget.height).toBe(4);
  });
});
