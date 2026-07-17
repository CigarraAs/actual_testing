// SYS-007 — Validador de Resultados de K6 para CI/CD.
//
// Este script lee el archivo JSON generado por K6 (k6-summary.json) y
// verifica que todos los thresholds definidos en la prueba de estrés se
// hayan cumplido. Emite process.exit(1) en caso de fallo, lo que provoca
// que el job de GitHub Actions falle.
//
// Ejecución:
//   node packages/loot-core/src/server/__system__/validate-k6.js
//
// Precondición: k6-summary.json debe existir en el mismo directorio.

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const summaryPath = resolve(__dirname, 'k6-summary.json');

// ---------------------------------------------------------------------------
// Umbrales de aceptación (deben coincidir con los definidos en stress.k6.js)
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  health_p95_max_ms: 200,
  info_p95_max_ms: 500,
  errors_max_rate: 0.01,
  min_total_requests: 1000,
};

// ---------------------------------------------------------------------------
// Validación principal
// ---------------------------------------------------------------------------

function main() {
  console.log('=== SYS-007: Validación de Resultados K6 ===\n');

  if (!existsSync(summaryPath)) {
    console.error(`ERROR: No se encontró el archivo ${summaryPath}`);
    console.error('Asegúrese de ejecutar K6 con --out json=k6-summary.json');
    process.exit(1);
  }

  let summary;
  try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
  } catch (err) {
    console.error(`ERROR: No se pudo parsear ${summaryPath}: ${err.message}`);
    process.exit(1);
  }

  const results = summary.results || summary;
  let hasFailures = false;

  // Verificar total de peticiones
  const totalReqs = results.total_requests || 0;
  console.log(`Total de peticiones: ${totalReqs} (mínimo: ${THRESHOLDS.min_total_requests})`);
  if (totalReqs < THRESHOLDS.min_total_requests) {
    console.error(`  FAIL: Menos peticiones de las requeridas.`);
    hasFailures = true;
  } else {
    console.log(`  PASS`);
  }

  // Verificar tasa de errores
  const errRate = results.errors_rate ?? 1;
  console.log(`\nTasa de errores: ${(errRate * 100).toFixed(2)}% (máximo: ${(THRESHOLDS.errors_max_rate * 100).toFixed(2)}%)`);
  if (errRate > THRESHOLDS.errors_max_rate) {
    console.error(`  FAIL: Tasa de errores excede el umbral.`);
    hasFailures = true;
  } else {
    console.log(`  PASS`);
  }

  // Verificar latencia P95 de /health
  const healthP95 = results.health_p95_ms;
  console.log(`\nLatencia P95 /health: ${healthP95 !== null && healthP95 !== undefined ? healthP95.toFixed(2) + ' ms' : 'NO DISPONIBLE'} (máximo: ${THRESHOLDS.health_p95_max_ms} ms)`);
  if (healthP95 === null || healthP95 === undefined) {
    console.error(`  FAIL: No se pudo medir la latencia de /health. ¿El endpoint respondió?`);
    hasFailures = true;
  } else if (healthP95 > THRESHOLDS.health_p95_max_ms) {
    console.error(`  FAIL: Latencia P95 excede el umbral.`);
    hasFailures = true;
  } else {
    console.log(`  PASS`);
  }

  // Verificar latencia P95 de /info
  const infoP95 = results.info_p95_ms;
  console.log(`\nLatencia P95 /info: ${infoP95 !== null && infoP95 !== undefined ? infoP95.toFixed(2) + ' ms' : 'NO DISPONIBLE'} (máximo: ${THRESHOLDS.info_p95_max_ms} ms)`);
  if (infoP95 === null || infoP95 === undefined) {
    console.error(`  FAIL: No se pudo medir la latencia de /info. ¿El endpoint respondió?`);
    hasFailures = true;
  } else if (infoP95 > THRESHOLDS.info_p95_max_ms) {
    console.error(`  FAIL: Latencia P95 excede el umbral.`);
    hasFailures = true;
  } else {
    console.log(`  PASS`);
  }

  // Resultado final
  console.log(`\n========================================`);
  if (hasFailures) {
    console.error('RESULTADO FINAL: FAIL — Algunos umbrales no se cumplieron.');
    process.exit(1);
  } else {
    console.log('RESULTADO FINAL: PASS — Todos los umbrales cumplidos.');
    process.exit(0);
  }
}

main();
