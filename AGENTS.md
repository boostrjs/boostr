# Boostr

## What is Boostr?

Boostr is a CLI companion tool for the **Layr** framework (`layrjs.com`). It handles scaffolding, local development, building, and AWS deployment of full-stack JavaScript/TypeScript web applications. Author: Manuel Vila (`hi@mvila.me`).

## Repository Structure

**Monorepo** (no workspace manager - plain npm). Root `package.json` is private.

```
boostr/
├── packages/
│   ├── cli/             # Main CLI tool (npm: "boostr")
│   ├── prettierrc/      # Shared Prettier config (@boostr/prettierrc)
│   ├── tsconfig/        # Shared TypeScript config (@boostr/tsconfig)
│   ├── web-app-ts/      # TypeScript web app template (@boostr/web-app-ts)
│   └── web-app-js/      # JavaScript web app template (@boostr/web-app-js)
├── examples/            # Example apps (web-app-js, web-app-ts)
├── assets/              # Branding (SVG logo, PNG icons, PDFs)
└── README.md            # Extensive documentation (~45K)
```

## CLI Package (`packages/cli`)

### Entry Points

- **Binary**: `src/cli.ts` - shebang script, finds local boostr version or falls back to bundled
- **Library**: `src/index.ts` - exports `runCLI()` async function
- **Build output**: `dist/` directory, ES modules

### Argument Parsing

- Uses `mri` (lightweight parser) in `src/argument-parser.ts`
- Global options: `--stage <name>`, `--development`, `--test`, `--staging`, `--production`, `--version`, `--help`
- Built-in stages: development (default), test, staging, production

### Command System (`src/command.ts`)

20 commands total:

- **Lifecycle**: `install`, `update [--save]`, `check`, `build`, `test`, `start`, `deploy [--skip]`
- **Database**: `migrate`, `import <file>`, `export <file>`
- **Backend**: `introspect`, `eval <code>`, `repl`
- **Other**: `config`, `exec -- <cmd>`, `freeze`, `initialize/init <template>`

### Service Architecture

Class hierarchy in `src/services/`:

```
BaseService (base.ts)         - abstract, command/help infrastructure
├── ApplicationService (application.ts) - root service, orchestrates subservices
└── Subservice (sub.ts)       - abstract base for all subservices
    ├── BackendService (backend.ts)      - Layr component server, Lambda deploy
    ├── WebFrontendService (web-frontend.ts) - React SPA, CloudFront deploy
    ├── DatabaseService (database.ts)    - MongoDB (local via memory-server)
    └── CustomService (custom.ts)        - user-defined
```

Factory in `src/services/index.ts` creates services from `boostr.config.mjs` type field.

### Configuration System (`src/config.ts`)

- Loads `boostr.config.mjs` + `boostr.config.private.mjs` (merged via lodash)
- Config files are ES modules exporting a function: `({application, services}) => ({...})`
- Stage-based config inheritance
- Environment variable resolution with `{{variable}}` syntax
- Uses `BLACK_HOLE` proxy for unresolved service references during config loading

### Build System (`src/builder.ts`)

- **Bundler**: esbuild (v0.16.15 on main, v0.27.1 on next; installed globally to `~/.cache/boostr`)
- Bootstrap template injection for different platforms (local vs AWS Lambda)
- Watch mode with hot reload callbacks
- Asset loaders: PNG, JPEG, GIF, WebP, SVG
- Freeze mode: hash-suffixed immutable filenames (`name-[hash].immutable.ext`)

### Process Management (`src/processes/`)

- `ProcessController` forks child processes for long-running ops
- Decorated output with service name prefixing
- Auto-restart on crash (10s delay)
- Child scripts: `start-backend`, `start-backend-repl`, `eval-backend`, `migrate-database`, `import-database`, `export-database`, `introspect-backend`, `find-backend-background-methods`

### Development Server (`src/spa-server.ts`)

- Koa-based SPA server with WebSocket hot reload
- GET-only, index.html fallback
- Client-side JS injected: auto-reconnect with 10s backoff, max 30 retries

### AWS Deployment (`src/resources/`)

- `aws/base.ts` - AWS SDK client management (lazy init)
- `aws/function.ts` - Lambda + IAM role/policy + EventBridge scheduling
- `aws/website.ts` - S3 + CloudFront CDN

### Other Modules

