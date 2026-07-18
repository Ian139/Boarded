# ClimbSet schema and data-access record

Verified 2026-07-14 from the executable SQL migrations `supabase/migrations/001_initial_schema.sql` through `014_backfill_storage_and_snapshots.sql`, shared models in `packages/shared/types/index.ts`, and live browser/mobile/iOS data-access code. The SQL migrations are authoritative when SQL and TypeScript differ. No secret values are reproduced here.

## Relational schema

### `walls`

Defined in `001_initial_schema.sql`; `006_route_wall_image_url.sql`, `011_route_wall_snapshot_dimensions.sql`, and `014_backfill_storage_and_snapshots.sql` add route snapshot fields rather than changing this table.

| Column | PostgreSQL type | Default | Nullability | Key / relationship |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | `uuid_generate_v4()` | `NOT NULL` (primary key) | Primary key |
| `user_id` | `uuid` | none | Nullable | Foreign key to `auth.users(id)`, `ON DELETE SET NULL` |
| `name` | `text` | none | `NOT NULL` | — |
| `description` | `text` | none | Nullable | — |
| `image_url` | `text` | none | `NOT NULL` | — |
| `image_width` | `integer` | `1920` | Nullable | — |
| `image_height` | `integer` | `1080` | Nullable | — |
| `is_public` | `boolean` | `true` | Nullable | — |
| `created_at` | `timestamptz` | `NOW()` | Nullable | — |
| `updated_at` | `timestamptz` | `NOW()` | Nullable | — |

Explicit index: `idx_walls_is_public` on `is_public`. The `user_id` relationship is nullable at the SQL layer; final insert/update/delete RLS is owner-scoped for authenticated clients.

### `routes`

Defined in `001_initial_schema.sql`. `wall_image_url` is added by `006_route_wall_image_url.sql`; `wall_image_width` and `wall_image_height` are added by `011_route_wall_snapshot_dimensions.sql`.

| Column | PostgreSQL type | Default | Nullability | Key / relationship |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | `uuid_generate_v4()` | `NOT NULL` (primary key) | Primary key |
| `user_id` | `uuid` | none | Nullable | Foreign key to `auth.users(id)`, `ON DELETE SET NULL` |
| `user_name` | `text` | none | Nullable | — |
| `wall_id` | `text` | none | `NOT NULL` | Intentionally no foreign key; supports local IDs such as `default-wall` |
| `name` | `text` | none | `NOT NULL` | — |
| `description` | `text` | none | Nullable | — |
| `grade_v` | `text` | none | Nullable | — |
| `grade_font` | `text` | none | Nullable | — |
| `rating` | `numeric(2,1)` | none | Nullable | No range check is defined |
| `holds` | `jsonb` | `'[]'` | `NOT NULL` | JSON payload; no shape check is defined |
| `is_public` | `boolean` | `true` | Nullable | — |
| `view_count` | `integer` | `0` | Nullable | — |
| `share_token` | `text` | none | Nullable | `UNIQUE` (implicit unique index) |
| `created_at` | `timestamptz` | `NOW()` | Nullable | — |
| `updated_at` | `timestamptz` | `NOW()` | Nullable | — |
| `wall_image_url` | `text` | none | Nullable | Route wall-image snapshot URL |
| `wall_image_width` | `integer` | none | Nullable | Snapshot dimension |
| `wall_image_height` | `integer` | none | Nullable | Snapshot dimension |

Explicit indexes: `idx_routes_wall_id`, `idx_routes_user_id`, and `idx_routes_is_public`. `006` backfills `wall_image_url` from `walls.image_url` only when `routes.wall_id = walls.id::text`; it does not add a foreign key. `014` conditionally rewrites matching storage references and fills missing snapshot dimensions.

### `ascents`

Defined in `001_initial_schema.sql`.

| Column | PostgreSQL type | Default | Nullability | Key / relationship |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | `uuid_generate_v4()` | `NOT NULL` (primary key) | Primary key |
| `route_id` | `uuid` | none | Nullable | Foreign key to `routes(id)`, `ON DELETE CASCADE` |
| `user_id` | `uuid` | none | Nullable | Foreign key to `auth.users(id)`, `ON DELETE SET NULL` |
| `user_name` | `text` | none | Nullable | — |
| `grade_v` | `text` | none | Nullable | — |
| `rating` | `integer` | none | Nullable | `CHECK (rating >= 1 AND rating <= 5)` |
| `notes` | `text` | none | Nullable | — |
| `flashed` | `boolean` | `false` | Nullable | — |
| `created_at` | `timestamptz` | `NOW()` | Nullable | — |

