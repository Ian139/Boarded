-- ClimbSet Database Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Walls table
CREATE TABLE IF NOT EXISTS walls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  image_width INTEGER DEFAULT 1920,
  image_height INTEGER DEFAULT 1080,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Routes table (wall_id is optional to allow local-only walls)
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  wall_id TEXT NOT NULL, -- Using TEXT to allow local wall IDs like 'default-wall'
  name TEXT NOT NULL,
  description TEXT,
  grade_v TEXT,
  grade_font TEXT,
  rating NUMERIC(2,1),
  holds JSONB NOT NULL DEFAULT '[]',
  is_public BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ascents table (when someone climbs a route)
CREATE TABLE IF NOT EXISTS ascents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  grade_v TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  flashed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_wall_id ON routes(wall_id);
CREATE INDEX IF NOT EXISTS idx_routes_user_id ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_is_public ON routes(is_public);
CREATE INDEX IF NOT EXISTS idx_ascents_route_id ON ascents(route_id);
CREATE INDEX IF NOT EXISTS idx_ascents_user_id ON ascents(user_id);
CREATE INDEX IF NOT EXISTS idx_walls_is_public ON walls(is_public);

-- Row Level Security (RLS)
ALTER TABLE walls ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ascents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- WALLS POLICIES
-- ============================================

-- Anyone can view public walls
CREATE POLICY "Public walls are viewable by everyone" ON walls
  FOR SELECT USING (is_public = true);

-- Users can view their own walls
CREATE POLICY "Users can view their own walls" ON walls
  FOR SELECT USING (auth.uid() = user_id);

-- Anyone can insert walls (for anonymous users)
CREATE POLICY "Anyone can insert walls" ON walls
  FOR INSERT WITH CHECK (true);

-- Users can update their own walls
CREATE POLICY "Users can update their own walls" ON walls
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own walls
CREATE POLICY "Users can delete their own walls" ON walls
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ROUTES POLICIES
-- ============================================

-- Anyone can view public routes
CREATE POLICY "Public routes are viewable by everyone" ON routes
  FOR SELECT USING (is_public = true);

-- Users can view their own routes
CREATE POLICY "Users can view their own routes" ON routes
  FOR SELECT USING (auth.uid() = user_id);

-- Anyone can insert routes (for anonymous users)
CREATE POLICY "Anyone can insert routes" ON routes
  FOR INSERT WITH CHECK (true);

-- Users can update their own routes
CREATE POLICY "Users can update their own routes" ON routes
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own routes
CREATE POLICY "Users can delete their own routes" ON routes
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ASCENTS POLICIES
-- ============================================

-- Anyone can view ascents
CREATE POLICY "Ascents are viewable by everyone" ON ascents
  FOR SELECT USING (true);

-- Anyone can insert ascents
CREATE POLICY "Anyone can insert ascents" ON ascents
  FOR INSERT WITH CHECK (true);

-- Users can update their own ascents
CREATE POLICY "Users can update their own ascents" ON ascents
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own ascents
CREATE POLICY "Users can delete their own ascents" ON ascents
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_walls_updated_at ON walls;
CREATE TRIGGER update_walls_updated_at
  BEFORE UPDATE ON walls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routes_updated_at ON routes;
CREATE TRIGGER update_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Supabase API roles need table privileges; RLS below controls row access.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE walls, routes, ascents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE walls, routes, ascents TO authenticated;
GRANT ALL ON TABLE walls, routes, ascents TO service_role;
