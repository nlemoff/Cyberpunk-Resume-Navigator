# Nick Lemoff - 3D Cyberpunk Portfolio

## Overview
A cyberpunk-themed portfolio site for Nick Lemoff. Opens to a flat, browsable portfolio view by default. An optional "ENTER 3D APARTMENT" button launches an immersive Three.js experience where visitors navigate through a cyberpunk apartment using WASD and mouse controls to explore resume content as interactive 3D visualizations.

## Architecture
- **Frontend-only application** - No database needed, resume data is static
- **Three.js** for 3D rendering with first-person controls (desktop only, optional)
- **React** for portfolio view, HUD overlay, resume panels, loading screen
- **Wouter** for routing (single page)

## Flow
1. Site opens to **PortfolioView** - flat cyberpunk-styled portfolio with nav tabs
2. User browses About, Experience, Skills, Projects, Education sections
3. Optional: Click "ENTER 3D APARTMENT" to launch 3D mode (desktop only)
4. Loading screen with staged progress bar -> 3D apartment experience
5. Walk near hotspots to trigger HTML resume panels (proximity + forward raycast)
6. Stand still 2s → Photo Mode auto-activates (enhanced bloom, vignette, full render scale)
7. "EXIT APARTMENT" button returns to flat portfolio
8. If WebGL unavailable, 3D buttons are disabled with "3D UNAVAILABLE" label
9. Loading timeout (30s) shows fallback with "ENTER ANYWAY" or "BACK TO PORTFOLIO"

## Key Files
- `client/src/lib/cyberpunkScene.ts` - Core Three.js scene with apartment, cityscape, lighting, controls, collision, hotspot detection, GLB loading, photo mode
- `client/src/lib/assetLoader.ts` - Asset loader abstraction with GLTFLoader + DRACOLoader + KTX2Loader + MeshoptDecoder, caching, instancing, LOD helpers
- `client/src/lib/hotspots.ts` - Hotspot definitions (positions, radii, labels, content keys) and collision box AABBs
- `client/src/lib/qualitySettings.ts` - Quality tier definitions (Ultra/High/Low) with GPU auto-detect and Photo Mode config
- `client/src/lib/resumeData.ts` - Static resume data from nlemoff.com
- `client/src/pages/CyberpunkPortfolio.tsx` - Main page with portfolio view, loading screen, HUD, resume panels, minimap, settings overlay, photo mode indicator
- `client/src/App.tsx` - Router setup
- `docs/asset-pipeline.md` - Recommended offline asset pipeline (Blender → glTF → compression)
- `scripts/generate-sample-glb.mjs` - Script to generate sample-room.glb placeholder mesh
- `README.md` - How to run, add rooms/hotspots, performance tips

## Design
- **Colors**: Hot Pink (#FF2A6D), Cyan (#05D9E8), Deep Blue (#01012B), Dark Navy (#0A0E27), Electric White (#D1F7FF), Amber (#FFB86C), Purple (#7B2FBE)
- **Fonts**: Orbitron (headings), Rajdhani (body), Share Tech Mono (code/labels)
- **Theme**: Cyberpunk 2077 inspired with neon lighting and dark backgrounds

## 3D Systems
- **Movement**: Acceleration-based WASD + mouse look, sprint (Shift), head bob, smooth deceleration (exp decay, DECEL_RATE=18)
- **Collision**: Capsule (circle in XZ, PLAYER_RADIUS=0.35) vs AABB boxes for walls and furniture, slide-along-wall response
- **Hotspots**: 5 proximity-triggered zones defined in hotspots.ts, detected via XZ distance + forward raycast, emitted to React via onHotspotChange callback
- **Postprocessing**: EffectComposer with UnrealBloomPass, vignette, chromatic aberration, OutputPass; quality-tier controlled; passes disabled on Low
- **Quality**: Ultra/High/Low tiers controlling render scale, bloom, vignette, shadows, particles; GPU auto-detect + localStorage persistence
- **Photo Mode**: Auto-activates after 2s idle (not on Low tier); boosts bloom to 1.5, renderScale to 1.0, vignette to 0.6; reverts on movement
- **Asset Loading**: AssetLoader wraps GLTFLoader with Draco, KTX2/Basis, and meshopt decoder support; decoder WASM files served from client/public/draco/ and client/public/basis/
- **Instancing**: City windows use InstancedMesh grouped by color (3 draw calls instead of thousands); AssetLoader.createInstances() helper for GLB props
- **LOD**: AssetLoader.setupLOD() helper available for distance-based level-of-detail switching
- **Shadow Casters**: Limited per quality tier (Ultra: 2, High: 1, Low: 0) via shadowCastingLights array

## Features
- Flat portfolio with tabbed navigation (default view)
- First-person WASD + mouse navigation with sprint and head bob
- Capsule collision preventing walking through walls/furniture
- 5 interactive resume hotspots with proximity + raycast detection
- Resume content shown in crisp HTML overlay panels
- Holographic floating labels above stations
- Animated neon lighting with bloom-aware emissive materials
- Rain effect, floating particles, cityscape with flickering instanced windows
- HUD overlay with WASD/Sprint hints, zone indicator, crosshair, social links
- Minimap showing player position and hotspot stations (data-driven from HOTSPOTS)
- Graphics quality settings (Ultra/High/Low) with FPS counter (throttled 500ms)
- Photo Mode with amber indicator banner (auto-activates when idle 2s)
- glTF asset pipeline with Draco/meshopt/KTX2 compression support
- Sample GLB (cyber orb on pedestal) loaded and placed in apartment scene
- Staged loading screen with progress stages and 30s timeout fallback
- Graceful WebGL fallback with disabled 3D buttons
- Quality-tier-aware particle counts and shadow caster limits

## Recent Changes
- February 2026: Scene overhaul - Exterior-dominant lighting (city glow through windows, dim interior), enhanced cityscape (130+ buildings, mega-structures, flying light trails, ground grid), fully furnished apartment (bed, server rack, kitchen, wall TV, neon wall art, weapons rack, cables, enhanced desk/couch)
- February 2026: Milestone 4 - Refined quality tiers (particle counts, shadow caps, Low optimization), Photo Mode, staged loading UX with timeout fallback, README with how-to guide
- February 2026: Milestone 3 - Asset loader with Draco/KTX2/meshopt support, InstancedMesh for city windows, sample GLB pipeline, asset pipeline docs
- February 2026: Milestone 2 - First-person controls (acceleration, sprint, head bob), capsule collision, hotspot interaction system
- February 2026: Milestone 1 - Postprocessing pipeline (bloom, vignette, chromatic aberration), quality settings, emissive materials
- February 2026: Restructured flow - site opens to flat portfolio, 3D is optional desktop enhancement
- February 2026: Initial build
