# AGENTS.md

Guidance for coding agents working in this repository.

## Project

`pg-migrator` is an Electron desktop app that copies a PostgreSQL database from
a source server to a destination server, with an optional rename on the
destination. The schema and data transfer is delegated to `pg_dump | pg_restore`;
database creation is handled with `node-postgres`.

## Stack

- Electron + `electron-vite` (build, dev server, HMR)
- React 18 + TypeScript (`strict` mode), `@vitejs/plugin-react`
- `node-postgres` (`pg`) for the control plane
- PostgreSQL client tools (`pg_dump`, `pg_restore`) for the data plane
- No component library or state manager; do not add one unless asked

## Scaffold

This project's tooling matches the electron-vite `react-ts` template:

```bash
npm create @quick-start/electron@latest pg-migrator -- --template react-ts
```

If regenerating from scratch, scaffold with that command, then add the `main/`
services, the preload bridge, and the renderer hook/component described below.

## Commands

```bash
npm install
npm run dev        # dev with HMR
npm run build      # bundle to ./out
npm start          # preview the built app
npm run typecheck  # tsc --noEmit
```

## Process model (read before changing anything)

Electron runs two isolated programs. The boundary is a security boundary, not a
style choice. Respect it. The UI framework is a renderer-only detail: swapping
it must not touch main or preload.

- Main process (`src/main`): full Node runtime. ALL privileged work lives here:
  spawning processes, `pg`, filesystem, sockets.
- Renderer (`src/renderer`): a Chromium page running React with NO Node access
  (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`). Treat
  it as untrusted UI.
- Preload (`src/preload`): the only bridge. Exposes a narrow, typed `window.api`
  via `contextBridge`. Never expose `ipcRenderer` or any Node primitive to the
  renderer.

### IPC conventions

- Request/response (renderer asks main to do something): `ipcRenderer.invoke`
  in preload, `ipcMain.handle` in main. Used for `start`, `cancel`, `test`.
- Streaming/events (main pushes to renderer): `webContents.send` in main,
  `ipcRenderer.on` in preload. Used for `log` and `phase` updates.
- Channel names are namespaced: `migration:<action>`.
- Any new capability the renderer needs goes through `window.api`. Add the verb
  to the preload `api` object and a matching `ipcMain.handle` in main. Do not
  widen the surface beyond what the UI requires.

## Layout

```
src/
  main/
    index.ts                     window, security flags, IPC registration
    services/
      connection.ts              parse postgres:// URIs -> PG* env
      pg-tools.ts                resolve + version-check pg_dump/pg_restore
      migration-service.ts       singleton orchestrator (EventEmitter)
  preload/
    index.ts                     contextBridge -> window.api (typed PreloadApi)
  renderer/
    index.html                   CSP meta + <div id="root"> + main.tsx
    main.tsx                     React entry (createRoot, StrictMode)
    App.tsx                      presentational form + log view
    useMigration.ts              hook: owns IPC subscriptions + UI state
    style.css
```

## Renderer (React) conventions

- Keep the boundary between "talks to Electron" and "draws the UI": all IPC
  wiring and migration state lives in the `useMigration` hook; `App` is
  presentational and consumes the hook.
- The preload `onLog`/`onPhase` return an unsubscribe function. Subscribe inside
  a `useEffect` and return those unsubscribers as cleanup, so listeners live and
  die with the component. Missing cleanup causes duplicate log lines under
  `StrictMode` (dev double-invoke) and a listener leak in production.
- Inputs are controlled. Derive `running` from `phase` (terminal phases:
  `idle`, `done`, `error`, `cancelled`); do not track it as separate state.
- `window.api` is typed via `PreloadApi` and declared on the global `Window`
  in `useMigration.ts`. Components should never reference `ipcRenderer`.
- Accessibility: `htmlFor`/`id` on every input, `aria-live` on the status and
  log regions, visible focus styles.

## How a migration works

- Source string = the database being copied.
- Destination string = an admin database on the target server (e.g. `postgres`),
  used ONLY to issue `CREATE DATABASE`. It must differ from the target name.
- Target database = the rename field, or the source name if blank.

Flow in `MigrationService.run`:

1. Parse both connection strings; validate the target identifier.
2. Verify `pg_dump`/`pg_restore` are present and report versions.
3. Control plane (`pg`): existence check, optional drop, `CREATE DATABASE
"<target>" TEMPLATE template0`.
4. Data plane: spawn `pg_dump -Fc` and pipe its stdout into `pg_restore`,
   streaming (nothing on disk). Restore runs in `--single-transaction`.
5. Emit `log`/`phase` events throughout; main forwards them to the renderer.

The rename works because the target DB is created by us and the dump uses no
`--create`, so the archive carries no database name to restore into.

## Hard constraints (do not regress)

- Credentials go to child processes via `PGPASSWORD` in the child env, never on
  argv. Do not log or persist connection strings or passwords.
- Validate any database name before it reaches `CREATE`/`DROP DATABASE`; those
  statements cannot be parameterized. See `assertSafeIdentifier`.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `pg` and `electron` stay external in main/preload (`externalizeDepsPlugin`);
  do not bundle them.
- The `pg_dump`/`pg_restore` version must be >= the highest server version
  involved. Surface a clear error if the tools are missing.

## Conventions

- `MigrationService` is a singleton (`MigrationService.instance`); one in-flight
  migration per process. The renderer drives it; it owns no UI state.
- Errors propagate as thrown `Error`s out of `invoke` handlers and surface in
  the renderer log. Set `phase` to a terminal value so the UI re-enables
  controls.
- Prose and comments use no em dashes.

## Known trade-offs (change deliberately, not by accident)

- Streamed pipe vs temp file: current design streams (fast, disk-free, coarse
  progress, no resume). For very large or unreliable migrations, dump to a file
  first to get a retry point and enable `pg_restore --jobs=N`.
- `--single-transaction` gives atomic rollback but disables parallel restore.
  Removing it for `--jobs=N` trades clean failure handling for speed.
- `pg` for the control plane adds a dependency but gives better error handling
  than shelling out to `psql` for `CREATE DATABASE`.
