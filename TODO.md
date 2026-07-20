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
- [ ] Verify full simulator interaction matrix (blocked: `osascript`/System Events lacks macOS Accessibility permission for automated taps)
- [x] Verify final repository consistency

## Checkpoint

- Integrated implementation: `43c7c8b`
- Web: dependency tree, ESLint, TypeScript, production build, and production route responses verified
- Native: 14 unit tests passed; simulator build, unsigned device archive, metadata, launch, and invalid deep-link alert verified
- Remaining limitation: authenticated route/editor/profile CRUD and gesture interactions still require an interactive simulator pass
- Next: grant Privacy & Security → Accessibility access to the automation host, then run the full simulator matrix
