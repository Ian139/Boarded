# ClimbSet archive index

## Purpose and date

Archived 2026-07-14. This archive preserves the authored ClimbSet web, mobile, and iOS project as an inspectable snapshot while leaving the repository's `.git/` directory at the repository root. `SCHEMA.md` records the executable database schema and data-access behavior; `current-webui.png` records the captured public web UI; `archive/preexisting-current-webui.png` preserves the pre-existing untracked screenshot.

The pre-relocation manifest contained 210 authored files (all tracked files plus opaque environment/native-client files that were present but ignored). The manifest and checksums were frozen before documentation and relocation. Generated dependencies, build output, caches, and Git internals are intentionally excluded.

## Verified stack

### Web

- Next.js `16.1.1` App Router with React and React DOM `19.1.0`.
- TypeScript `5` and Tailwind CSS `4` through `@tailwindcss/postcss`.
- Supabase SSR `@supabase/ssr` and Supabase JS `@supabase/supabase-js` for authentication, PostgREST queries, RPC calls, and Storage.
- TanStack React Query, Zustand `5.0.9`, Radix UI primitives, Motion, Lucide icons, Sonner, and Vercel Analytics are present in the root dependency graph.
- The root workspace includes `packages/*` and `apps/*`; `packages/shared/` is consumed by the web and mobile clients.

### Mobile

`apps/mobile/` is an Expo Router application (`expo` `~54.0.35`, `expo-router` `~6.0.24`, React Native `0.81.5`, React `19.1.0`) using Supabase JS, AsyncStorage, Zustand, NativeWind `4.2.1`, and Tailwind CSS `3`.

### iOS

`apps/ios/ClimbSet/` is a SwiftUI client with Supabase integration, route/hold models, repository/view-model data access, route editor/viewer, profiles, comments, settings, and wall management. A generated native project under `apps/mobile/ios/` is archived except its Pods/build output exclusions; the authored mobile source remains under `apps/mobile/`.

## Runtime commands

The root `package.json` is authoritative. Its scripts are:

```text
npm run dev                 # next dev
npm run build               # next build
npm start                   # next start
npm run lint                # eslint
npm run migrate:share-tokens # node scripts/migrate-share-tokens.mjs
npm run backfill:default-wall # node scripts/backfill-default-wall-image.mjs
```

`apps/mobile/package.json` declares:

```text
npm start                   # expo start
npm run android             # expo run:android
npm run ios                 # expo run:ios
npm run web                 # expo start --web
npm run e2e:ios             # ~/.maestro/bin/maestro test e2e
npm test                    # jest --runInBand
```

No package installation, database migration, Supabase mutation, or external-state setup was performed for this archive.

## Web route inventory and behavior

The authored web route paths are:

- `/` — `app/page.tsx` (`Home`): loads walls and routes, merges local/offline data with RLS-visible remote data, searches by route/setter, filters grades/walls, sorts by date/name/grade/rating/likes/ascents/views, and exposes route viewer, log-climb, share, delete, and create/edit actions.
- `/editor` — `app/editor/page.tsx`: places and edits percentage-coordinate holds on the selected wall; supports start/hand/foot/finish types, sizes, sequence numbering, keyboard shortcuts, undo/redo, route metadata, wall snapshots, owner/moderator checks, save, and edit flows.
- `/share/[token]` — `app/share/[token]/page.tsx`: queries public routes by `share_token`, falls back when joined comments are unavailable, renders the route viewer, and calls `increment_route_view`.
- `/signup` — `app/signup/page.tsx`: validates credentials, delegates to the user store, and handles email-confirmation redirects.
- `/login` — `app/login/page.tsx`: delegates password login to the user store and redirects authenticated users home.
- `/settings` — `app/settings/page.tsx`: theme, authentication, local-data clearing, JSON export, Storage inspection/cleanup, and moderator-only cleanup actions.
- `/profile` — `app/profile/page.tsx`: profile synchronization, avatar upload, route/grade/ascent/flash statistics, and setter analytics.

There is no `app/api/**` route-handler surface: no route-handler files, `GET`/`POST`/`PUT`/`PATCH`/`DELETE` exports, or `NextRequest`/`NextResponse` usage were found in `app/`. The web request/data path is direct browser Supabase access through Zustand stores and share/settings components, not Next API handlers. `lib/supabase/server.ts` contains a cookie-based helper but has no application references.

## Data flow and integration

