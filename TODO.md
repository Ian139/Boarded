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

## Verification

- [x] Verify web dependency graph
- [x] Verify native unit contracts
- [x] Verify native build and metadata
- [ ] Verify full simulator interaction matrix (blocked: XCTest press/drag synthesis does not move the hold marker, and the automation host lacks macOS Accessibility permission for real-pointer fallback)
- [x] Verify final repository consistency

## External Verification Backlog

- [ ] Grant the OMP/Ghostty automation host macOS Accessibility access and restart it if required
- [ ] Create `/tmp/climbset-test-credentials` with disposable `CLIMBSET_TEST_EMAIL` and `CLIMBSET_TEST_PASSWORD` values
- [ ] Verify ordinary hold movement and saved position persistence with a real Simulator pointer drag
- [ ] Verify live Supabase authentication and route, wall, and profile CRUD with the disposable account

## Checkpoint

- Integrated implementation: `e7388fb`
- Web: dependency tree, ESLint, TypeScript, production build, and production route responses verified
- Native: 14 unit tests and 7 deterministic UI tests passed; simulator build, unsigned Release archive, metadata, launch, compact route wall/grade/sort menus, route/wall CRUD, profile edit and fixture-local auth, editor add/resize/save/reopen, settings, appearance, orientation, and deep-link handling verified
- Completion audit at `726308d`: dependency graph, ESLint, TypeScript, production build and route responses, 14 native unit tests, 7 deterministic UI tests, unsigned Release archive, and archived metadata all passed
- Remaining limitations: ordinary hold-move automation is not covered; live Supabase-backed auth/CRUD was not exercised without dedicated test credentials
- Next wave: grant the automation host macOS Accessibility access, verify hold-move and persistence with a real pointer drag, then exercise live auth/CRUD with disposable Supabase credentials
