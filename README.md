# Nick Lemoff — 3D Cyberpunk Portfolio

A cyberpunk-themed portfolio that opens to a flat, browsable view. An optional "ENTER 3D APARTMENT" button launches an immersive Three.js experience where visitors walk through a neon-lit apartment using WASD and mouse controls to explore resume content.

## Running the Project

```bash
npm install
npm run dev
```

The app starts on **port 5000**. Open it in a desktop browser for the full 3D experience. Mobile/tablet visitors see the flat portfolio only.

## How It Works

1. **Portfolio View** — Default landing page with tabbed navigation (About, Experience, Skills, Projects, Education).
2. **Loading Screen** — Progress bar with stage indicators before entering 3D.
3. **3D Apartment** — First-person navigation with WASD + mouse look, sprint (Shift), and head bob.
4. **Hotspot Stations** — Walk near glowing stations to view resume content in HTML overlay panels.
5. **Photo Mode** — Stand still for 2 seconds and quality automatically boosts (bloom, render scale, vignette).

## Adding New Rooms or Hotspots

### Adding a Hotspot

Edit `client/src/lib/hotspots.ts`:

```typescript
{
  id: "certifications",
  position: { x: 5, y: 0, z: -8 },
  radius: 3.0,
  label: "CERTIFICATIONS",
  contentKey: "certifications",
  color: "#05D9E8",
}
```

Then add the matching content renderer in the `ResumePanel` component in `client/src/pages/CyberpunkPortfolio.tsx` (add a new `case "certifications":` in the switch).

### Adding Collision Boxes

Add AABB entries to the `COLLISION_BOXES` array in `hotspots.ts` to prevent the player from walking through new furniture or walls:

```typescript
{ min: { x: 4, z: -9 }, max: { x: 6, z: -7 } }
```

### Loading a Custom Room Model

1. Export from Blender as `.glb` (see `docs/asset-pipeline.md` for compression steps).
2. Place in `client/public/models/`.
3. Load in `cyberpunkScene.ts`:

```typescript
const gltf = await this.assetLoader.loadGLB("/models/my-room.glb");
this.scene.add(gltf.scene);
```

## Performance Tips

- **Quality Tiers**: Ultra / High / Low presets control render scale, bloom, shadows, and particle counts. The GPU is auto-detected on first visit; users can override via the GRAPHICS button.
- **Low Tier**: Disables bloom, vignette, chromatic aberration, and shadows entirely. Render scale drops to 60%. Use this for integrated GPUs.
- **Instancing**: City windows use `InstancedMesh` grouped by color (3 draw calls instead of thousands). Use `AssetLoader.createInstances()` for repeated props.
- **Shadow Casters**: Capped per quality tier (Ultra: 2, High: 1, Low: 0). Don't add unbounded shadow-casting lights.
- **Particles**: Counts scale with quality tier. Keep total under 1000 for Low, 2000 for Ultra.
- **Asset Compression**: Always compress GLB files with Draco (meshes) and KTX2 (textures) before deploying. See `docs/asset-pipeline.md`.
- **Photo Mode**: Automatically boosts quality when standing still for 2+ seconds (disabled on Low tier).

## Key Files

| File | Purpose |
|------|---------|
| `client/src/lib/cyberpunkScene.ts` | Three.js scene, controls, collision, hotspots |
| `client/src/lib/assetLoader.ts` | GLTFLoader with Draco/KTX2/meshopt support |
| `client/src/lib/hotspots.ts` | Hotspot positions and collision box definitions |
| `client/src/lib/qualitySettings.ts` | Quality tier configs and GPU auto-detection |
| `client/src/lib/resumeData.ts` | Static resume content |
| `client/src/pages/CyberpunkPortfolio.tsx` | React UI: portfolio, loading, HUD, panels |
| `docs/asset-pipeline.md` | Blender → glTF → compression pipeline guide |
