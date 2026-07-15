// Hold types
export type HoldType = 'start' | 'hand' | 'foot' | 'finish';

// Hold type cycle order for tap-to-cycle on mobile
export const HOLD_TYPE_CYCLE: HoldType[] = ['hand', 'foot', 'start', 'finish'];
export type HoldSize = 'small' | 'medium' | 'large';

export interface Hold {
  id: string;
  x: number; // Percentage (0-100) relative to wall image
  y: number; // Percentage (0-100) relative to wall image
  type: HoldType;
  color: string; // Hex color
  sequence: number | null; // Optional sequence numbering
  size: HoldSize;
  notes?: string; // Optional per-hold notes
}

// Ascent - when someone climbs a route
export interface Ascent {
  id: string;
  route_id: string;
  user_id: string;
  user_name?: string;
  grade_v?: string; // User's suggested grade
  rating?: number; // User's rating (1-5)
  notes?: string;
  flashed?: boolean; // First try success
  created_at: string;
}

// Comment/Beta - user comments on routes
export interface Comment {
  id: string;
  route_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  is_beta: boolean; // True if this is beta/tips for the climb
  created_at: string;
}

// Route types
export interface Route {
  id: string;
  user_id: string;
  user_name?: string; // Setter's display name
  wall_id: string;
  wall_image_url?: string; // Snapshot of wall image at route creation (for history)
  wall_image_width?: number;
  wall_image_height?: number;
  name: string;
  description?: string;
  grade_v?: string; // V-scale (V0, V1, V2, etc.)
  grade_font?: string; // Font scale (4, 5a, 6b+, etc.)
  rating?: number; // 1-5 star rating
  holds: Hold[];
  is_public: boolean;
  view_count: number;
  share_token?: string;
  created_at: string;
  updated_at: string;
  // Ascent data
  ascents?: Ascent[];
  // Comments/Beta
  comments?: Comment[];
  // Joined data
  wall?: Wall;
  user?: Profile;
  is_liked?: boolean;
  like_count?: number;
  liked_by?: string[]; // Array of user IDs who liked this route
}

// Wall types
export interface Wall {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  image_url: string;
  image_width: number;
  image_height: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// User profile
export interface Profile {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Hold colors mapping
export const HOLD_COLORS: Record<HoldType, string> = {
  start: '#10b981',   // green
  hand: '#ef4444',    // red
  foot: '#3b82f6',    // blue
  finish: '#f59e0b',  // yellow
};

// Hold sizes mapping (as % of wall)
export const HOLD_SIZES: Record<HoldSize, string> = {
  small: '2.5%',
  medium: '4%',
  large: '7%',
};

// Hold border width mapping (in pixels)
export const HOLD_BORDER_WIDTH: Record<HoldSize, number> = {
  small: 2,     // Thin border
  medium: 3,    // Medium border
  large: 4,     // Thick border
};

// Grade options (V-scale)
export const V_GRADES = [
  'VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10',
  'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17'
];
