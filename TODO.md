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
- [x] Replace selected-hold editing with tap cycling, hold-only pinch resize, and immutable hold positions

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
- [ ] Verify background-canvas pan and zoom with real multitouch input in Pan and add modes
- [ ] Verify live Supabase authentication and route, wall, and profile CRUD with the disposable account

## Checkpoint

- Latest integrated implementation: `0a12f7e`
- Editor interaction checkpoint: existing holds cycle Start → Hand → Foot → Finish → delete on tap; marker pinch changes only that hold radius; one-finger marker drag cannot change hold coordinates; background transforms remain available without leaving add mode.
- Removed residue: `BoardedLogo-Transparent.png`; dead `lib/supabase/server.ts`, Card, DropdownMenu, FilterChip, and duplicate native ViewModels; web compatibility re-exports; shared root/IDs barrels; `@tanstack/react-query` and `@radix-ui/react-dropdown-menu`.
- Repaired contracts: one auth-owned startup reconciliation; paginated, preview-safe moderator Storage cleanup; canonical web/native grades; normalized web route ingress; native route snapshot dimensions and atomic nullable wall patches; shared route-detail image/marker geometry; owner-prefixed lowercase native upload keys; row-only wall deletion.
- Web gates: `npm ls --all --workspaces --include-workspace-root`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and production HTTP smoke passed. Brave rendered, searched, and filtered a persisted numeric `grade_v: 0` route as `V0`; startup issued one routes request and one walls request; the Radix Select resolved `animation-name: enter` at `0.15s`.
- Focused web contracts: 15 Node tests across 6 suites passed for grade normalization/calculation and Storage URL/layout/preview intersection behavior.
- Native gates: 28 unit tests and all 7 deterministic UI flows passed on simulator `9A8AC026-CF18-4FF9-98A5-48F47BAA0244`. The editor flow verifies tap cycling/deletion, add-mode retention, isolated marker pinch resizing, immutable marker coordinates under drag, and save/reopen radius/position persistence. Debug build and unsigned Release archive previously passed with no changed-source warnings.
- Local Supabase gate: the extended ownership harness passed against the disposable local stack. Owner-prefixed Storage upload succeeded; non-owner and legacy-prefix uploads were rejected without metadata or objects; route ownership and fixture cleanup also passed.
- Remaining limitations: XCTest did not reliably synthesize background-canvas pinch and cannot prove observable wall displacement from marker-origin drag, so those remain real-input checks. Live remote Supabase authentication and route/wall/profile CRUD still require disposable account credentials. Local fixture/unit/model/path checks are not substitutes.
- Next wave: verify background-canvas multitouch zoom and marker-origin pointer panning with real input, then exercise live remote auth/CRUD with the disposable account.
