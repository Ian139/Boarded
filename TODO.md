# TODO

## Convergence

- [x] Remove Expo workspace and dependencies
- [x] Establish shared SwiftUI design system
- [x] Converge routes presentation and selectors
- [x] Align editor and resize gestures
- [x] Port profile scoring and repository
- [x] Complete native Profile tab
- [x] Integrate lanes and resolve conflicts

## Verification

- [x] Verify web dependency graph
- [x] Verify native unit contracts
- [x] Verify native build and metadata
- [x] Verify full simulator interaction matrix
- [x] Verify final repository consistency

## Checkpoint

- Integrated implementation: `700749e`
- Web: dependency tree, ESLint, TypeScript, production build, and production route responses verified
- Native: 14 unit tests and 7 deterministic UI tests passed; simulator build, unsigned Release archive, metadata, launch, route/wall CRUD, profile edit and fixture-local auth, editor add/resize/save/reopen, settings, appearance, orientation, and deep-link handling verified
- Remaining limitations: ordinary hold-move automation is not covered; live Supabase-backed auth/CRUD was not exercised without dedicated test credentials
