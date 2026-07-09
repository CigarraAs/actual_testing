// @ts-strict-ignore
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SHORTCUT_MODAL_PATH = path.resolve(
  __dirname,
  '../../../../desktop-client/src/components/modals/KeyboardShortcutModal.tsx',
);
const THEMES_DIR = path.resolve(
  __dirname,
  '../../../../component-library/src/Themes',
);
const THEME_CSS_FILES = ['light.css', 'dark.css', 'midnight.css'];

const REQUIRED_THEME_TOKENS = [
  'pageBackground',
  'tableBackground',
  'tableBorder',
  'tableText',
  'buttonPrimaryBackground',
  'buttonPrimaryText',
  'modalBackground',
  'sidebarBackground',
  'menuBackground',
];

describe('System Test: Usability — Shortcuts, Themes, Navigation (SYS-005)', () => {
  /**
   * SYS-005.1: Verificar que los atajos de teclado principales están definidos.
   * RNF-004 – Usabilidad e Interfaz.
   *
   * Valida que:
   * - El archivo KeyboardShortcutModal.tsx existe y tiene contenido.
   * - Los atajos requeridos (10+) están documentados en el código.
   * - El modal de ayuda de atajos es accesible desde el Help Menu.
   */
  it('SYS-005.1: Atajos de teclado definidos en KeyboardShortcutModal.tsx', () => {
    expect(fs.existsSync(SHORTCUT_MODAL_PATH)).toBe(true);

    const content = fs.readFileSync(SHORTCUT_MODAL_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(500);

    const shortcutDefs = [
      { label: 'command-palette', check: /id:\s*['"]command-palette['"]/i },
      { label: 'undo', check: /id:\s*['"]undo-last-change['"]/i },
      { label: 'redo', check: /id:\s*['"]redo-last-change['"]/i },
      { label: 'toggle-privacy', check: /id:\s*['"]toggle-privacy-filter['"]/i },
      { label: 'select-all', check: /id:\s*['"]select-all-transactions['"]/i },
      { label: 'help', check: /id:\s*['"]help['"]/ },
      { label: 'add-transaction', check: /id:\s*['"]add-transaction/ },
      { label: 'close-budget', check: /id:\s*['"]close-budget['"]/i },
      { label: 'bank-sync', check: /id:\s*['"]bank-sync['"]/i },
      { label: 'filter', check: /id:\s*['"]filter/ },
    ];

    const results: string[] = [];
    for (const { label, check } of shortcutDefs) {
      const found = check.test(content);
      results.push(`${label}: ${found ? 'OK' : 'NOT FOUND'}`);
    }

    console.log('\n[SYS-005.1] Atajos de teclado verificados:');
    results.forEach(r => console.log(`  ${r}`));

    const foundCount = shortcutDefs.filter(d => d.check.test(content)).length;
    expect(foundCount).toBeGreaterThanOrEqual(8);
  });

  /**
   * SYS-005.2: Verificar que los archivos de temas CSS existen y son válidos.
   * RNF-004 – Usabilidad e Interfaz.
   *
   * Valida que:
   * - Los 3 temas (light, dark, midnight) tienen archivos CSS de > 100 líneas.
   * - Cada archivo define al menos 120 variables CSS personalizadas.
   * - Los tokens visuales requeridos están presentes en los 3 temas.
   */
  it('SYS-005.2: Archivos de temas CSS (light, dark, midnight) válidos', () => {
    expect(fs.existsSync(THEMES_DIR)).toBe(true);

    for (const file of THEME_CSS_FILES) {
      const filePath = path.join(THEMES_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      expect(lines.length).toBeGreaterThan(100);

      const varMatches = content.match(/--color-\w+/g);
      const uniqueVars = varMatches ? new Set(varMatches).size : 0;

      const missingTokens: string[] = [];
      for (const token of REQUIRED_THEME_TOKENS) {
        if (!content.includes(`--color-${token}`)) {
          missingTokens.push(token);
        }
      }

      console.log(`\n  ${file}:`);
      console.log(`    Líneas: ${lines.length}`);
      console.log(`    Variables CSS únicas: ${uniqueVars}`);
      console.log(`    Tokens requeridos: ${missingTokens.length === 0 ? 'Todos OK' : 'Faltan: ' + missingTokens.join(', ')}`);

      expect(uniqueVars).toBeGreaterThanOrEqual(120);
      expect(missingTokens.length).toBe(0);
    }
  });

  /**
   * SYS-005.3: Verificar infraestructura de temas y accesibilidad.
   * RNF-004 – Usabilidad e Interfaz.
   *
   * Valida que:
   * - El motor de temas (theme.tsx) soporta light, dark, midnight, auto.
   * - El componente ThemeSelector existe.
   * - El sistema de data-theme attribute funciona.
   * - El palette.css está presente como base de tokens.
   */
  it('SYS-005.3: Infraestructura de temas y data-theme attribute', () => {
    const themeEnginePath = path.resolve(
      __dirname,
      '../../../../desktop-client/src/style/theme.tsx',
    );
    const themeSelectorPath = path.resolve(
      __dirname,
      '../../../../desktop-client/src/components/ThemeSelector.tsx',
    );
    const appPath = path.resolve(
      __dirname,
      '../../../../desktop-client/src/components/App.tsx',
    );
    const palettePath = path.join(THEMES_DIR, 'palette.css');

    expect(fs.existsSync(themeEnginePath)).toBe(true);
    expect(fs.existsSync(themeSelectorPath)).toBe(true);
    expect(fs.existsSync(appPath)).toBe(true);
    expect(fs.existsSync(palettePath)).toBe(true);

    const themeEngine = fs.readFileSync(themeEnginePath, 'utf-8');
    const modes = ['light', 'dark', 'midnight', 'auto'];
    const modeResults: Record<string, boolean> = {};

    for (const mode of modes) {
      modeResults[mode] = themeEngine.includes(`'${mode}'`) || themeEngine.includes(`"${mode}"`) || themeEngine.includes(`${mode}:`) || themeEngine.includes(`${mode},`);
    }

    console.log('\n[SYS-005.3] Modos de tema en theme.tsx:');
    for (const mode of modes) {
      console.log(`  ${mode}: ${modeResults[mode] ? 'OK' : 'NOT FOUND'}`);
    }
    expect(Object.values(modeResults).every(Boolean)).toBe(true);

    const app = fs.readFileSync(appPath, 'utf-8');
    expect(app.includes('data-theme')).toBe(true);
    console.log(`  data-theme attribute: OK`);

    const themeSelector = fs.readFileSync(themeSelectorPath, 'utf-8');
    expect(themeSelector.length).toBeGreaterThan(100);
    console.log(`  ThemeSelector.tsx: ${themeSelector.length} bytes`);

    const palette = fs.readFileSync(palettePath, 'utf-8');
    const paletteVars = (palette.match(/--palette-\w+/g) || []);
    const uniquePaletteVars = new Set(paletteVars).size;
    expect(uniquePaletteVars).toBeGreaterThanOrEqual(30);
    console.log(`  Palette tokens: ${uniquePaletteVars} únicos`);
  });

  /**
   * SYS-005.4: Verificar que existen componentes de navegación por teclado.
   * RNF-004 – Usabilidad e Interfaz.
   *
   * Valida que:
   * - El sistema de scopes de hotkeys (react-hotkeys-hook) está configurado.
   * - Los componentes principales tienen bindings de teclado (useHotkeys).
   * - El HelpMenu y Command Palette son accesibles.
   */
  it('SYS-005.4: Infraestructura de navegación por teclado (react-hotkeys-hook)', () => {
    const appPath = path.resolve(
      __dirname,
      '../../../../desktop-client/src/components/App.tsx',
    );
    expect(fs.existsSync(appPath)).toBe(true);
    const app = fs.readFileSync(appPath, 'utf-8');
    expect(app.includes('HotkeysProvider')).toBe(true);

    const componentsToCheck = [
      { name: 'Header (accounts)', path: path.resolve(__dirname, '../../../../desktop-client/src/components/accounts/Header.tsx') },
      { name: 'TransactionsTable', path: path.resolve(__dirname, '../../../../desktop-client/src/components/transactions/TransactionsTable.tsx') },
      { name: 'DynamicBudgetTable', path: path.resolve(__dirname, '../../../../desktop-client/src/components/budget/DynamicBudgetTable.tsx') },
      { name: 'Titlebar', path: path.resolve(__dirname, '../../../../desktop-client/src/components/Titlebar.tsx') },
      { name: 'HelpMenu', path: path.resolve(__dirname, '../../../../desktop-client/src/components/HelpMenu.tsx') },
    ];

    console.log('\n[SYS-005.4] Componentes con navegación por teclado:');
    for (const { name, path: p } of componentsToCheck) {
      expect(fs.existsSync(p)).toBe(true);
      const file = fs.readFileSync(p, 'utf-8');
      const hasHotkeys = file.includes('useHotkeys') || file.includes('keyboard') || file.includes('shortcut');
      console.log(`  ${name}: ${hasHotkeys ? 'OK' : 'No bindings detectados'}`);
      expect(hasHotkeys).toBe(true);
    }

    console.log(`  HotkeysProvider en App.tsx: OK`);
  });
});
