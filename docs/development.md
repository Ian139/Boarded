# Boarded development guide

Boarded is a climbing route-setting app with a Next.js web app at the repository root and a SwiftUI iOS app in `apps/ios/`. This guide describes the checked-in development paths only; it is not a hosted-deployment runbook.

## Prerequisites

- Node.js 20.9 or newer and npm (the repository uses npm and workspaces; Next.js 16 requires Node.js 20.9+).
- Xcode with an iOS 18 SDK for the native app. The project settings use an iOS deployment target of **18.0** and **Swift 5**.
- The web package versions pinned in `package.json` are Next.js `16.1.1` and React `19.1.0`.
- A Supabase project for cloud-backed web or iOS data. The repository does not include a Supabase CLI project configuration.
- Python 3 and Docker are needed only for the optional local RLS harness described below.

From the repository root, install JavaScript dependencies:

```bash
npm install
```

<a id="web"></a>
## Web setup

1. Copy the checked-in template and edit the copy:

   ```bash
   cp .env.local.example .env.local
   ```

2. Set the Supabase URL and public browser key for the project you intend to use. Keep `.env.local` local; it is not a file to commit.
3. Start Next.js:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>.

The browser client reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The template also contains `NEXT_PUBLIC_APP_URL`; the checked-in web code does not currently read that value. `LEGACY_SUPABASE_URL` is the optional migration input. Use the exact variable names below; do not invent alternate names.

### Environment variables and security

| Variable | Required for | Meaning | Handling |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Web client and maintenance scripts | Supabase project URL | Public configuration, but keep it aligned with the project being used. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web client | Supabase publishable/anonymous key used with normal user-session/RLS access | Client-safe only as designed by Supabase policies; never substitute a privileged key. |
| `SUPABASE_SERVICE_ROLE_KEY` | `migrate:share-tokens`, `backfill:default-wall` | Privileged server-side Supabase key | **Never client-safe.** Do not put it in `NEXT_PUBLIC_*`, the iOS plist, browser code, screenshots, logs, or commits. |
| `LEGACY_SUPABASE_URL` | Optional `backfill:default-wall` migration | Comma-separated legacy Supabase URL(s) whose storage origins may be rewritten | Keep private to the local maintenance environment; leave unset when not migrating legacy storage. |
| `NEXT_PUBLIC_APP_URL` | Local/project URL configuration | Web app URL placeholder (`http://localhost:3000` in the template) | Do not treat this as a secret. Set it only where the app needs a public URL. |

The browser Supabase client is created from the two `NEXT_PUBLIC_*` Supabase values. The service-role key bypasses normal RLS protections and is therefore restricted to deliberate maintenance scripts. If a privileged key is exposed, revoke or rotate it in Supabase immediately. Never put service-role or other secret values in this guide, tracked files, client configuration, screenshots, or logs.

## Exact npm commands

These are the scripts currently declared in `package.json`:

```bash
npm install
npm run dev
npm run build
npm start
npm run lint
npm run migrate:share-tokens
npm run backfill:default-wall
```

