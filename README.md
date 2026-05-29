# actual_testing

<p align="center">
  <img src="/demo.png" alt="Actualbudget" />
</p>

## Imagen Referencial del funcionamiento 
(https://actualbudget.org/docs/contributing/) 


Want to say thanks? Click the ⭐ at the top of the page.
## Para correrlo en Windows

### Prerrequisitos

- Git
- Node.js 22 or newer (`node -v`)
- Corepack (included with modern Node.js)

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
