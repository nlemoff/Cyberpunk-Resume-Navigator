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
4. Loading screen with progress bar -> 3D apartment experience
5. "EXIT APARTMENT" button returns to flat portfolio
6. If WebGL unavailable, 3D buttons are disabled with "3D UNAVAILABLE" label

## Key Files
- `client/src/lib/cyberpunkScene.ts` - Core Three.js scene with apartment, cityscape, lighting, atmospheric effects
- `client/src/lib/resumeData.ts` - Static resume data from nlemoff.com
- `client/src/pages/CyberpunkPortfolio.tsx` - Main page with portfolio view, loading screen, HUD, resume panels, minimap
- `client/src/App.tsx` - Router setup

## Design
- **Colors**: Hot Pink (#FF2A6D), Cyan (#05D9E8), Deep Blue (#01012B), Dark Navy (#0A0E27), Electric White (#D1F7FF), Amber (#FFB86C), Purple (#7B2FBE)
- **Fonts**: Orbitron (headings), Rajdhani (body), Share Tech Mono (code/labels)
- **Theme**: Cyberpunk 2077 inspired with neon lighting and dark backgrounds

## Features
- Flat portfolio with tabbed navigation (default view)
- First-person WASD + mouse navigation in 3D mode
- 5 interactive resume stations (Experience, Skills, Projects, Education, About)
- Holographic floating labels above stations
- Animated neon lighting and particle effects
- Rain effect visible through windows
- Cityscape with flickering building windows
- HUD overlay with navigation hints, social links
- Minimap showing player position and stations
- Animated loading screen with progress bar
- Graceful WebGL fallback with disabled 3D buttons

## Recent Changes
- February 2026: Restructured flow - site opens to flat portfolio, 3D is optional desktop enhancement
- February 2026: Initial build
