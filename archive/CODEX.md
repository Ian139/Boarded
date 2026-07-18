# CODEX.md

This file provides guidance to Codex (OpenAI) when working with code in this repository.

## Project Overview

A modern full-stack climbing route setter application built with Next.js, React, TypeScript, and Supabase. Users can place color-coded holds on climbing wall images, save routes with metadata (grades, descriptions), and share routes via URLs. Features user authentication, cloud sync, and social features (likes, comments).

## Running the Application

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
# Navigate to http://localhost:3000

# Build for production
npm run build

# Start production server
npm start
```

## Technology Stack

- **Frontend**: Next.js 14 (App Router) + React + TypeScript + TailwindCSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Supabase (PostgreSQL + Authentication + Storage)
- **UI Components**: shadcn/ui (accessible, customizable components)
- **State Management**: React Context + TanStack Query for server state
- **Deployment**: Vercel (optimized for Next.js)

## Architecture

### Project Structure

```
climbing-app-next/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group (login, signup)
│   ├── (dashboard)/              # Protected routes (editor, dashboard, walls, profile)
│   ├── share/[token]/            # Public route viewer
│   ├── api/                      # API routes (routes, walls, upload, share)
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles + Tailwind
├── components/                   # React components
│   ├── wall/                     # Wall canvas and hold components
│   ├── route/                    # Route cards, lists, forms
│   ├── ui/                       # shadcn/ui components
│   └── shared/                   # Navbar, sidebar, etc.
├── lib/
│   ├── supabase/                 # Supabase clients (browser, server, middleware)
│   ├── hooks/                    # Custom React hooks
│   ├── utils/                    # Utility functions (holds, grades, images)
│   └── types/                    # Shared TypeScript types
├── public/
│   └── walls/                    # Wall images (default-wall.jpg)
└── CODEX.md                      # This file
```

### Data Models

**TypeScript Types** (see `lib/types/index.ts`):
```typescript
type HoldType = 'start' | 'hand' | 'foot' | 'finish';
type HoldSize = 'small' | 'medium' | 'large';

interface Hold {
  id: string;
  x: number;        // Percentage (0-100)
  y: number;        // Percentage (0-100)
  type: HoldType;
  color: string;    // Hex color
  sequence: number | null;
  size: HoldSize;
  notes?: string;
}

interface Route {
  id: string;
  user_id: string;
  wall_id: string;
  name: string;
  description?: string;
  grade_v?: string;      // V-scale (V0, V1, etc.)
  grade_font?: string;   // Font scale (4, 5a, 6b+, etc.)
  holds: Hold[];
  is_public: boolean;
  view_count: number;
  share_token?: string;
  created_at: string;
  updated_at: string;
}
```

**Database Schema** (Supabase PostgreSQL):
- `profiles` - User profiles (extends Supabase auth.users)
- `walls` - Climbing wall images and metadata
- `routes` - Saved climbing routes with holds
- `route_likes` - Like/favorite system

See implementation plan at `/Users/ian/.claude/plans/jazzy-splashing-lynx.md` for full schema.

### Core Features

**1. Hold System:**
- 4 hold types: start (green), hand (red), foot (blue), finish (yellow)
- Customizable colors and sizes
- Sequence numbering (optional)
- Click to place, right-click to delete
- Keyboard shortcuts (1-4 for hold types)

**2. Route Management:**
- Save routes with metadata (name, grade, description, tags)
- Load and edit existing routes
- Delete routes with confirmation
- Filter by wall, grade, or date

**3. Wall Management:**
- Upload custom wall images (Supabase Storage)
- Multiple wall support
- Wall selection in editor

**4. Sharing:**
- Generate shareable URLs (`/share/[token]`)
- View-only mode for shared routes
- QR code generation
- Export/import as JSON
- Copy to clipboard

**5. Authentication:**
- Email/password authentication (Supabase Auth)
- Protected routes with middleware
- User profiles

**6. Social Features:**
- Like/favorite routes
- View counters
- Public route discovery
- User profiles

### API Routes

**Route Endpoints:**
- `GET /api/routes` - List routes (with filters)
- `POST /api/routes` - Create route
- `GET /api/routes/[id]` - Get single route
- `PUT /api/routes/[id]` - Update route
- `DELETE /api/routes/[id]` - Delete route

**Wall Endpoints:**
- `GET /api/walls` - List walls
- `POST /api/walls` - Create wall
- `GET /api/walls/[id]` - Get single wall
- `PUT /api/walls/[id]` - Update wall
- `DELETE /api/walls/[id]` - Delete wall

**Other Endpoints:**
- `POST /api/upload` - Upload wall images
- `GET /api/share/[token]` - Get shared route
- `POST /api/routes/[id]/like` - Like/unlike route

## Development Workflow

### Setting Up Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Run database schema from implementation plan
3. Enable email authentication in Auth settings
4. Create storage bucket named `walls` for wall images
5. Add site URL to auth settings (http://localhost:3000 for dev)
6. Get API keys from Settings > API
7. Add keys to `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

