# QA Checklist

## Profiles Sync
- [ ] Sign up on web, confirm `profiles` row is created with username and full_name.
- [ ] Log in on mobile, confirm profile is fetched and rendered.
- [ ] Update display name on web, confirm profile `full_name` updates.
- [ ] Upload avatar on web, confirm `avatars` bucket path and `avatar_url` save.

## Wall Images Sync
- [ ] Create/upload a wall on web and confirm it appears in the walls list after refresh.
- [ ] Confirm mobile `fetchWalls` pulls the same wall list.
- [ ] Delete a wall on web and confirm mobile list updates after refresh.
- [ ] Verify offline mode retains cached walls on mobile.

## Routes Page Features
- [ ] Confirm sort options (Most Liked / Most Climbed / Most Viewed) work.
- [ ] Confirm wall thumbnails show on route cards.
- [ ] Confirm wall name renders consistently for routes.
- [ ] Confirm empty states still render for search and filters.

## Regression Checks
- [ ] No auth regression in web login/signup flows.
- [ ] No crashes on mobile auth screens when offline.
- [ ] Route list interactions still open route view dialogs on web.