Explicit indexes: `idx_ascents_route_id` and `idx_ascents_user_id`.

### `comments`

Defined in `002_social_features.sql`.

| Column | PostgreSQL type | Default | Nullability | Key / relationship |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | `uuid_generate_v4()` | `NOT NULL` (primary key) | Primary key |
| `route_id` | `uuid` | none | Nullable | Foreign key to `routes(id)`, `ON DELETE CASCADE` |
| `user_id` | `uuid` | none | Nullable | Foreign key to `auth.users(id)`, `ON DELETE SET NULL` |
| `user_name` | `text` | none | Nullable | — |
| `content` | `text` | none | `NOT NULL` | — |
| `is_beta` | `boolean` | `false` | Nullable | — |
| `created_at` | `timestamptz` | `NOW()` | Nullable | — |

Explicit indexes: `idx_comments_route_id` and `idx_comments_user_id`.

### `route_likes`

Defined in `002_social_features.sql`.

| Column | PostgreSQL type | Default | Nullability | Key / relationship |
| --- | --- | --- | --- | --- |
| `route_id` | `uuid` | none | `NOT NULL` (composite primary key) | Foreign key to `routes(id)`, `ON DELETE CASCADE` |
| `user_id` | `uuid` | none | `NOT NULL` (composite primary key) | Foreign key to `auth.users(id)`, `ON DELETE CASCADE` |
| `created_at` | `timestamptz` | `NOW()` | Nullable | — |

Composite primary key: (`route_id`, `user_id`). Explicit indexes: `idx_route_likes_route_id` and `idx_route_likes_user_id`. There is no separate TypeScript row interface; stores synthesize `liked_by`, `like_count`, and `is_liked` on `Route`.

### `profiles`

Defined in `004_profiles.sql`.

| Column | PostgreSQL type | Default | Nullability | Key / relationship |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | none | `NOT NULL` (primary key) | Foreign key to `auth.users(id)`, `ON DELETE CASCADE` |
| `username` | `text` | none | `NOT NULL` | `UNIQUE` (implicit unique index) |
| `full_name` | `text` | none | Nullable | — |
| `avatar_url` | `text` | none | Nullable | — |
| `bio` | `text` | none | Nullable | — |
| `is_public` | `boolean` | `true` | Nullable | — |
| `created_at` | `timestamptz` | `NOW()` | Nullable | — |
| `updated_at` | `timestamptz` | `NOW()` | Nullable | — |

No additional explicit profiles index is defined. The primary key also enforces one profile per auth user.

### Functions, triggers, and timestamps

`001_initial_schema.sql` defines `update_updated_at_column()` and `BEFORE UPDATE` triggers for `walls` and `routes`; `004_profiles.sql` adds the profiles trigger. Defaults initialize timestamps, while browser/mobile/iOS mutation code also sends `updated_at` values on updates. `007_secure_route_view_rpc.sql` defines `public.increment_route_view(target_route_id uuid)`, a `SECURITY DEFINER` function that increments `view_count` only for a public target route and returns the resulting integer. `009_server_moderator_claim.sql` defines `public.is_moderator()` as a stable, security-definer check of signed `auth.jwt()` `app_metadata` claims.

## Row-level security and grants

RLS is enabled for `walls`, `routes`, and `ascents` in `001_initial_schema.sql`, for `comments` and `route_likes` in `002_social_features.sql`, and for `profiles` in `004_profiles.sql`. PostgreSQL policies are permissive within an operation: a row is allowed when any applicable policy passes. The following is the effective policy set after migrations 001–014; policies explicitly dropped by later migrations are not effective.

### `walls`

- **Select:** public rows (`is_public = true`), the caller's own rows (`auth.uid() = user_id`), or moderator rows (`public.is_moderator()` from `012_secure_insert_policies.sql`).
- **Insert:** `authenticated` callers only, with `auth.uid() = user_id` (`Authenticated users can insert own walls`). The earlier `Anyone can insert walls` policy is removed by migration 012.
- **Update:** owner rows (`Users can update their own walls`) or authenticated moderators (`Moderators can update walls`).
- **Delete:** owner rows (`Users can delete their own walls`) or authenticated moderators (`Moderators can delete walls`).

### `routes`

- **Select:** public rows (`is_public = true`), the caller's own rows (`auth.uid() = user_id`), or authenticated moderators (`Moderators can view routes`).
- **Insert:** `authenticated` callers only when `auth.uid() = user_id` (`Authenticated users can insert own routes`). The earlier anonymous insert policy is removed by migration 012.
- **Update:** owners (`Users can update their own routes`) or authenticated moderators (`Moderators can update routes`). The temporary public `view_count` update policy is removed by migration 007; public counters use `increment_route_view` instead.
- **Delete:** owners (`Users can delete their own routes`) or authenticated moderators (`Moderators can delete routes`).

