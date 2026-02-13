# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cyberpunk-themed 3D portfolio built with React + Three.js (client) and Express (server). Opens to a flat browsable portfolio; an optional button launches a first-person 3D apartment where visitors walk (WASD + mouse) to glowing hotspot stations that display resume content.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (Express + Vite HMR) on port 5000 |
| `npm run build` | Production build (Vite client → `dist/public/`, esbuild server → `dist/index.cjs`) |
| `npm start` | Run production server |
| `npm run check` | TypeScript type checking (no tests configured) |
| `npm run db:push` | Apply Drizzle ORM migrations to PostgreSQL |

## Architecture

**Full-stack TypeScript**: React 18 client + Express 5 server, bundled by Vite (client) and esbuild (server).

### Client (`client/src/`)

- **Entry**: `main.tsx` → `App.tsx` (Wouter router) → `pages/CyberpunkPortfolio.tsx` (main page)
- **CyberpunkPortfolio.tsx**: Orchestrates everything — flat portfolio view, loading screen, 3D scene lifecycle, HUD overlays, and ResumePanel content display. State managed via React hooks; scene communicates back via callbacks (hotspot change, pointer lock, FPS).
- **`lib/cyberpunkScene.ts`**: The Three.js scene class. Owns renderer, camera, controls, lighting, post-processing (bloom/vignette/chromatic aberration), collision detection, hotspot raycasting, atmospheric effects (particles/rain), and the animation loop. This is the largest and most complex file.
- **`lib/assetLoader.ts`**: GLTFLoader wrapper with Draco/KTX2/meshopt decompression, caching, and progress callbacks. Also provides `createInstances()` and `setupLOD()` static helpers.
- **`lib/hotspots.ts`**: Defines `HOTSPOTS` array (position, radius, label, contentKey, color) and `COLLISION_BOXES` array (AABB min/max for walls/furniture).
- **`lib/qualitySettings.ts`**: Three quality tiers (Ultra/High/Low) controlling render scale, bloom, shadows, particles. Auto-detects GPU via WebGL renderer string. Photo Mode overrides to Ultra settings after 2s idle.
- **`lib/resumeData.ts`**: Static resume content consumed by ResumePanel.
- **`components/ui/`**: shadcn/ui components (Radix UI + Tailwind).

### Server (`server/`)

- `index.ts`: Express setup, middleware, session config
- `routes.ts`: API route registration (currently empty — ready for future endpoints)
- `vite.ts` / `static.ts`: Vite dev middleware or static file serving based on NODE_ENV

### Shared (`shared/`)

- `schema.ts`: Drizzle ORM schema (users table defined but not yet integrated)

## Key Patterns

**Adding a hotspot**: Add entry to `HOTSPOTS` in `hotspots.ts` → add `case` in ResumePanel switch in `CyberpunkPortfolio.tsx` → optionally add collision boxes to `COLLISION_BOXES`.

**Loading custom 3D models**: Export from Blender as `.glb` → compress with Draco/KTX2 (see `docs/asset-pipeline.md`) → place in `client/public/models/` → load via `this.assetLoader.loadGLB("/models/file.glb")` in `cyberpunkScene.ts`.

**Collision system**: AABB-based. Player has radius 0.35, height 1.7. Movement uses velocity with acceleration/deceleration. Update `COLLISION_BOXES` when adding geometry.

**Performance**: Instanced meshes for repeated geometry (city windows use 3 batches by color). Shadow casters capped per quality tier. Particle counts scale with tier. Always compress assets with Draco + KTX2.

**Path aliases**: `@/*` → `client/src/*`, `@shared/*` → `shared/*` (configured in `vite.config.ts` and `tsconfig.json`).

## Styling

Cyberpunk palette: cyan `#05D9E8`, hot pink `#FF2A6D`, amber `#FFB86C`, purple `#7B2FBE`, dark navy `#0A0E27`. Fonts: Orbitron (headers), Rajdhani (UI), Share Tech Mono (terminal). Tailwind CSS with inline neon glow styles.

## Deployment

Configured for Replit (Node.js 20 + PostgreSQL 16). Port 5000 mapped to 80. Decoder WASM files (`/draco/`, `/basis/`) served from `client/public/`.
