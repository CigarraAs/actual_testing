// SYS-007: Prueba de Estrés del Servidor de Sincronización con K6.
// RNF-002 – Rendimiento masivo.
//
// Evalúa la capacidad del sync-server para mantener latencias aceptables
// bajo carga concurrente creciente, midiendo P95, tasa de errores y
// total de peticiones completadas.
//
// Ejecución local:
//   k6 run packages/loot-core/src/server/__system__/stress.k6.js
//
// Ejecución con exportación de resultados:
//   k6 run --out json=k6-summary.json packages/loot-core/src/server/__system__/stress.k6.js
//
// Precondición: sync-server corriendo en http://localhost:5006

import { Trend, Rate, Counter } from 'k6/metrics';
import http from 'k6/http';
import { check, sleep } from 'k6';

// ---------------------------------------------------------------------------
// Métricas personalizadas
// ---------------------------------------------------------------------------

const healthTrend = new Trend('http_req_duration_endpoint_health', true);
const infoTrend = new Trend('http_req_duration_endpoint_info', true);
const errorRate = new Rate('errors');
const totalRequests = new Counter('total_requests');

// ---------------------------------------------------------------------------
// Configuración de la prueba: 3 fases (rampa subida, constante, rampa bajada)
// ---------------------------------------------------------------------------

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Fase 1: rampa de subida (1 → 50 VUs)
    { duration: '60s', target: 50 },  // Fase 2: carga constante (50 VUs)
    { duration: '15s', target: 0 },   // Fase 3: rampa de bajada (50 → 0 VUs)
  ],

  thresholds: {
    // La latencia P95 del endpoint /health debe ser < 200 ms
    'http_req_duration_endpoint_health': ['p(95)<200'],

    // La latencia P95 del endpoint /info debe ser < 500 ms
    'http_req_duration_endpoint_info': ['p(95)<500'],

    // La tasa de errores HTTP debe ser < 1%
    errors: ['rate<0.01'],

    // Al menos 1000 peticiones completadas en total
    total_requests: ['count>=1000'],
  },
};

// ---------------------------------------------------------------------------
// Endpoints a testear
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:5006';
const ENDPOINTS = [
  { path: '/health', method: 'GET', trend: healthTrend, label: 'GET /health' },
  { path: '/info', method: 'GET', trend: infoTrend, label: 'GET /info' },
];

// ---------------------------------------------------------------------------
// Función principal ejecutada por cada Virtual User en cada iteración
// ---------------------------------------------------------------------------

export default function () {
  for (const endpoint of ENDPOINTS) {
    const startTime = Date.now();

    let res;
    try {
      if (endpoint.method === 'GET') {
        res = http.get(`${BASE_URL}${endpoint.path}`, {
          timeout: '10s',
        });
      }
    } catch (err) {
      // Error de red o timeout → registrar como fallo
      errorRate.add(1);
      totalRequests.add(1);
      endpoint.trend.add(Date.now() - startTime);
      continue;
    }

    const duration = Date.now() - startTime;

    // Registrar duración en la métrica Trend correspondiente
    endpoint.trend.add(duration);

    // Verificar respuesta HTTP exitosa (2xx)
    const isOk = check(res, {
      [`${endpoint.label} status 200`]: (r) => r.status === 200,
    });

    if (!isOk) {
      errorRate.add(1);
    }

    totalRequests.add(1);

    // Pequeña pausa entre peticiones del mismo VU para simular
    // comportamiento de usuario real
    sleep(0.1);
  }
}

// ---------------------------------------------------------------------------
// Resumen personalizado al finalizar la prueba
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test_id: 'SYS-007',
    description: 'Prueba de estrés del servidor de sincronización',
    environment: 'local',
    phases: options.stages,
    results: {
      total_requests: data.metrics.total_requests
        ? data.metrics.total_requests.values.count
        : 0,
      errors_rate: data.metrics.errors
        ? data.metrics.errors.values.rate
        : 0,
      health_p95_ms: data.metrics.http_req_duration_endpoint_health
        ? data.metrics.http_req_duration_endpoint_health.values['p(95)']
        : null,
      info_p95_ms: data.metrics.http_req_duration_endpoint_info
        ? data.metrics.http_req_duration_endpoint_info.values['p(95)']
        : null,
      thresholds_passed: data.root_group
        ? data.root_group.checks.every((c) => c.passes > 0)
        : false,
    },
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'k6-summary.json': JSON.stringify(summary, null, 2),
  };
}
