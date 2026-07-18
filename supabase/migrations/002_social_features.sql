-- Social features (comments, likes) + view count policy

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  content TEXT NOT NULL,
  is_beta BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Route likes table
CREATE TABLE IF NOT EXISTS route_likes (
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (route_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comments_route_id ON comments(route_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_route_likes_route_id ON route_likes(route_id);
CREATE INDEX IF NOT EXISTS idx_route_likes_user_id ON route_likes(user_id);

-- Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_likes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- COMMENTS POLICIES
-- ============================================

-- Anyone can view comments
CREATE POLICY "Comments are viewable by everyone" ON comments
  FOR SELECT USING (true);

-- Anyone can insert comments
CREATE POLICY "Anyone can insert comments" ON comments
  FOR INSERT WITH CHECK (true);

-- Users can update their own comments
CREATE POLICY "Users can update their own comments" ON comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments" ON comments
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ROUTE LIKES POLICIES
-- ============================================

-- Anyone can view likes
CREATE POLICY "Likes are viewable by everyone" ON route_likes
  FOR SELECT USING (true);

-- Authenticated users can like a route
CREATE POLICY "Users can like routes" ON route_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove their own likes
CREATE POLICY "Users can remove their own likes" ON route_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ROUTES POLICY FOR VIEW COUNT
-- ============================================

-- Allow updating public routes to increment view_count
CREATE POLICY "Public routes can update view_count" ON routes
  FOR UPDATE USING (is_public = true) WITH CHECK (is_public = true);

GRANT SELECT ON TABLE comments, route_likes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comments, route_likes TO authenticated;
GRANT ALL ON TABLE comments, route_likes TO service_role;