The browser singleton in `lib/supabase/client.ts` uses the variable names `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, persists sessions under `climbset-auth`, refreshes tokens, and detects URL sessions. `lib/stores/user-store.ts` handles Supabase sign-up, login, logout, session events, profile select/upsert/update, moderator-claim mapping, and avatar uploads. `lib/stores/routes-store.ts` and `lib/stores/walls-store.ts` query `routes`, `ascents`, `comments`, `route_likes`, and `walls` directly, reconcile public/owner-visible data, and preserve local/offline records when remote access is unavailable. Public shares query `routes` directly and use the secure view-count RPC.

Wall images are uploaded to the public `walls` bucket with owner-prefixed paths. Route wall snapshots use `${userId}/${sanitizedWallId}/route-${sanitizedRouteId}.${extension}` in the browser. Avatar uploads use `${userId}/avatar-${Date.now()}.${extension}` in the `avatars` bucket. The verified schema, RLS, grants, storage policies, and discrepancies are in `SCHEMA.md`.

`apps/mobile/lib/supabase.ts` constructs the mobile client from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` with AsyncStorage session persistence. Mobile stores use direct Supabase queries, owner-scoped offline queues, UUID migration, wall/route snapshot uploads, social CRUD, and the same view-count RPC. Mobile route areas include `apps/mobile/app/(tabs)/`, `apps/mobile/app/(auth)/`, `apps/mobile/app/share/[token].tsx`, and `apps/mobile/app/settings.tsx`; `apps/mobile/components/` contains route cards, comment policy/UI, wall canvas/viewer, and shared controls.

The iOS route repository (`apps/ios/ClimbSet/ClimbSet/Services/RoutesRepository.swift`) selects a Supabase repository when configured and otherwise provides a mock repository. It fetches public routes with ascents/comments fallbacks, enriches likes and wall images, and directly creates/updates routes. `apps/ios/ClimbSet/ClimbSet/ViewModels/` provides auth/profile, walls, comments, route filtering, and profile analytics. `apps/ios/ClimbSet/ClimbSet/Models/RouteModels.swift` mirrors the shared Hold/Route/Wall/Ascent/Comment model family. `Info.plist` contains hardcoded Supabase configuration consumed by `SupabaseConfig.swift`; values are not reproduced.

## Central models and persistence

The executable shared models are in `packages/shared/types/index.ts`; `lib/types/index.ts` only re-exports them. Holds store `x`/`y` as percentages of the wall image, one of `start`, `hand`, `foot`, or `finish`, a hex color, optional sequence, one of `small`/`medium`/`large`, and optional notes. Routes combine wall identity/snapshot metadata, name/description, V/Font grades, JSONB-compatible holds, public state, view count, share token, timestamps, and optional joined/social data. Walls store image URL/dimensions and visibility. Ascents and comments attach social activity to routes; profiles attach username and avatar metadata.

Browser persistence keys:

- `climbset-auth` — Supabase session storage.
- `climbset-routes` — Zustand route list.
- `climbset-walls` — walls and selected wall.
- `climbset-user` — display name and profile.
- `climbset-draft` — editor holds from `lib/hooks/useHolds.ts`.
- `climbset-storage-history` — localStorage storage-usage history from settings.
- `climbset-install-dismissed` — sessionStorage PWA install-prompt dismissal.

Mobile AsyncStorage keys:

- `climbset-auth` — Supabase session storage.
- `climbset-routes` — routes, pending routes/social rows, and legacy ID map.
- `climbset-walls` — walls, selected wall, pending wall IDs/owners, and legacy ID map.
- `climbset-wall` — selected-wall compatibility key.
- `climbset-user` — user/profile/auth display state.
- `climbset-draft:<userId>` — per-user editor drafts.
- `climbset-theme` — mobile theme mode.
- `climbset-storage-history` — mobile storage-usage history.

Active iOS appearance persistence uses `@AppStorage("appearanceMode")` (backed by `UserDefaults`). The older iOS wall view model also uses the compatibility key `climbset.selectedWallId`; route/wall data otherwise loads through repository/view models and Supabase auth session persistence.

## Environment variable names

Names only; values remain in the opaque archived environment files and are not reproduced:

- Web/build: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LEGACY_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_BUILD_ID`, `VERCEL_GIT_COMMIT_SHA`.
- Mobile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_DEFAULT_WALL_URL`, `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_WEB_URL`.
- iOS: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are Info.plist keys read by the client; their literal values are intentionally omitted.

## Archive layout and exclusions

After relocation, the repository root contains `.git/`, `archive/`, this index, `SCHEMA.md`, the fresh `current-webui.png`, and pre-existing generated directories/files that are explicitly excluded from the authored manifest. The authored project is under `archive/<original-relative-path>`, preserving its relative layout. `.git/` remains at the root; no nested repository is created.

