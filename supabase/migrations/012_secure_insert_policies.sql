-- Replace legacy WITH CHECK (true) inserts with owner-scoped policies.
-- Child rows are restricted to routes the caller can actually access.

DROP POLICY IF EXISTS "Anyone can insert walls" ON walls;
DROP POLICY IF EXISTS "Anyone can insert routes" ON routes;
DROP POLICY IF EXISTS "Anyone can insert comments" ON comments;
DROP POLICY IF EXISTS "Anyone can insert ascents" ON ascents;

CREATE POLICY "Authenticated users can insert own walls" ON walls
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert own routes" ON routes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
CREATE POLICY "Comments are viewable on accessible routes" ON comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = comments.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Authenticated users can insert comments on accessible routes" ON comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = comments.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Users can update own comments on accessible routes" ON comments
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = comments.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = comments.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Users can delete own comments on accessible routes" ON comments
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = comments.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );

DROP POLICY IF EXISTS "Ascents are viewable by everyone" ON ascents;
DROP POLICY IF EXISTS "Users can update their own ascents" ON ascents;
DROP POLICY IF EXISTS "Users can delete their own ascents" ON ascents;
CREATE POLICY "Ascents are viewable on accessible routes" ON ascents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = ascents.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Authenticated users can insert ascents on accessible routes" ON ascents
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = ascents.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Users can update own ascents on accessible routes" ON ascents
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = ascents.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = ascents.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Users can delete own ascents on accessible routes" ON ascents
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = ascents.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON route_likes;
DROP POLICY IF EXISTS "Users can like routes" ON route_likes;
DROP POLICY IF EXISTS "Users can remove their own likes" ON route_likes;
CREATE POLICY "Likes are viewable on accessible routes" ON route_likes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = route_likes.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Users can like accessible routes" ON route_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = route_likes.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );
CREATE POLICY "Users can remove own likes on accessible routes" ON route_likes
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM routes
      WHERE routes.id = route_likes.route_id
        AND (
          routes.is_public = true
          OR routes.user_id = auth.uid()
          OR public.is_moderator()
        )
    )
  );


-- Moderators need read access for their management actions and child-row joins.
DROP POLICY IF EXISTS "Moderators can view routes" ON routes;
CREATE POLICY "Moderators can view routes" ON routes
  FOR SELECT TO authenticated
  USING (public.is_moderator());
DROP POLICY IF EXISTS "Moderators can view walls" ON walls;
CREATE POLICY "Moderators can view walls" ON walls
  FOR SELECT TO authenticated
  USING (public.is_moderator());