- `src/npm.ts` - npm integration (install, update, test, global package caching)
- `src/checker.ts` - TypeScript type checking via `tsc --noEmit`
- `src/initialize.ts` - template scaffolding (npm pack + extract + variable population)
- `src/component.ts` - Layr component introspection
- `src/help.ts` - terminal-width-aware help formatting
- `src/utilities.ts` - logging, error handling, file utils, hashing, variable resolution

### Key Dependencies

- **Layr**: @layr/component, @layr/storable, @layr/aws-integration, @layr/component-http-server, @layr/component-server, @layr/execution-queue
- **Build**: esbuild
- **Server**: koa, koa-send, ws (WebSocket)
- **Files**: fs-extra, tar, cross-zip, walk-sync, chokidar
- **Utils**: lodash, mri, wrap-ansi, bytes, mime, minimatch, hasha, base-x
- **DB**: mongodb-memory-server-global (pinned at 8.11.0 via constant, downloads mongod 5.0.13)
- **Types**: source-map-support

### Ephemeral Database & mongodb-memory-server Version Chain

The `isEphemeral: true` database config option uses `storageEngine: 'ephemeralForTest'`.
This engine was removed from MongoDB in 7.0.0. The dependency chain is:

```
database.ts: MONGODB_MEMORY_SERVER_GLOBAL_PACKAGE_VERSION = '8.11.0'
  -> mongodb-memory-server-global@8.11.0
    -> mongodb-memory-server-core@8.11.0 (DEFAULT_VERSION = '5.0.13')
      -> downloads mongod 5.0.13 binary (ephemeralForTest works natively)
```

If that version constant is bumped:

- **To 9.x**: default binary becomes 6.x (still works), but 7.0+ fallback added in 9.0.0-beta.2
- **To 10.x**: default binary is 7.0.14+ -> `ephemeralForTest` silently becomes `wiredTiger`
- **To 11.x**: default binary is 8.2.x -> same silent fallback

The fallback is graceful: mongodb-memory-server uses a tmpdir (cleaned on `.stop()`), so `isEphemeral: true` still means "no persistent data/ dir in the project". The difference is only the engine under the hood (wiredTiger + tmpdir vs true RAM-only).

## Template Packages

Both `web-app-ts` and `web-app-js` scaffold a three-service architecture:

```
my-app/
├── boostr.config.mjs        # Application config (type: 'application')
├── frontend/
│   ├── boostr.config.mjs    # type: 'web-frontend', dependsOn: 'backend'
│   └── src/components/application.tsx  # Routable React component
├── backend/
│   ├── boostr.config.mjs    # type: 'backend', dependsOn: 'database'
│   └── src/components/application.ts   # Exposed Layr component
└── database/
    └── boostr.config.mjs    # type: 'database', MongoDB
```

### Layr Patterns Used in Templates

- **Decorators**: `@expose({call: true})`, `@method()`, `@layout('/')`, `@page('[/]')`
- **Mixins**: `Routable(Base)`, `Storable`
- **RPC**: Frontend gets backend proxy via `ComponentHTTPClient`, extends it with UI
- **Data loading**: `useData(async () => ..., (data) => <JSX/>)`

## Configuration Packages

### @boostr/tsconfig

- Target: ES2020, React JSX, strict mode, experimental decorators, source maps

### @boostr/prettierrc

- 100 char width, 2-space indent, single quotes, no trailing commas, no bracket spacing, semicolons

## Code Style & Conventions

- ES modules throughout (`"type": "module"` in CLI package)
- TypeScript with strict mode and decorators
- Prettier formatting (see above)
- 2-space indentation, LF line endings
- No test framework visible in CLI (tests run via template's npm test)
- No ESLint configuration

## Build & Development

```bash
# In packages/cli:
npm run build          # Build the CLI (uses dev-tools)

# CLI usage (in a boostr project):
boostr init <template> # Scaffold new app
boostr start           # Dev server with hot reload
boostr build           # Production build
boostr deploy          # Deploy to AWS
boostr [service] <cmd> # Run command on specific service
```

## Architecture Decisions

- **No workspace manager**: packages are independent, published separately to npm
- **Global tool caching**: esbuild and typescript installed to `~/.cache/boostr` for reuse
- **Process isolation**: long-running tasks (backend, REPL, migrations) run in forked processes
- **Config as code**: ES module configs allow dynamic, stage-aware configuration with cross-service references
- **Bootstrap injection**: esbuild bundles get platform-specific wrapper code injected at build time
