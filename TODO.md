# TODO

## Sync
- [ ] Apply Supabase migrations for profiles + avatars (`004_profiles.sql`, `005_storage_avatars.sql`).
- [x] Create `avatars` storage bucket in migration (`005_storage_avatars.sql`).
- [ ] Define data contract for climber profiles (fields, ownership, auth rules).
- [ ] Implement profile sync between mobile and web (Supabase profiles table + local cache).
- [ ] Add avatar upload + storage bucket policy for profile images.
- [ ] Implement wall image sync (upload, list, and download with caching + offline fallback).
- [ ] Add progress/error states for sync flows and retry/backoff.

## Routes Page Improvements
- [x] Fix mobile route tap to open a route viewer modal.
- [x] Show comments and beta messages in the mobile route viewer.
- [x] Add actions in mobile route viewer: like, log send, share.
- [x] Add comment/beta composer on mobile route viewer.
- [x] Add rating stars UI on mobile.
- [x] Use native share sheet for sharing links.
- [x] Add filters for wall, grade range, and setter.
- [x] Add sort options (newest, highest rated, most climbed).
- [ ] Add route card details: wall thumbnail, hold counts, grade confidence.
- [ ] Add quick actions: like, log ascent, share, edit (permission aware).
- [ ] Add empty states + loading skeletons.

## Tech Debt / Testing
- [ ] Add tests for sync flows (mock Supabase + offline mode).
- [ ] Add UI snapshot coverage for new route cards and filters.