`routes.wall_id` is a text link used by clients, not an enforced database relationship. The only route foreign keys are the child relationships listed below.

### Child rows: `ascents`, `comments`, and `route_likes`

Migration 012 replaces the earlier broad public/true-insert policies with an accessible-route predicate. For a child row to be accessible, an `EXISTS` query must find its referenced route and that route must be public, owned by the caller, or accessible to `public.is_moderator()`.

- **`ascents`:** select on an accessible route; authenticated insert when `auth.uid() = user_id` and the route is accessible; authenticated update/delete with the same owner-plus-accessible-route conditions. Authenticated moderators additionally have delete access (`Moderators can delete ascents`).
- **`comments`:** select on an accessible route; authenticated insert, update, and delete require `auth.uid() = user_id` plus an accessible route. Authenticated moderators additionally have update and delete access (`Moderators can update comments`, `Moderators can delete comments`).
- **`route_likes`:** select on an accessible route; authenticated insert requires `auth.uid() = user_id` plus an accessible route (`Users can like accessible routes`); authenticated delete requires the same ownership/access predicate (`Users can remove own likes on accessible routes`). There is no update policy.

Although `ascents.route_id` and `comments.route_id` are nullable in SQL, a null value cannot satisfy the final `EXISTS` predicate. Their `user_id` foreign keys are also nullable in SQL even though final client inserts are owner-scoped. `route_likes` primary-key columns are non-null by PostgreSQL primary-key semantics.

### `profiles`

- **Select:** public profiles (`is_public = true`) or the caller's own profile (`auth.uid() = id`).
- **Insert/update/delete:** the caller's own profile only (`auth.uid() = id`) through the policies in `004_profiles.sql`.
- No separate moderator profile policy is defined.

### Final PostgREST grants

`013_api_role_table_grants.sql` grants schema `USAGE`; grants `anon` `SELECT` only on `walls`, `routes`, `ascents`, `comments`, `route_likes`, and `profiles`; grants `authenticated` `SELECT, INSERT, UPDATE, DELETE` on all six tables; and grants `service_role` `ALL` on all six. It explicitly revokes anonymous writes. RLS remains the row authorization layer. `anon` and `authenticated` receive `EXECUTE` on `public.increment_route_view(uuid)` and `public.is_moderator()`; the functions themselves first revoke `PUBLIC` execution.

## Storage

The migrations create or upsert two public buckets:

- **`walls`** (`003_storage_policies.sql`, re-upserted by `014_backfill_storage_and_snapshots.sql`): public object reads. New authenticated writes are owner-prefixed: the first folder component must equal `auth.uid()::text` (`Owner-prefixed wall insert`, `Owner-prefixed wall update`, and `Owner-prefixed wall delete` from migration 008). The original public insert and broad authenticated delete policies are dropped by migration 008. Authenticated moderators can manage all `walls` objects (`Moderators can manage wall storage`). A separate moderator policy permits legacy wall paths with folder depth at most two (`Moderators can manage legacy wall storage`), preserving old `<wall-id>/<file>` objects for cleanup.
- **`avatars`** (`005_storage_avatars.sql`): public object reads; authenticated insert, update, and delete require bucket `avatars`, an authenticated role, and the first folder component equal to the caller's UUID (`avatars/<auth.uid()>/...`). The migration defensively attempts to enable RLS on `storage.objects` and handles insufficient privilege without changing the policy intent.

Application upload conventions match the current owner-prefix policy in the browser and mobile clients:

- Browser wall creation (`components/home/WallPickerDialog.tsx`): `${userId}/${wallId}/${Date.now()}.jpg`.
- Browser route snapshots (`lib/stores/routes-store.ts`): `${userId}/${sanitizedWallId}/route-${sanitizedRouteId}.${extension}`.
- Mobile wall uploads (`apps/mobile/lib/stores/walls-store.ts`): `${userId}/${wallId}/wall.${extension}`; mobile settings can also use `${userId}/${wallId}/${Date.now()}.jpg`.
- Mobile route snapshots (`apps/mobile/lib/stores/routes-store.ts`): `${userId}/${wallId}/route-${routeId}.${extension}`.
- Browser/mobile avatars: `${userId}/avatar-${Date.now()}.${extension}` in the `avatars` bucket.
- The older iOS view-model implementation (`apps/ios/ClimbSet/ViewModels/WallsViewModel.swift`) uploads walls as `<wall-id>/wall.jpg`, which is a legacy path shape and does not satisfy the current owner-prefix policy for a normal authenticated user. The alternate iOS wall view model writes a supplied URL directly.

