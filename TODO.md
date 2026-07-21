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
- [ ] Verify Pan-mode pinch/drag from both wall background and a hold with real multitouch input
- [ ] Verify live Supabase authentication and route, wall, and profile CRUD with the disposable account

## Checkpoint

- Latest integrated implementation: `7ff2f36`
- Web: dependency tree, ESLint, TypeScript, production build, and production route responses verified
- Native: 17 unit tests and 7 deterministic UI tests passed before final gesture arbitration review; after the review fixes, the 7 hold-geometry tests and the editor selected-hold pinch/isolation/save/reopen UI flow passed, and the simulator build succeeded
- Completion audit at `726308d`: dependency graph, ESLint, TypeScript, production build and route responses, 14 native unit tests, 7 deterministic UI tests, unsigned Release archive, and archived metadata all passed
- Remaining limitations: XCTest synthesized Pan pinches did not invoke the SwiftUI canvas callbacks, so Pan pinch/drag from the wall and from a hold still requires real multitouch verification; ordinary hold-move automation and live Supabase-backed auth/CRUD also remain unverified
- Next wave: grant the automation host macOS Accessibility access, verify Pan pinch/drag and hold-move persistence with real input, then exercise live auth/CRUD with disposable Supabase credentials