Run `npm start` only after `npm run build`; it serves the production build locally. The two `migrate:*`/`backfill:*` commands are privileged data-maintenance operations, not ordinary application startup commands (see [Privileged maintenance](#privileged-maintenance)).

<a id="ios"></a>
## iOS setup and running

1. Open the checked-in Xcode project:

   ```bash
   open apps/ios/ClimbSet/ClimbSet.xcodeproj
   ```

2. In Xcode, select the `ClimbSet` scheme, choose an iOS 18-compatible simulator or a signed development device, and choose **Product > Run**.
3. To configure a Supabase project for the native target, edit the target's Info.plist values named `SUPABASE_URL` and `SUPABASE_ANON_KEY`. `SupabaseConfig.swift` reads those two bundle values and creates the native client with the anonymous/publishable key.
4. If native route sharing should produce web links, set the target's optional `PUBLIC_APP_URL` Info.plist value to the web origin. When it is absent, the native code falls back to a `climbset://share/<token>` deep link. Keep any value limited to a URL; never place a service-role key in the plist.

The project settings currently specify marketing version `0.1.2`, iOS deployment target `18.0`, and Swift `5.0`. The Swift package graph is resolved in `apps/ios/ClimbSet/ClimbSet.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`; opening the project lets Xcode resolve the checked-in package graph.

A command-line Debug build is:

```bash
xcodebuild -project apps/ios/ClimbSet/ClimbSet.xcodeproj -scheme ClimbSet -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

For a device build or run, select a development team/signing destination in Xcode rather than assuming a particular local device identifier.

<a id="supabase"></a>
## Supabase migrations and local harness

The complete checked-in migration history is `supabase/migrations/001_initial_schema.sql` through `015_repair_route_snapshot_dimensions.sql`. Apply every migration **once, in numeric order** (001, 002, …, 015) using the Supabase Dashboard SQL Editor, or use a separately linked Supabase CLI workflow that you maintain for the target project. Do not skip earlier migrations or apply files alphabetically by title.

This repository does **not** contain `supabase/config.toml`. Consequently, do not claim that this checkout can run `supabase start`, and do not assume a local CLI workflow is configured here. A separately linked CLI may be used only when its project configuration and credentials are maintained outside this repository.

The optional RLS ownership harness is `supabase/tests/rls_ownership_harness.py`:

```bash
python3 supabase/tests/rls_ownership_harness.py
```

It is a test of a disposable local Supabase stack, not a cloud-project setup command. The harness defaults to `http://127.0.0.1:54321` and the Docker container `supabase_db_climbset-supabase`; override them only with loopback/local values:

```bash
CLIMBSET_LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
CLIMBSET_LOCAL_DB_CONTAINER=supabase_db_climbset-supabase \
python3 supabase/tests/rls_ownership_harness.py
```

The script deliberately refuses non-loopback API URLs and non-`supabase_db_*` database containers. It uses normal local Auth user JWTs and Docker Postgres fixture setup/cleanup; it does not read or send `SUPABASE_SERVICE_ROLE_KEY`. Start and configure any disposable local stack separately before invoking it, and never point the harness at production.

## Privileged maintenance

Run these only from the repository root with the intended Supabase project configured in `.env.local`:

```bash
npm run migrate:share-tokens
npm run backfill:default-wall
```

- `migrate:share-tokens` finds routes with a null `share_token` and assigns generated tokens.
- `backfill:default-wall` checks `public/walls/default-wall.jpg`, ensures the `walls` Storage bucket, uploads `default-wall/wall.jpg`, and rewrites matching `default-wall` route image URLs. `LEGACY_SUPABASE_URL` is optional for recognizing legacy storage origins.

Both scripts require `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Review the target project and expected rows first, use a narrowly scoped maintenance environment, and keep the service-role key out of source control and client artifacts.

<a id="validation"></a>
## Validation

Run the checks relevant to the area you changed:

```bash
npm run lint
npm run build
xcodebuild -project apps/ios/ClimbSet/ClimbSet.xcodeproj -scheme ClimbSet -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
python3 supabase/tests/rls_ownership_harness.py
```

The web commands validate the checked-in Next.js app. The Xcode command validates a simulator Debug build. The Python command is conditional on a separately started disposable local Supabase stack; a missing local stack is an environment prerequisite failure, not permission to point the harness at a remote project.

For native behavior changes, select an installed iOS simulator in Xcode and choose **Product > Test**. The shared `ClimbSet` scheme runs the `ClimbSetTests` unit/contract target and the `ClimbSetUITests` UI target.

<a id="repository-map"></a>
## Repository map

- `app/` — Next.js routes, layouts, and global styles.
- `components/` — shared web UI components.
- `lib/` — web Supabase client, stores, hooks, utilities, and tests.
- `packages/shared/` — workspace-shared TypeScript package.
- `public/` — web static assets, including the default wall image.
- `scripts/` — privileged maintenance scripts invoked by npm.
- `apps/ios/ClimbSet/ClimbSet/` — SwiftUI app source, services, models, view models, assets, and Info.plist.
- `apps/ios/ClimbSet/ClimbSet.xcodeproj/` — Xcode project and schemes.
- `apps/ios/ClimbSet/ClimbSetTests/` — native unit/contract tests.
- `apps/ios/ClimbSet/ClimbSetUITests/` — native UI tests.
- `supabase/migrations/` — ordered SQL schema, policy, RPC, and storage migrations (001–015).
- `supabase/tests/` — local-only security harnesses; currently the RLS ownership harness.
- `.env.local.example` — safe variable-name/template file; `.env.local` is local-only.

## Troubleshooting

- **Web starts but data/auth fails:** confirm `.env.local` has the intended project URL and publishable/anonymous key, then restart `npm run dev` after changing environment values.
- **`npm start` fails:** run `npm run build` first; `next start` serves only a generated production build.
- **iOS reports Supabase is not configured:** verify the target Info.plist contains a valid `SUPABASE_URL` and non-empty `SUPABASE_ANON_KEY`, then rebuild.
- **Xcode cannot resolve packages:** open the project in Xcode and allow the checked-in Swift package resolution to complete; use the project’s iOS 18-compatible SDK.
- **The RLS harness refuses to run:** verify the local API is loopback and the Docker database container name starts with `supabase_db_`; do not weaken those guards.
- **A migration fails:** stop, inspect the first failing migration and project state, and resume only after restoring the required numeric order. Do not rerun later migrations against a partially understood schema.