## Patterns and client data access

### Shared domain models

`lib/types/index.ts` only re-exports `@climbset/shared/types`. The shared package defines percentage wall coordinates (`Hold.x`/`Hold.y`, 0–100), four hold types (`start`, `hand`, `foot`, `finish`), three sizes, hex colors, optional sequence/notes, `Ascent`, `Comment`, `Route`, `Wall`, and `Profile`. Browser/mobile models also expose joined/social fields such as `ascents`, `comments`, `wall`, `user`, `is_liked`, `like_count`, and `liked_by`. `holds` is serialized as a JSONB array in `routes`.

### Browser

`lib/supabase/client.ts` memoizes `createBrowserClient` using only the variable names `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It enables persisted sessions, token refresh, URL session detection, and storage key `climbset-auth`. `lib/supabase/server.ts` contains a cookie-backed `createServerClient` helper with the same two environment variable names, but no application source references it; the current web data path is client-side.

The Zustand stores query Supabase directly rather than through route handlers:

- `lib/stores/routes-store.ts` selects routes with `ascents` and `comments` (then falls back without comments), selects `route_likes` separately, filters by the current auth user through Supabase RLS, and performs route/ascents/comments/likes CRUD plus the `increment_route_view` RPC. It merges local/offline routes and uploads route wall snapshots when needed.
- `lib/stores/walls-store.ts` selects and performs CRUD on `walls`, retains a local `default-wall`, and merges public/owner-visible remote walls.
- `lib/stores/user-store.ts` owns Supabase sign-up, password login, logout, session events, profile select/upsert/update, and avatar upload. It derives the username from display name/email and a user-id prefix.

Persisted browser keys are `climbset-routes` (routes), `climbset-walls` (walls and selected wall), `climbset-user` (display name and profile), and `climbset-draft` (editor holds in `useHolds.ts`).

### Mobile

`apps/mobile/lib/supabase.ts` constructs the Supabase client from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, using AsyncStorage, `climbset-auth`, auto refresh, persisted sessions, and `detectSessionInUrl: false`. The mobile stores query the same six application tables directly, maintain UUID normalization and account-scoped offline queues, and use the same view-count RPC and storage buckets. Persisted AsyncStorage keys are `climbset-routes` (routes, pending routes/social rows, legacy ID map), `climbset-walls` (walls, selected wall, pending IDs/owners, legacy map), `climbset-wall` (selected wall compatibility key), and `climbset-user` (user/profile/auth display state). Editor drafts use per-user keys of the form `climbset-draft:<userId>`.

### iOS

The iOS app uses `apps/ios/ClimbSet/ClimbSet/Services/RoutesRepository.swift` for direct `routes`, `ascents`, `comments`, `route_likes`, and `walls` queries, with a mock repository fallback. Its route and hold models mirror the shared percentage-coordinate model. `WallsViewModel` and `CommentsViewModel` perform direct database/storage operations; `AppSession` performs Supabase auth and profile synchronization. Wall selection in the older view-model is persisted as `climbset.selectedWallId` in `UserDefaults`.

## Discrepancies and limits

- SQL foreign keys (`walls.user_id`, `routes.user_id`, child `user_id`, and nullable child `route_id`) allow nulls and use `SET NULL`/`CASCADE` as declared, while final RLS and client mutation code require authenticated ownership and accessible parent routes. TypeScript interfaces generally model these fields as required strings.
- `routes.rating` is nullable `NUMERIC(2,1)` without a range check; only `ascents.rating` has the SQL 1–5 check. The TypeScript comment describing route ratings as 1–5 is not enforced by SQL.
- `routes.holds` is required JSONB with default `[]`, but there is no JSON shape or hold-coordinate check. `image_width`, `image_height`, `wall_image_width`, and `wall_image_height` have no positive/range checks.
- `TODO.md` has stale profile-sync/avatar-upload and storage-policy TODOs even though `004_profiles.sql`, `005_storage_avatars.sql`, and the live stores implement them. `AGENTS.md` and `CODEX.md` separately contain a stale `app/api` route-handler inventory; no `app/api/**` handlers or imports of the server Supabase helper were found.
- The iOS `Info.plist` contains hardcoded `SUPABASE_URL` and `SUPABASE_ANON_KEY` values consumed by `SupabaseConfig.swift`; the values are intentionally not reproduced. The older iOS wall upload path also predates the current owner-prefixed storage policy, as noted above.
