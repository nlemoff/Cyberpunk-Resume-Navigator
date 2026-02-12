# Asset Pipeline: Blender → glTF → Compressed Web Assets

This document describes the recommended offline workflow for creating, exporting, and compressing 3D assets for the cyberpunk portfolio.

## Overview

```
Blender (.blend)
  → Export as glTF 2.0 (.glb)
    → Compress meshes with Draco or meshopt
    → Compress textures to KTX2/Basis Universal
      → Place in client/public/models/
```

The runtime `AssetLoader` (in `client/src/lib/assetLoader.ts`) handles decompression automatically via the Draco, KTX2, and meshopt decoders bundled in `client/public/`.

---

## 1. Modeling in Blender

### Scene Setup
- Work in metric units, 1 Blender unit = 1 meter
- Keep the apartment footprint matching the existing scene (~14×12 m)
- Name objects descriptively (e.g., `desk_main`, `wall_north`, `shelf_01`) — names carry through to glTF

### Geometry Best Practices
- Target under 100k triangles total for the apartment scene
- Use quads during modeling; Blender triangulates on export
- Merge geometry where possible (walls can be a single mesh)
- For repeated props (chairs, monitors, etc.), use Blender instances — the exporter can produce `EXT_mesh_gpu_instancing`

### Materials
- Use Principled BSDF only (maps directly to glTF PBR)
- Keep texture sizes reasonable: 1024×1024 for large surfaces, 512×512 for props
- Pack textures before export: Base Color, ORM (Occlusion/Roughness/Metallic), Normal, Emissive
- For cyberpunk neon glow: set Emission color and strength in the material — the runtime bloom pass will pick it up

### Baked Lighting (Optional)
- Bake indirect lighting to a lightmap texture in Blender
- Export it as the `occlusionTexture` in glTF, or use a custom channel
- This avoids expensive real-time GI and keeps the scene looking consistent

---

## 2. Exporting from Blender

Use **File → Export → glTF 2.0 (.glb)**:

| Setting | Value |
|---------|-------|
| Format | glTF Binary (.glb) |
| Include | Selected Objects (or Visible) |
| Transform → +Y Up | Enabled |
| Geometry → Apply Modifiers | Enabled |
| Geometry → UVs | Enabled |
| Geometry → Normals | Enabled |
| Geometry → Vertex Colors | If used |
| Materials | Export |
| Images | Include (embedded in .glb) |
| Animation | Only if needed |
| Draco Compression | Disabled (compress offline, see below) |

Output: `apartment.glb`

---

## 3. Mesh Compression

### Option A: Draco (recommended for static meshes)

Install gltf-transform CLI:
```bash
npm install -g @gltf-transform/cli
```

Compress with Draco:
```bash
gltf-transform draco apartment.glb apartment-draco.glb \
  --quantize-position 14 \
  --quantize-normal 10 \
  --quantize-texcoord 12
```

Typical compression: 60–80% size reduction on mesh data.

### Option B: Meshopt (recommended if animations are present)

```bash
gltf-transform meshopt apartment.glb apartment-meshopt.glb
```

Meshopt preserves animation data better than Draco and supports streaming decompression. The runtime `AssetLoader` supports both via `MeshoptDecoder`.

---

## 4. Texture Compression (KTX2 / Basis Universal)

### Install Tools

```bash
npm install -g @gltf-transform/cli
# KTX2 encoding requires the Khronos toktx tool or basisu
# Install from: https://github.com/KhronosGroup/KTX-Software/releases
```

### Compress Textures

Using gltf-transform with toktx:
```bash
gltf-transform toktx apartment-draco.glb apartment-final.glb \
  --slots "baseColorTexture,emissiveTexture" \
  --filter "linear" \
  --quality 128
```

Or for UASTC (higher quality, larger files):
```bash
gltf-transform toktx apartment-draco.glb apartment-final.glb \
  --mode uastc \
  --level 2 \
  --rdo 1 \
  --zstd 18
```

KTX2/Basis textures are GPU-compressed at runtime, reducing VRAM usage by 4–6×.

---

## 5. Deploying Assets

1. Place the final `.glb` file in `client/public/models/`
2. The runtime automatically serves files from `client/public/` as static assets
3. Load in scene code:

```typescript
const gltf = await this.assetLoader.loadGLB("/models/apartment-final.glb");
this.scene.add(gltf.scene);
```

### File Size Targets
| Asset | Raw | Compressed | Target |
|-------|-----|------------|--------|
| Apartment mesh | ~5 MB | ~1 MB (Draco) | < 2 MB |
| Textures | ~20 MB | ~4 MB (KTX2) | < 5 MB |
| Total GLB | ~25 MB | ~5 MB | < 7 MB |

---

## 6. Runtime Architecture

The `AssetLoader` class in `client/src/lib/assetLoader.ts` provides:

- **`loadGLB(url, onProgress?)`** — Loads a .glb with automatic Draco/meshopt/KTX2 decompression and caching
- **`AssetLoader.createInstances(mesh, transforms)`** — Creates InstancedMesh from a source mesh + transform array (for repeated props)
- **`AssetLoader.setupLOD(levels)`** — Creates THREE.LOD object from mesh/distance pairs

### Decoder Files
Decoder WASM binaries are served from:
- `/draco/` — Draco decoder (draco_decoder.wasm, draco_decoder.js, draco_wasm_wrapper.js)
- `/basis/` — Basis Universal transcoder (basis_transcoder.wasm, basis_transcoder.js)

These are copied from `node_modules/three/examples/jsm/libs/` to `client/public/`.

---

## 7. Instancing for Repeated Props

For objects that repeat (e.g., city windows, furniture copies):

```typescript
import { AssetLoader } from "./assetLoader";

const sourceMesh = gltf.scene.getObjectByName("chair") as THREE.Mesh;
const instances = AssetLoader.createInstances(sourceMesh, [
  { position: new THREE.Vector3(2, 0, 1) },
  { position: new THREE.Vector3(4, 0, 1), rotation: new THREE.Euler(0, Math.PI, 0) },
]);
scene.add(instances);
```

The cityscape windows already use `InstancedMesh` — grouped by color into 3 instanced batches (pink, cyan, amber), reducing draw calls from thousands to 3.

---

## Quick Reference: Full Pipeline Command

```bash
# 1. Export from Blender as apartment-raw.glb
# 2. Compress mesh
gltf-transform draco apartment-raw.glb apartment-draco.glb
# 3. Compress textures
gltf-transform toktx apartment-draco.glb apartment-final.glb --quality 128
# 4. Check file size
ls -lh apartment-final.glb
# 5. Copy to project
cp apartment-final.glb /path/to/project/client/public/models/
```