### Common Tasks

**Add a new shadcn/ui component:**
```bash
npx shadcn@latest add [component-name]
```

**Create a new API route:**
1. Create file in `app/api/[name]/route.ts`
2. Export GET, POST, PUT, DELETE functions as needed
3. Use `@/lib/supabase/server` for database access
4. Handle auth with middleware or manual checks

**Add a new hold type:**
1. Update `HoldType` in `lib/types/index.ts`
2. Add color to `HOLD_COLORS` in hold utilities
3. Update `HoldTypeSelector` component
4. Update keyboard shortcuts if needed

**Create a new page:**
1. Create folder in `app/` with `page.tsx`
2. Add to navigation in `components/shared/Navbar.tsx`
3. Add auth protection if needed (use `(dashboard)` route group)

### Testing Locally

**Without Supabase:**
- Landing page and UI components work
- Editor works but can't save routes
- Mock data can be used for development

**With Supabase:**
- Full functionality including auth, save/load, sharing
- Requires valid Supabase credentials in `.env.local`

## Key Implementation Details

**Hold Coordinate System:**
- Holds stored as percentages (0-100) of wall dimensions
- Converted to pixels for rendering based on current wall size
- Responsive to window resizing

**Hold Colors:**
```typescript
const HOLD_COLORS = {
  start: '#10b981',   // green
  hand: '#ef4444',    // red
  foot: '#3b82f6',    // blue
  finish: '#f59e0b',  // yellow
};
```

**Authentication Flow:**
1. User signs up/logs in via Supabase Auth
2. Session stored in cookie by Supabase SSR
3. Middleware checks auth on protected routes
4. Client reads session from Supabase client

**Image Upload:**
1. User selects image file
2. Frontend validates size/format
3. POST to `/api/upload` with multipart form data
4. Backend uploads to Supabase Storage
5. Returns public URL
6. URL stored in database with wall metadata

**Share Token Generation:**
```typescript
import { nanoid } from 'nanoid';
const shareToken = nanoid(10); // Short, URL-safe token
```

## Environment Variables

Required variables in `.env.local`:

```bash
# Supabase (required for all features)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App URL (for redirects, share links)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: Analytics
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Add environment variables in Vercel settings
4. Deploy automatically on main branch push
5. Update Supabase Auth settings with production URL

### Supabase Configuration for Production

1. Add production URL to Supabase Auth > URL Configuration
2. Enable email confirmations in Auth > Email Templates
3. Configure custom SMTP (optional) for emails
4. Set up storage bucket CORS if needed

## Migration from Original App

The original vanilla JS app stored data in localStorage. To migrate:

1. User signs up for account in new app
2. Navigate to `/migrate` page (create if needed)
3. Script reads old localStorage data
4. Converts to new format (simple {x,y} → full Hold objects)
5. Uploads to Supabase via API
6. Downloads backup JSON before clearing old data

Migration logic handles:
- Converting pixel coordinates to percentages
- Adding default hold types (all as 'hand')
- Creating default wall with original wall.jpg
- Preserving route names

## Troubleshooting

**Supabase connection fails:**
- Check API keys in `.env.local`
- Verify Supabase project is active
- Check browser console for CORS errors
- Verify site URL in Supabase Auth settings

**Images not loading:**
- Check Supabase Storage bucket exists and is public
- Verify image URLs are correct
- Check file size limits (recommend max 5MB)

**Auth not working:**
- Clear cookies and try again
- Check Supabase Auth is enabled
- Verify email templates are configured
- Check middleware is running on protected routes

**Holds not appearing:**
- Check wall image dimensions are set correctly
- Verify coordinates are percentages (0-100), not pixels
- Check z-index of hold markers
- Inspect element to see if holds are rendering but hidden

## Git Repository

- Remote: https://github.com/Ian139/ClimbingApp.git
- Current branch: main
- Original vanilla JS app: Parent directory (`../`)

## Implementation Plan

Detailed implementation plan with phases, tasks, and verification checklists:
`/Users/ian/.claude/plans/jazzy-splashing-lynx.md`

## Dependencies

Key packages and their purposes:

- `next` - React framework with SSR and routing
- `react`, `react-dom` - UI library
- `typescript` - Type safety
- `tailwindcss` - Utility-first CSS
- `@supabase/supabase-js` - Supabase client
- `@supabase/ssr` - Supabase SSR helpers
- `@tanstack/react-query` - Server state management
- `shadcn/ui` - UI component library
- `nanoid` - ID and token generation
- `zustand` - Client state management
- `lucide-react` - Icon library