Archived inputs include tracked source, tests, migrations, package manifests/lockfiles, documentation, configuration, public assets, authored iOS/mobile native files, `image.png` assets, and opaque environment files such as `.env.local`, `apps/mobile/.env`, and mobile iOS environment files. The root `.git/info/exclude` is expanded before moving `.gitignore` so root generated paths and `archive/.env*` remain ignored.

Excluded from the authored manifest: `.git/` itself, any existing `archive/`, root deliverables (`SCHEMA.md`, `archive_pass.md`, `current-webui.png`), `node_modules/`, `.next/`, coverage/output/caches, `.expo/`, `.claude/`, `.codex/`, `apps/mobile/dist/`, `apps/mobile/ios/build/`, `apps/mobile/ios/Pods/`, OS metadata, `next-env.d.ts`, and `tsconfig.tsbuildinfo`. Generated dependencies and build metadata are not copied or tracked.

## Screenshot result

The pre-existing root `current-webui.png` was inspected as a valid 1294×1300, 8-bit RGBA PNG showing the application UI, then moved byte-for-byte to `archive/preexisting-current-webui.png`. A fresh full-page capture was made at a fixed 1440×900 browser viewport and saved as root `current-webui.png`; it is a valid 1296×1302, 8-bit RGBA PNG showing the ClimbSet landing UI (header, Home Wall selector, search/filter controls, route list, and bottom navigation), not a browser/network/authentication/Next error page.

For capture, the supervised server used the package's `npm run dev` script with `-H 127.0.0.1 -p 3000` and readiness checks for both the Next `Local: http://127.0.0.1:3000` banner and TCP `127.0.0.1:3000`. A pre-existing unrelated IPv6 `python -m http.server 3000` listener from another project occupied the `localhost` IPv6 endpoint, so the verified capture tab used the supervised IPv4 URL `http://127.0.0.1:3000/` (public landing path `/`). The supervised Next process was stopped after capture; the unrelated listener was not terminated.

## Verification status

- Pre-relocation: root inventory, Git status, tracked-file manifest, ignored authored-file audit, screenshot inspection, and frozen checksum verification completed. Initial status had no tracked/staged/unstaged changes and only the pre-existing untracked screenshot.
- Schema: all 001–014 migrations, shared types, browser/mobile/iOS data-access sources, table/policy/storage names, and the no-secret documentation scan were checked before writing `SCHEMA.md`.
- Capture: successful as documented above; root and preserved screenshots decode with nonzero dimensions.
- Relocation: 210 manifest destinations exist under `archive/`, every original manifest path is absent at root, all recorded sizes/SHA-256 checksums match, excluded generated/OS paths are absent from `archive/`, and the preserved screenshot hash matches the pre-move record.
- `npm run build` from `archive/`: the first run reported that Next could not resolve `next/package.json` from `/Users/ian/Projects/ClimbingApp/archive/app` because dependencies were intentionally not copied. Reusing the existing root installation as a temporary hardlink tree under `archive/node_modules/` (no package install) made the rerun pass: Next compiled, TypeScript completed, and 10 static pages generated with exit 0. The temporary tree and generated `archive/.next/`/`archive/next-env.d.ts` were removed afterward.
- `npm run lint` from `archive/`: exit 0 with the same temporary dependency tree. The migration/backfill scripts were not run because they mutate Supabase/external state and are not verification scripts.
- Archived smoke: supervised `npm run dev -- -H 127.0.0.1 -p 3000` from `archive/` passed the Next readiness banner and TCP readiness. Chromium loaded `http://127.0.0.1:3000/` with title `ClimbSet - Digital Route Setter`, the Home Wall/search/filter/route-list/bottom-navigation UI rendered, and the server was stopped. Several remote optimized wall-image requests did not all settle within the 20-second image wait, but visible application UI rendered without a browser/network/authentication/Next error surface.
- Final checks: `git status --short` reports 0 staged changes, 182 unstaged tracked-file deletions (the relocation), and four untracked root deliverables (`SCHEMA.md`, `archive/`, `archive_pass.md`, and `current-webui.png`). `git check-ignore -v` confirms generated root metadata (`.next`, `tsconfig.tsbuildinfo`), mobile generated directories (`apps/mobile/.expo`, `apps/mobile/node_modules`), and archived secret files (`archive/.env.local`) remain ignored; root `.env.local` and `apps/mobile/.env` are absent while their archived copies exist. No secret values were read or written.
