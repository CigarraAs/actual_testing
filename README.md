# ¿Qué es Actual?
Actual (también conocido como Actual Budget) es una herramienta de finanzas personales que se enfoca en la privacidad y el control de tus datos. Es 100% gratuita, de código abierto y opera bajo el principio "local-first" (primero local)

Una app de finanzas personales con paneles, calendario de transacciones, listado de cuentas, gestión de beneficiarios y pagos programados.

- **Para qué sirve:** Ver tus ingresos/gastos, revisar transacciones, crear reglas para beneficiarios y controlar pagos programados.

## Imagen Referencial del funcionamiento 

<p align="center">
  <img src="/demo.png" alt="Actualbudget" />
</p>

*Figura: Vista principal de la aplicación con paneles y navegación.*

## Secciones de funcionamiento:

- Reportes (panel principal): muestra métricas clave y gráficos (ingresos, gastos, patrimonio, flujo de caja).
  - Imagen:

    ![Reportes](resources_readme/menu_principal.png)

    *Figura: Panel principal con métricas y gráficos resumidos.*

- Calendario de transacciones: vista por día con barras de ingresos/egresos y detalles al pasar el cursor.
  - Imagen:

    ![Calendario ingresos/egresos](resources_readme/calendario_ingresos_egresos.png)

    *Figura: Calendario mostrando barras diarias de ingresos y egresos.*

- Todas las cuentas (transacciones): lista de movimientos con filtro por cuenta, categorías y estados.
  - Imagen:

    ![Todas las cuentas](resources_readme/apartado_todas_las_cuentas.png)

    *Figura: Listado de transacciones con filtros por cuenta.*

- Reportes (widgets): métricas grandes y mini-gráficos para comparar periodos y presupuesto.
  - Imagen:

    ![Reportes - widgets](resources_readme/apartado_reports.png)

    *Figura: Widgets de reportes mostrando comparativas y tendencias.*

  - Imágenes adicionales de reportes:


    ![Reportes - Total Income](resources_readme/apartado_reports_TotalIncome.png)

    *Figura: Desglose de ingresos totales por periodo.*


    ![Reportes - Historial](resources_readme/apartado_reports_Historial.png)

    *Figura: Historial de transacciones y cambios en el tiempo.*


    ![Reportes - Por cada banco](resources_readme/apartado_porCadaBanco.png)

    *Figura: Comparativa de cuentas por banco.*


    ![Reglas automáticas](resources_readme/apartado_rules.png)

    *Figura: Configuración de reglas automáticas para beneficiarios.*


    ![Presupuesto](resources_readme/apartado_budget.png)

    *Figura: Vista de presupuesto con categorías y límites.*


    ![Todas las cuentas (vista)](resources_readme/apartado_AllAccounts.png)

    *Figura: Vista detallada de todas las cuentas y movimientos.*

- Payees (beneficiarios): listado de beneficiarios y botones para crear reglas automáticas.
  - Imagen:

    ![Payees](resources_readme/apartado_payees.png)

    *Figura: Gestión de beneficiarios y reglas automáticas.*

- Schedules / Calendario de pagos: lista de pagos programados con estado (Missed, Due, Upcoming, Scheduled).
  - Imagen:

    ![Calendario pagos](resources_readme/apartado_calendario.png)

    *Figura: Pagos programados con estados y fechas.*




## Para correrlo en Windows

### Prerrequisitos

- Git
- Node.js 22 o el más reciente (`node -v`)
- Corepack (se incluye en el Node.js)

### Vamos paso a paso

Esto se pega en el terminal

```powershell
git clone https://github.com/actualbudget/actual.git
cd .\actual

corepack prepare yarn@4.13.0 --activate
corepack yarn -v
corepack yarn install
```

### Lo corremos en Windows

Nota: no usar `corepack yarn start` porque esto invoca un cript `sh` que no se puede ejecutar en Windows.

Usamos uno de los siguientes de acuerdo a lo que queramos:

1. Local (sin sincronización de servidor):

```powershell
corepack yarn workspace @actual-app/web start --mode=browser
```

2. Frontend + sync server:

```powershell
# Terminal 1
corepack yarn workspace @actual-app/web start --mode=browser

# Terminal 2
corepack yarn workspace @actual-app/sync-server start
```

Abrir la Url (Generalmente `http://localhost:3001`).

### First-run choices

- Modo solo local: elige "Don't use a server" y luego "Start fresh" o "Try Demo".
- Con modo servidor: crea y confirma una contraseña, luego continúa con "OK".

### Para parar todo

Presiona `Ctrl+C`.

## Documentación
[Community Documentation](https://actualbudget.org/docs)
<a href="https://www.netlify.com"> <img src="https://www.netlify.com/v3/img/components/netlify-color-accent.svg" alt="Deploys by Netlify" /> </a>