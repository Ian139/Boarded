# TODO

## Convergence

- [x] Remove Expo workspace and dependencies
- [x] Establish shared SwiftUI design system
- [x] Converge routes presentation and selectors
- [x] Align editor and resize gestures
- [x] Port profile scoring and repository
- [x] Complete native Profile tab
- [x] Integrate lanes and resolve conflicts

## Product UX

- [x] Replace route filter and sort chips with mobile-friendly dropdowns or equivalent compact controls
- [x] Remove redundant Profile navigation banner
- [x] Separate selected-hold pinch resizing from Pan canvas transforms
- [x] Infer editor interactions from touch location with no Pan or hold-type selectors

## Verification

- [x] Verify web dependency graph
- [x] Verify native unit contracts
- [x] Verify native build and metadata
- [ ] Verify full simulator interaction matrix (blocked: XCTest cannot prove observable marker-origin wall panning or synthesize reliable background-canvas multitouch pinch)
- [x] Verify final repository consistency

## External Verification Backlog

- [ ] Grant the OMP/Ghostty automation host macOS Accessibility access and restart it if required
- [ ] Create `/tmp/climbset-test-credentials` with disposable `CLIMBSET_TEST_EMAIL` and `CLIMBSET_TEST_PASSWORD` values
- [ ] Verify marker-origin one-finger wall panning and immutable saved hold positions with a real Simulator pointer
- [ ] Verify inferred background-canvas pan and zoom with real multitouch input
- [x] Deploy migration `015_repair_route_snapshot_dimensions.sql` and verify live PostgREST route insert/select
- [ ] Verify live Supabase authentication and route, wall, and profile CRUD with the disposable account

## Checkpoint

- Latest integrated implementation: `61ac317`
- Editor interaction checkpoint: empty-wall taps place Start holds; hold taps cycle Start → Hand → Foot → Finish → delete; marker pinch resizes only that hold; background pinch is routed to wall zoom; one-finger drag routes to wall panning without moving hold coordinates. The canvas now fills the editor body and exposes an accessibility activation that adds a centered Start hold.
- Schema repair checkpoint: migration 015 idempotently reasserts nullable integer route snapshot dimensions, backfills matching wall geometry, and explicitly reloads PostgREST. Local and live REST checks insert and read both dimensions successfully.
- Removed residue: `BoardedLogo-Transparent.png`; dead `lib/supabase/server.ts`, Card, DropdownMenu, FilterChip, and duplicate native ViewModels; web compatibility re-exports; shared root/IDs barrels; `@tanstack/react-query` and `@radix-ui/react-dropdown-menu`.
- Repaired contracts: one auth-owned startup reconciliation; paginated, preview-safe moderator Storage cleanup; canonical web/native grades; normalized web route ingress; native route snapshot dimensions and atomic nullable wall patches; shared route-detail image/marker geometry; owner-prefixed lowercase native upload keys; row-only wall deletion.
- Web gates: `npm ls --all --workspaces --include-workspace-root`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and production HTTP smoke passed. Brave rendered, searched, and filtered a persisted numeric `grade_v: 0` route as `V0`; startup issued one routes request and one walls request; the Radix Select resolved `animation-name: enter` at `0.15s`.
- Focused web contracts: 15 Node tests across 6 suites passed for grade normalization/calculation and Storage URL/layout/preview intersection behavior.
- Native gates: 29 unit tests and all 7 deterministic UI flows passed on final simulator state `9A8AC026-CF18-4FF9-98A5-48F47BAA0244`. The editor flow verifies removal of explicit selectors, inferred Start placement, tap cycling/deletion, marker-pinch zoom isolation, immutable marker coordinates under drag, and save/reopen type/radius/position persistence. Debug build and unsigned Release archive previously passed with no changed-source warnings.
- Local Supabase gate: the extended ownership harness passed against the disposable local stack. Owner-prefixed Storage upload succeeded; authenticated route insert/read preserved `wall_image_width` and `wall_image_height`; non-owner and legacy-prefix uploads were rejected; route ownership and fixture cleanup passed.
- Remaining limitations: XCTest cannot prove background-canvas multitouch zoom or observable marker-origin wall displacement. Full live authentication plus wall/profile CRUD still requires disposable user credentials; the route schema and service-role insert/select path are verified.
- Next wave: complete real-input gesture checks, then exercise live authentication and wall/profile CRUD with disposable credentials.
