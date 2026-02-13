export type QualityTier = "ultra" | "high" | "low";

export interface QualityConfig {
  renderScale: number;
  bloom: { enabled: boolean; strength: number; radius: number; threshold: number };
  vignette: { enabled: boolean; darkness: number; offset: number };
  chromaticAberration: { enabled: boolean; offset: number };
  shadows: { enabled: boolean; mapSize: number; casterCount: number };
  particles: { floatingCount: number; rainCount: number };
  cityLightFlicker: boolean;
  toneMapping: { exposure: number };
  photoMode: boolean;
  envMap: { enabled: boolean; intensity: number };
  pbrTextures: boolean;
  physicalMaterials: boolean;
  toonShading: boolean;
  outlinePass: { enabled: boolean; edgeStrength: number; edgeThickness: number };
  rooftopDetails: boolean;
  interiorDecoration: boolean;
}

const ULTRA: QualityConfig = {
  renderScale: 1.0,
  bloom: { enabled: true, strength: 0.55, radius: 0.4, threshold: 0.35 },
  vignette: { enabled: true, darkness: 0.55, offset: 0.9 },
  chromaticAberration: { enabled: true, offset: 0.0015 },
  shadows: { enabled: true, mapSize: 2048, casterCount: 2 },
  particles: { floatingCount: 800, rainCount: 2000 },
  cityLightFlicker: true,
  toneMapping: { exposure: 1.3 },
  photoMode: false,
  envMap: { enabled: true, intensity: 1.0 },
  pbrTextures: true,
  physicalMaterials: true,
  toonShading: true,
  outlinePass: { enabled: true, edgeStrength: 2.5, edgeThickness: 1.0 },
  rooftopDetails: true,
  interiorDecoration: true,
};

const HIGH: QualityConfig = {
  renderScale: 0.85,
  bloom: { enabled: true, strength: 0.4, radius: 0.35, threshold: 0.4 },
  vignette: { enabled: true, darkness: 0.5, offset: 0.95 },
  chromaticAberration: { enabled: false, offset: 0 },
  shadows: { enabled: true, mapSize: 1024, casterCount: 1 },
  particles: { floatingCount: 300, rainCount: 800 },
  cityLightFlicker: true,
  toneMapping: { exposure: 1.2 },
  photoMode: false,
  envMap: { enabled: true, intensity: 0.6 },
  pbrTextures: true,
  physicalMaterials: false,
  toonShading: true,
  outlinePass: { enabled: true, edgeStrength: 2.0, edgeThickness: 0.8 },
  rooftopDetails: true,
  interiorDecoration: true,
};

const LOW: QualityConfig = {
  renderScale: 0.6,
  bloom: { enabled: false, strength: 0, radius: 0, threshold: 0 },
  vignette: { enabled: false, darkness: 0, offset: 0 },
  chromaticAberration: { enabled: false, offset: 0 },
  shadows: { enabled: false, mapSize: 512, casterCount: 0 },
  particles: { floatingCount: 100, rainCount: 300 },
  cityLightFlicker: false,
  toneMapping: { exposure: 1.15 },
  photoMode: false,
  envMap: { enabled: false, intensity: 0 },
  pbrTextures: false,
  physicalMaterials: false,
  toonShading: false,
  outlinePass: { enabled: false, edgeStrength: 0, edgeThickness: 0 },
  rooftopDetails: false,
  interiorDecoration: false,
};

export const PHOTO_MODE_CONFIG: QualityConfig = {
  ...ULTRA,
  renderScale: 1.0,
  bloom: { enabled: true, strength: 0.7, radius: 0.4, threshold: 0.3 },
  vignette: { enabled: true, darkness: 0.6, offset: 0.9 },
  photoMode: true,
  envMap: { enabled: true, intensity: 1.2 },
  pbrTextures: true,
  physicalMaterials: true,
  toonShading: true,
  outlinePass: { enabled: true, edgeStrength: 3.0, edgeThickness: 1.2 },
  rooftopDetails: true,
  interiorDecoration: true,
};

export const QUALITY_PRESETS: Record<QualityTier, QualityConfig> = {
  ultra: ULTRA,
  high: HIGH,
  low: LOW,
};

export function detectGPUTier(): QualityTier {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return "low";

    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase();
      if (
        renderer.includes("nvidia") ||
        renderer.includes("radeon rx") ||
        renderer.includes("apple m") ||
        renderer.includes("apple gpu")
      ) {
        return "ultra";
      }
      if (
        renderer.includes("intel iris") ||
        renderer.includes("radeon") ||
        renderer.includes("geforce")
      ) {
        return "high";
      }
    }

    const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTexSize >= 16384) return "high";
    return "low";
  } catch {
    return "low";
  }
}

const STORAGE_KEY = "cyberpunk_quality";

export function loadSavedQuality(): QualityTier | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "ultra" || val === "high" || val === "low") return val;
  } catch { /* noop */ }
  return null;
}

export function saveQuality(tier: QualityTier) {
  try {
    localStorage.setItem(STORAGE_KEY, tier);
  } catch { /* noop */ }
}

export function getInitialQuality(): QualityTier {
  return loadSavedQuality() ?? detectGPUTier();
}
