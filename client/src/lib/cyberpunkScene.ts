import * as THREE from "three";
import { AssetLoader } from "./assetLoader";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { type QualityConfig, type QualityTier, QUALITY_PRESETS, PHOTO_MODE_CONFIG, getInitialQuality } from "./qualitySettings";
import { resumeData } from "./resumeData";
import { HOTSPOTS, COLLISION_BOXES, PLAYER_RADIUS, PLAYER_HEIGHT, type Hotspot } from "./hotspots";

const COLORS = {
  hotPink: 0xff2a6d,
  cyan: 0x05d9e8,
  deepBlue: 0x01012b,
  darkNavy: 0x0a0e27,
  electricWhite: 0xd1f7ff,
  amber: 0xffb86c,
  purple: 0x7b2fbe,
  darkFloor: 0x0c0f1a,
  wallDark: 0x0d1025,
  ceilingDark: 0x080b1a,
};

const WALK_SPEED = 4.5;
const SPRINT_SPEED = 7.5;
const ACCEL_FACTOR = 1 / 0.15;
const DECEL_RATE = 18;
const HEAD_BOB_AMP = 0.03;
const HEAD_BOB_WALK_FREQ = 8;
const HEAD_BOB_SPRINT_FREQ = 12;
const PITCH_LIMIT = (85 * Math.PI) / 180;

export class CyberpunkScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  moveForward = false;
  moveBackward = false;
  moveLeft = false;
  moveRight = false;
  sprinting = false;
  velocity = new THREE.Vector3();
  direction = new THREE.Vector3();
  euler = new THREE.Euler(0, 0, 0, "YXZ");
  isLocked = false;
  raycaster = new THREE.Raycaster();
  activeHotspot: Hotspot | null = null;
  onHotspotChange?: (hotspot: Hotspot | null) => void;
  onLockChange?: (locked: boolean) => void;
  neonMeshes: THREE.Mesh[] = [];
  rainParticles?: THREE.Points;
  hologramMeshes: THREE.Mesh[] = [];
  animationId?: number;
  container: HTMLElement;
  floatingParticles?: THREE.Points;
  composer!: EffectComposer;
  bloomPass!: UnrealBloomPass;
  vignettePass!: ShaderPass;
  chromaticPass!: ShaderPass;
  qualityConfig: QualityConfig;
  qualityTier: QualityTier;
  onQualityChange?: (tier: QualityTier) => void;
  fpsFrames = 0;
  fpsTime = 0;
  currentFps = 0;
  onFpsUpdate?: (fps: number) => void;
  lightCones: THREE.Mesh[] = [];
  currentSpeed = 0;
  headBobPhase = 0;
  photoModeActive = false;
  photoModeIdleTime = 0;
  onPhotoModeChange?: (active: boolean) => void;
  shadowCastingLights: THREE.Light[] = [];
  assetLoader: AssetLoader;
  sampleGLBGroup?: THREE.Group;
  windowInstances: THREE.InstancedMesh[] = [];
  proceduralTextures?: {
    floorMap: THREE.CanvasTexture;
    floorRoughness: THREE.CanvasTexture;
    wallCanvas: HTMLCanvasElement;
    ceilingMap: THREE.CanvasTexture;
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050815);
    this.scene.fog = new THREE.FogExp2(0x050815, 0.012);
    this.clock = new THREE.Clock();

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      150
    );
    this.camera.position.set(0, PLAYER_HEIGHT, 8);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;

    this.qualityTier = getInitialQuality();
    this.qualityConfig = QUALITY_PRESETS[this.qualityTier];
    this.renderer.toneMappingExposure = this.qualityConfig.toneMapping.exposure;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.qualityConfig.renderScale);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.qualityConfig.shadows.enabled;

    container.appendChild(this.renderer.domElement);
    this.setupPostProcessing();

    this.assetLoader = new AssetLoader({ renderer: this.renderer });

    this.createProceduralTextures();
    this.buildApartment();
    this.addLighting();
    this.buildCityscape();
    this.buildResumeStations();
    this.addAtmosphericEffects();
    this.setupControls();
    this.loadSampleGLB();

    window.addEventListener("resize", this.onResize);
  }

  setupPostProcessing() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(w, h);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.qualityConfig.bloom.strength,
      this.qualityConfig.bloom.radius,
      this.qualityConfig.bloom.threshold
    );
    this.bloomPass.enabled = this.qualityConfig.bloom.enabled;
    this.composer.addPass(this.bloomPass);

    const chromaticShader = {
      uniforms: {
        tDiffuse: { value: null },
        uOffset: { value: this.qualityConfig.chromaticAberration.offset },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uOffset;
        varying vec2 vUv;
        void main() {
          vec2 dir = vUv - vec2(0.5);
          float d = length(dir);
          float r = texture2D(tDiffuse, vUv + dir * uOffset * d).r;
          float g = texture2D(tDiffuse, vUv).g;
          float b = texture2D(tDiffuse, vUv - dir * uOffset * d).b;
          float a = texture2D(tDiffuse, vUv).a;
          gl_FragColor = vec4(r, g, b, a);
        }
      `,
    };
    this.chromaticPass = new ShaderPass(chromaticShader);
    this.chromaticPass.enabled = this.qualityConfig.chromaticAberration.enabled;
    this.composer.addPass(this.chromaticPass);

    const vignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        uDarkness: { value: this.qualityConfig.vignette.darkness },
        uOffset: { value: this.qualityConfig.vignette.offset },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uDarkness;
        uniform float uOffset;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec2 uv = (vUv - vec2(0.5)) * vec2(uOffset);
          float vig = clamp(1.0 - dot(uv, uv), 0.0, 1.0);
          texel.rgb *= mix(1.0 - uDarkness, 1.0, vig);
          gl_FragColor = texel;
        }
      `,
    };
    this.vignettePass = new ShaderPass(vignetteShader);
    this.vignettePass.enabled = this.qualityConfig.vignette.enabled;
    this.composer.addPass(this.vignettePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  // Phase 2: Procedural canvas textures for interior surfaces
  createProceduralTextures() {
    // Floor texture (512x512): 4x4 dark tech-tile grid with grooves and cyan accent lines
    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fCtx = floorCanvas.getContext("2d")!;
    fCtx.fillStyle = "#0c0f1a";
    fCtx.fillRect(0, 0, 512, 512);
    const tileSize = 512 / 4;
    for (let tx = 0; tx < 4; tx++) {
      for (let ty = 0; ty < 4; ty++) {
        const x = tx * tileSize;
        const y = ty * tileSize;
        // Tile body
        fCtx.fillStyle = "#0e1220";
        fCtx.fillRect(x + 4, y + 4, tileSize - 8, tileSize - 8);
        // Groove lines
        fCtx.strokeStyle = "#060810";
        fCtx.lineWidth = 3;
        fCtx.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
        // Subtle cyan accent line at bottom of each tile
        fCtx.strokeStyle = "rgba(5, 217, 232, 0.08)";
        fCtx.lineWidth = 1;
        fCtx.beginPath();
        fCtx.moveTo(x + 8, y + tileSize - 6);
        fCtx.lineTo(x + tileSize - 8, y + tileSize - 6);
        fCtx.stroke();
      }
    }
    const floorMap = new THREE.CanvasTexture(floorCanvas);
    floorMap.wrapS = THREE.RepeatWrapping;
    floorMap.wrapT = THREE.RepeatWrapping;
    floorMap.repeat.set(5, 6);

    // Floor roughness map (256x256): smoother tile centers, rougher seams
    const roughCanvas = document.createElement("canvas");
    roughCanvas.width = 256;
    roughCanvas.height = 256;
    const rCtx = roughCanvas.getContext("2d")!;
    rCtx.fillStyle = "#808080";
    rCtx.fillRect(0, 0, 256, 256);
    const rTile = 256 / 4;
    for (let tx = 0; tx < 4; tx++) {
      for (let ty = 0; ty < 4; ty++) {
        const x = tx * rTile;
        const y = ty * rTile;
        rCtx.fillStyle = "#404040";
        rCtx.fillRect(x + 6, y + 6, rTile - 12, rTile - 12);
        rCtx.fillStyle = "#c0c0c0";
        rCtx.fillRect(x, y, rTile, 4);
        rCtx.fillRect(x, y, 4, rTile);
      }
    }
    const floorRoughness = new THREE.CanvasTexture(roughCanvas);
    floorRoughness.wrapS = THREE.RepeatWrapping;
    floorRoughness.wrapT = THREE.RepeatWrapping;
    floorRoughness.repeat.set(5, 6);

    // Wall texture (512x512): vertical panel pattern with beveled edges
    const wallCanvas = document.createElement("canvas");
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const wCtx = wallCanvas.getContext("2d")!;
    wCtx.fillStyle = "#0d1025";
    wCtx.fillRect(0, 0, 512, 512);
    const panelW = 512 / 6;
    for (let p = 0; p < 6; p++) {
      const x = p * panelW;
      wCtx.fillStyle = "#0f1228";
      wCtx.fillRect(x + 3, 3, panelW - 6, 506);
      wCtx.strokeStyle = "rgba(255,255,255,0.03)";
      wCtx.lineWidth = 1;
      wCtx.beginPath();
      wCtx.moveTo(x + 3, 3);
      wCtx.lineTo(x + 3, 509);
      wCtx.stroke();
      wCtx.strokeStyle = "rgba(0,0,0,0.2)";
      wCtx.beginPath();
      wCtx.moveTo(x + panelW - 3, 3);
      wCtx.lineTo(x + panelW - 3, 509);
      wCtx.stroke();
      for (let hy = 128; hy < 512; hy += 128) {
        wCtx.strokeStyle = "rgba(0,0,0,0.15)";
        wCtx.lineWidth = 2;
        wCtx.beginPath();
        wCtx.moveTo(x + 5, hy);
        wCtx.lineTo(x + panelW - 5, hy);
        wCtx.stroke();
      }
    }

    // Ceiling texture (256x256): industrial panel grid
    const ceilCanvas = document.createElement("canvas");
    ceilCanvas.width = 256;
    ceilCanvas.height = 256;
    const cCtx = ceilCanvas.getContext("2d")!;
    cCtx.fillStyle = "#080b1a";
    cCtx.fillRect(0, 0, 256, 256);
    const cTile = 256 / 4;
    for (let tx = 0; tx < 4; tx++) {
      for (let ty = 0; ty < 4; ty++) {
        const x = tx * cTile;
        const y = ty * cTile;
        cCtx.fillStyle = "#0a0e1e";
        cCtx.fillRect(x + 2, y + 2, cTile - 4, cTile - 4);
        cCtx.strokeStyle = "#060810";
        cCtx.lineWidth = 2;
        cCtx.strokeRect(x, y, cTile, cTile);
      }
    }
    const ceilingMap = new THREE.CanvasTexture(ceilCanvas);
    ceilingMap.wrapS = THREE.RepeatWrapping;
    ceilingMap.wrapT = THREE.RepeatWrapping;
    ceilingMap.repeat.set(5, 6);

    this.proceduralTextures = { floorMap, floorRoughness, wallCanvas, ceilingMap };
  }

  buildApartment() {
    const roomWidth = 20;
    const roomDepth = 24;
    const roomHeight = 4;

    // Phase 2: Floor with procedural texture (replaces flat color + GridHelper)
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.proceduralTextures!.floorMap,
      roughnessMap: this.proceduralTextures!.floorRoughness,
      roughness: 0.3,
      metalness: 0.6,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Phase 2: Ceiling with procedural texture
    const ceilingGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.proceduralTextures!.ceilingMap,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight;
    this.scene.add(ceiling);

    // Phase 2: Wall materials with procedural panel texture (per-wall repeat)
    const makeWallTex = (rx: number, ry: number) => {
      const t = new THREE.CanvasTexture(this.proceduralTextures!.wallCanvas);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      return t;
    };
    const makeWallMat = (rx: number, ry: number) => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: makeWallTex(rx, ry),
      roughness: 0.7,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomHeight),
      makeWallMat(5, 1)
    );
    backWall.position.set(0, roomHeight / 2, -roomDepth / 2);
    this.scene.add(backWall);

    const frontWallLeft = new THREE.Mesh(
      new THREE.PlaneGeometry(5, roomHeight),
      makeWallMat(1.25, 1)
    );
    frontWallLeft.position.set(-7.5, roomHeight / 2, roomDepth / 2);
    frontWallLeft.rotation.y = Math.PI;
    this.scene.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(
      new THREE.PlaneGeometry(5, roomHeight),
      makeWallMat(1.25, 1)
    );
    frontWallRight.position.set(7.5, roomHeight / 2, roomDepth / 2);
    frontWallRight.rotation.y = Math.PI;
    this.scene.add(frontWallRight);

    const plainWallMat = new THREE.MeshStandardMaterial({
      color: COLORS.wallDark,
      roughness: 0.7,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const frontWallTop = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 1),
      plainWallMat
    );
    frontWallTop.position.set(0, roomHeight - 0.5, roomDepth / 2);
    frontWallTop.rotation.y = Math.PI;
    this.scene.add(frontWallTop);

    // Phase 5: Front window glass — increased opacity with NormalBlending
    const windowGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 3),
      new THREE.MeshStandardMaterial({
        color: 0x0a1e3a,
        transparent: true,
        opacity: 0.15,
        roughness: 0.05,
        metalness: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    windowGlass.position.set(0, 1.5, roomDepth / 2 - 0.05);
    windowGlass.rotation.y = Math.PI;
    this.scene.add(windowGlass);

    const windowFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f3a,
      metalness: 0.8,
      roughness: 0.2,
    });
    for (let i = -5; i <= 5; i += 2.5) {
      const vFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 3, 0.1),
        windowFrameMat
      );
      vFrame.position.set(i, 1.5, roomDepth / 2 - 0.02);
      this.scene.add(vFrame);
    }
    const hFrame = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.05, 0.1),
      windowFrameMat
    );
    hFrame.position.set(0, 3, roomDepth / 2 - 0.02);
    this.scene.add(hFrame);

    // Phase 5: Cyan edge glow strip along top of front window frame
    const windowTopGlow = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.03, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 1.0,
      })
    );
    windowTopGlow.position.set(0, 3.02, roomDepth / 2 - 0.02);
    this.scene.add(windowTopGlow);

    // Phase 5: Left wall glass — increased opacity with NormalBlending
    const leftWallGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(roomDepth, roomHeight),
      new THREE.MeshStandardMaterial({
        color: 0x1a0a2e,
        transparent: true,
        opacity: 0.12,
        roughness: 0.05,
        metalness: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    leftWallGlass.position.set(-roomWidth / 2, roomHeight / 2, 0);
    leftWallGlass.rotation.y = Math.PI / 2;
    this.scene.add(leftWallGlass);

    for (let z = -roomDepth / 2; z <= roomDepth / 2; z += 4) {
      const vf = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, roomHeight, 0.05),
        windowFrameMat
      );
      vf.position.set(-roomWidth / 2, roomHeight / 2, z);
      this.scene.add(vf);
    }

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(roomDepth, roomHeight),
      makeWallMat(6, 1)
    );
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    this.addNeonStrips(roomWidth, roomDepth, roomHeight);
    this.addFurniture();
  }

  // Phase 1 + 6: Neon strips with reduced emissive and increased thickness
  addNeonStrips(w: number, d: number, h: number) {
    const neonCyanMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.cyan,
      emissiveIntensity: 1.5,
    });
    const neonPinkMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.hotPink,
      emissiveIntensity: 1.5,
    });

    const strips: { pos: [number, number, number]; size: [number, number, number]; mat: THREE.Material }[] = [
      { pos: [-w / 2 + 0.05, h - 0.1, 0], size: [0.06, 0.06, d], mat: neonCyanMat },
      { pos: [w / 2 - 0.05, h - 0.1, 0], size: [0.06, 0.06, d], mat: neonPinkMat },
      { pos: [0, h - 0.05, -d / 2 + 0.05], size: [w, 0.06, 0.06], mat: neonCyanMat },
      { pos: [0, 0.05, -d / 2 + 0.05], size: [w, 0.06, 0.06], mat: neonPinkMat },
      { pos: [0, h - 0.05, d / 2 - 0.05], size: [w, 0.06, 0.06], mat: neonPinkMat },
      { pos: [-w / 2 + 0.05, 0.05, 0], size: [0.06, 0.06, d], mat: neonPinkMat },
    ];

    strips.forEach(({ pos, size, mat }) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      mesh.position.set(...pos);
      this.scene.add(mesh);
      this.neonMeshes.push(mesh);
    });
  }

  addFurniture() {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f3a,
      metalness: 0.9,
      roughness: 0.1,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e1a,
      roughness: 0.8,
      metalness: 0.2,
    });
    const kitchenMat = new THREE.MeshStandardMaterial({
      color: 0x151830,
      metalness: 0.7,
      roughness: 0.2,
    });

    // Desk
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.2), metalMat);
    deskTop.position.set(7, 0.85, -10);
    deskTop.castShadow = true;
    this.scene.add(deskTop);

    // Phase 6: Desk cyan edge strip along front
    const deskEdge = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.02, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 1.0,
      })
    );
    deskEdge.position.set(7, 0.86, -9.4);
    this.scene.add(deskEdge);

    const legGeo = new THREE.BoxGeometry(0.05, 0.85, 0.05);
    [[-1.4, -10.5], [1.4, -10.5], [-1.4, -9.5], [1.4, -9.5]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(7 + x, 0.425, z);
      this.scene.add(leg);
    });

    const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), metalMat);
    monitorStand.position.set(7, 1.15, -10.3);
    this.scene.add(monitorStand);

    // Phase 6: Monitor with canvas texture (scan lines + code lines)
    const screenCanvas1 = document.createElement("canvas");
    screenCanvas1.width = 256;
    screenCanvas1.height = 160;
    const sCtx1 = screenCanvas1.getContext("2d")!;
    sCtx1.fillStyle = "#01012b";
    sCtx1.fillRect(0, 0, 256, 160);
    sCtx1.strokeStyle = "rgba(5, 217, 232, 0.15)";
    sCtx1.lineWidth = 1;
    for (let y = 0; y < 160; y += 3) {
      sCtx1.beginPath();
      sCtx1.moveTo(0, y);
      sCtx1.lineTo(256, y);
      sCtx1.stroke();
    }
    sCtx1.fillStyle = "rgba(5, 217, 232, 0.5)";
    for (let line = 0; line < 14; line++) {
      const indent = Math.floor(Math.random() * 4) * 12;
      const width = 20 + Math.floor(Math.random() * 160);
      sCtx1.fillRect(8 + indent, 8 + line * 10, width, 5);
    }
    const screenTex1 = new THREE.CanvasTexture(screenCanvas1);

    const monitorScreen = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1, 0.05),
      new THREE.MeshBasicMaterial({ map: screenTex1 })
    );
    monitorScreen.position.set(7, 1.65, -10.4);
    this.scene.add(monitorScreen);

    // Phase 1: Screen glow — reduced emissive, toneMapped restored
    const screenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.5,
      })
    );
    screenGlow.position.set(7, 1.65, -10.37);
    this.scene.add(screenGlow);
    this.hologramMeshes.push(screenGlow);

    // Monitor 2
    const monitor2Stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), metalMat);
    monitor2Stand.position.set(8.3, 1.05, -10.3);
    this.scene.add(monitor2Stand);

    // Phase 6: Monitor 2 with canvas texture (pink theme)
    const screenCanvas2 = document.createElement("canvas");
    screenCanvas2.width = 256;
    screenCanvas2.height = 160;
    const sCtx2 = screenCanvas2.getContext("2d")!;
    sCtx2.fillStyle = "#01012b";
    sCtx2.fillRect(0, 0, 256, 160);
    sCtx2.strokeStyle = "rgba(255, 42, 109, 0.15)";
    sCtx2.lineWidth = 1;
    for (let y = 0; y < 160; y += 3) {
      sCtx2.beginPath();
      sCtx2.moveTo(0, y);
      sCtx2.lineTo(256, y);
      sCtx2.stroke();
    }
    sCtx2.fillStyle = "rgba(255, 42, 109, 0.5)";
    for (let line = 0; line < 10; line++) {
      const indent = Math.floor(Math.random() * 3) * 15;
      const width = 15 + Math.floor(Math.random() * 120);
      sCtx2.fillRect(8 + indent, 8 + line * 10, width, 5);
    }
    const screenTex2 = new THREE.CanvasTexture(screenCanvas2);

    const monitor2 = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.7, 0.04),
      new THREE.MeshBasicMaterial({ map: screenTex2 })
    );
    monitor2.position.set(8.3, 1.4, -10.4);
    this.scene.add(monitor2);

    // Phase 1: Screen 2 glow — reduced emissive
    const screen2Glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.hotPink,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.4,
      })
    );
    screen2Glow.position.set(8.3, 1.4, -10.37);
    this.scene.add(screen2Glow);
    this.hologramMeshes.push(screen2Glow);

    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.3), metalMat);
    keyboard.position.set(7, 0.9, -9.7);
    this.scene.add(keyboard);

    // Phase 1: Lamp shade — reduced emissive
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), metalMat);
    lampBase.position.set(5.8, 1.1, -10.2);
    this.scene.add(lampBase);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 8), new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.amber,
      emissiveIntensity: 0.9,
    }));
    lampShade.position.set(5.8, 1.35, -10.2);
    lampShade.rotation.x = Math.PI;
    this.scene.add(lampShade);
    this.neonMeshes.push(lampShade);

    const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 4);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9, metalness: 0.1 });
    for (let i = 0; i < 3; i++) {
      const cable = new THREE.Mesh(cableGeo, cableMat);
      cable.position.set(6.5 + i * 0.08, 0.425, -10.5);
      this.scene.add(cable);
    }

    // Bed
    const bedPlatform = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 2), darkMat);
    bedPlatform.position.set(-7, 0.175, -9);
    this.scene.add(bedPlatform);

    // Phase 6: Mattress with canvas texture (fold lines)
    const mattressCanvas = document.createElement("canvas");
    mattressCanvas.width = 128;
    mattressCanvas.height = 128;
    const mCtx = mattressCanvas.getContext("2d")!;
    mCtx.fillStyle = "#12162a";
    mCtx.fillRect(0, 0, 128, 128);
    mCtx.strokeStyle = "rgba(0,0,0,0.2)";
    mCtx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      mCtx.beginPath();
      mCtx.moveTo(5, i * 32);
      mCtx.lineTo(123, i * 32);
      mCtx.stroke();
    }
    const mattressTex = new THREE.CanvasTexture(mattressCanvas);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 1.8), new THREE.MeshStandardMaterial({
      map: mattressTex,
      roughness: 0.9,
      metalness: 0.1,
    }));
    mattress.position.set(-7, 0.425, -9);
    this.scene.add(mattress);

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.35), new THREE.MeshStandardMaterial({
      color: 0x1a1f3a,
      roughness: 0.8,
      metalness: 0.1,
    }));
    pillow.position.set(-7, 0.53, -9.8);
    this.scene.add(pillow);
    const sideTable = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), metalMat);
    sideTable.position.set(-5.5, 0.25, -9.8);
    this.scene.add(sideTable);

    // Server rack — LEDs keep toneMapped: false
    const serverRack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.5), new THREE.MeshStandardMaterial({
      color: 0x111528,
      metalness: 0.9,
      roughness: 0.1,
    }));
    serverRack.position.set(9, 1.1, -5);
    this.scene.add(serverRack);
    const ledColors = [COLORS.cyan, 0x00ff44, COLORS.cyan, 0x00ff44, COLORS.hotPink];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.04, 0.01),
          new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: ledColors[row % ledColors.length],
            emissiveIntensity: 3.0,
            toneMapped: false,
          })
        );
        led.position.set(8.6 + col * 0.15, 0.5 + row * 0.4, -4.74);
        this.scene.add(led);
        this.neonMeshes.push(led);
      }
    }
    const serverHum = new THREE.PointLight(COLORS.cyan, 0.3, 3);
    serverHum.position.set(9, 1.5, -4.5);
    this.scene.add(serverHum);

    for (let i = 0; i < 4; i++) {
      const hangCable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 1.5 + Math.random() * 1.5, 4),
        cableMat
      );
      hangCable.position.set(8.7 + Math.random() * 0.6, 3.2, -5.1 + Math.random() * 0.3);
      this.scene.add(hangCable);
    }

    // Kitchen
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.6), kitchenMat);
    counter.position.set(8, 0.45, 8);
    this.scene.add(counter);
    const cabinet1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.35), kitchenMat);
    cabinet1.position.set(7.5, 2.8, 8);
    this.scene.add(cabinet1);
    const cabinet2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.35), kitchenMat);
    cabinet2.position.set(9, 2.8, 8);
    this.scene.add(cabinet2);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.35), new THREE.MeshStandardMaterial({
      color: 0x080b18,
      metalness: 0.95,
      roughness: 0.05,
    }));
    sink.position.set(8, 0.88, 8);
    this.scene.add(sink);

    // Phase 1: Kitchen holo — reduced emissive
    const kitchenHolo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      })
    );
    kitchenHolo.position.set(8, 1.6, 8);
    this.scene.add(kitchenHolo);
    this.hologramMeshes.push(kitchenHolo);

    // Couch
    const couchBase = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 1.5), darkMat);
    couchBase.position.set(-5, 0.35, 3);
    this.scene.add(couchBase);
    const couchBack = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 0.2), darkMat);
    couchBack.position.set(-5, 0.75, 2.3);
    this.scene.add(couchBack);
    const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), new THREE.MeshStandardMaterial({
      color: 0x0e1224,
      roughness: 0.9,
      metalness: 0.1,
    }));
    cushion1.position.set(-5.8, 0.61, 3.1);
    this.scene.add(cushion1);
    const cushion2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), new THREE.MeshStandardMaterial({
      color: 0x0e1224,
      roughness: 0.9,
      metalness: 0.1,
    }));
    cushion2.position.set(-4.2, 0.61, 3.1);
    this.scene.add(cushion2);
    const armrestL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.5), darkMat);
    armrestL.position.set(-7.1, 0.6, 3);
    this.scene.add(armrestL);
    const armrestR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 1.5), darkMat);
    armrestR.position.set(-2.9, 0.6, 3);
    this.scene.add(armrestR);

    // Phase 6: Couch pink accent strip along base front
    const couchEdge = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.02, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.hotPink,
        emissiveIntensity: 1.0,
      })
    );
    couchEdge.position.set(-5, 0.15, 3.75);
    this.scene.add(couchEdge);

    // Coffee table
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 1), metalMat);
    tableTop.position.set(-5, 0.45, 5.5);
    this.scene.add(tableTop);
    [[-0.9, 5], [0.9, 5], [-0.9, 6], [0.9, 6]].forEach(([x, z]) => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), metalMat);
      tl.position.set(-5 + x, 0.225, z);
      this.scene.add(tl);
    });

    // Phase 1: Tablet — reduced emissive
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.25), new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.cyan,
      emissiveIntensity: 0.5,
    }));
    tablet.position.set(-5.2, 0.49, 5.5);
    this.scene.add(tablet);
    this.neonMeshes.push(tablet);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), metalMat);
    mug.position.set(-4.5, 0.54, 5.3);
    this.scene.add(mug);

    // Wall TV
    const wallTV = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2, 0.06), new THREE.MeshStandardMaterial({
      color: 0x050508,
      metalness: 0.9,
      roughness: 0.1,
    }));
    wallTV.position.set(0, 2.5, -11.8);
    this.scene.add(wallTV);

    // Phase 1: TV glow — reduced emissive
    const tvGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.3, 1.8),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.35,
      })
    );
    tvGlow.position.set(0, 2.5, -11.76);
    this.scene.add(tvGlow);
    this.hologramMeshes.push(tvGlow);

    // Shelves
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x151830,
      metalness: 0.7,
      roughness: 0.3,
    });
    const bookColors = [0x2a1a3a, 0x1a2a3a, 0x3a1a1a, 0x1a3a2a, 0x2a2a1a];
    for (let y = 1; y <= 3; y += 0.7) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.5), shelfMat);
      shelf.position.set(8, y, 0);
      this.scene.add(shelf);
      for (let b = 0; b < 5; b++) {
        const bookH = 0.2 + Math.random() * 0.3;
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, bookH, 0.3),
          new THREE.MeshStandardMaterial({
            color: bookColors[b % bookColors.length],
            roughness: 0.7,
            metalness: 0.2,
          })
        );
        book.position.set(6.8 + b * 0.5, y + 0.03 + bookH / 2, 0);
        this.scene.add(book);
      }
      if (y > 1.5) {
        const trinket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6), metalMat);
        trinket.position.set(9.1, y + 0.1, 0);
        this.scene.add(trinket);
      }
    }

    // Wall neon decorations — keep toneMapped: false, reduced intensity
    const neonTriShape = new THREE.Shape();
    neonTriShape.moveTo(0, 0.6);
    neonTriShape.lineTo(-0.5, -0.3);
    neonTriShape.lineTo(0.5, -0.3);
    neonTriShape.closePath();
    const neonTriInner = new THREE.Shape();
    neonTriInner.moveTo(0, 0.55);
    neonTriInner.lineTo(-0.45, -0.25);
    neonTriInner.lineTo(0.45, -0.25);
    neonTriInner.closePath();
    neonTriShape.holes.push(neonTriInner as unknown as THREE.Path);
    const neonTriGeo = new THREE.ShapeGeometry(neonTriShape);
    const neonTriMesh = new THREE.Mesh(neonTriGeo, new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.hotPink,
      emissiveIntensity: 1.5,
      toneMapped: false,
      side: THREE.DoubleSide,
    }));
    neonTriMesh.position.set(-3, 2.5, -11.75);
    this.scene.add(neonTriMesh);
    this.neonMeshes.push(neonTriMesh);

    const neonCircle = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.35, 24),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 1.5,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    neonCircle.position.set(9.8, 2.2, -3);
    neonCircle.rotation.y = -Math.PI / 2;
    this.scene.add(neonCircle);
    this.neonMeshes.push(neonCircle);

    const neonLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 2.0),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.hotPink,
        emissiveIntensity: 1.5,
        toneMapped: false,
      })
    );
    neonLine.position.set(9.8, 1.5, 2);
    neonLine.rotation.y = -Math.PI / 2;
    neonLine.rotation.z = Math.PI * 0.1;
    this.scene.add(neonLine);
    this.neonMeshes.push(neonLine);

    const rug = new THREE.Mesh(new THREE.BoxGeometry(5, 0.02, 4), new THREE.MeshStandardMaterial({
      color: 0x0e1228,
      roughness: 0.95,
      metalness: 0.05,
    }));
    rug.position.set(-5, 0.01, 4);
    this.scene.add(rug);

    const weaponRack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.5), metalMat);
    weaponRack.position.set(9.5, 1.8, -2);
    this.scene.add(weaponRack);
    const weapons = [
      { w: 0.06, h: 0.06, d: 0.8, y: 2.1 },
      { w: 0.04, h: 0.04, d: 0.7, y: 1.7 },
      { w: 0.05, h: 0.05, d: 0.9, y: 1.4 },
    ];
    weapons.forEach(({ w, h, d, y }) => {
      const wpn = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat);
      wpn.position.set(9.4, y, -2);
      this.scene.add(wpn);
    });

    const potGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.15, 8);
    const pot = new THREE.Mesh(potGeo, new THREE.MeshStandardMaterial({
      color: 0x2a1a1a,
      roughness: 0.8,
      metalness: 0.2,
    }));
    pot.position.set(-5.5, 0.58, -9.8);
    this.scene.add(pot);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({
      color: 0x0a3a1a,
      roughness: 0.8,
      metalness: 0.1,
    }));
    plant.position.set(-5.5, 0.72, -9.8);
    this.scene.add(plant);
  }

  // Phase 3: Lighting overhaul — 7 intentional lights replacing 11 competing ones
  addLighting() {
    const shadowsEnabled = this.qualityConfig.shadows.enabled;
    const shadowMapSize = this.qualityConfig.shadows.mapSize;
    const maxCasters = this.qualityConfig.shadows.casterCount;
    let casterIndex = 0;

    // 1. Ambient — reduced intensity, cooler tint
    const ambient = new THREE.AmbientLight(0x080c18, 0.4);
    this.scene.add(ambient);

    // 2. Front window RectArea (cyan key light)
    const windowLight = new THREE.RectAreaLight(COLORS.cyan, 3, 10, 3);
    windowLight.position.set(0, 2, 12.5);
    windowLight.lookAt(0, 2, 0);
    this.scene.add(windowLight);

    // 3. Left window RectArea (pink fill)
    const leftWindowLight = new THREE.RectAreaLight(COLORS.hotPink, 2, 24, 4);
    leftWindowLight.position.set(-10.5, 2, 0);
    leftWindowLight.lookAt(0, 2, 0);
    this.scene.add(leftWindowLight);

    // 4. Desk SpotLight (amber, shadow-casting, focused)
    const deskSpot = new THREE.SpotLight(COLORS.amber, 1.0, 8, Math.PI / 6, 0.5);
    deskSpot.position.set(7, 3.5, -10);
    deskSpot.target.position.set(7, 0, -10);
    if (shadowsEnabled && casterIndex < maxCasters) {
      deskSpot.castShadow = true;
      deskSpot.shadow.mapSize.width = shadowMapSize;
      deskSpot.shadow.mapSize.height = shadowMapSize;
      casterIndex++;
    }
    this.scene.add(deskSpot);
    this.scene.add(deskSpot.target);
    this.shadowCastingLights.push(deskSpot);

    // 5. Back wall PointLight (purple depth accent)
    const backWallLight = new THREE.PointLight(COLORS.purple, 0.6, 12);
    backWallLight.position.set(0, 3, -11);
    this.scene.add(backWallLight);

    // 6. City glow DirectionalLight (shadow-casting)
    const cityGlow = new THREE.DirectionalLight(0x6a3d9a, 1.5);
    cityGlow.position.set(-10, 8, 15);
    cityGlow.target.position.set(0, 0, 0);
    if (shadowsEnabled && casterIndex < maxCasters) {
      cityGlow.castShadow = true;
      cityGlow.shadow.mapSize.width = shadowMapSize;
      cityGlow.shadow.mapSize.height = shadowMapSize;
      casterIndex++;
    }
    this.scene.add(cityGlow);
    this.scene.add(cityGlow.target);
    this.shadowCastingLights.push(cityGlow);

    // 7. Single exterior PointLight
    const exteriorLight = new THREE.PointLight(COLORS.cyan, 2.5, 60);
    exteriorLight.position.set(-12, 5, 10);
    this.scene.add(exteriorLight);

    this.addLightCones();
  }

  // Phase 3: Light cones — 3 ConeGeometry (open-ended) replacing 5 flat planes
  addLightCones() {
    const cyanConeMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Cone from front window (left side)
    const cone1 = new THREE.Mesh(
      new THREE.ConeGeometry(3, 8, 16, 1, true),
      cyanConeMat
    );
    cone1.position.set(-1, 2, 7);
    cone1.rotation.x = Math.PI / 2 - 0.15;
    this.scene.add(cone1);
    this.lightCones.push(cone1);

    // Cone from front window (right side)
    const cone2 = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 7, 16, 1, true),
      cyanConeMat
    );
    cone2.position.set(2, 2, 7);
    cone2.rotation.x = Math.PI / 2 - 0.15;
    this.scene.add(cone2);
    this.lightCones.push(cone2);

    // Cone from left window (pink)
    const pinkConeMat = new THREE.MeshBasicMaterial({
      color: COLORS.hotPink,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const cone3 = new THREE.Mesh(
      new THREE.ConeGeometry(3.5, 9, 16, 1, true),
      pinkConeMat
    );
    cone3.position.set(-6, 2, 0);
    cone3.rotation.z = Math.PI / 2 - 0.15;
    this.scene.add(cone3);
    this.lightCones.push(cone3);
  }

  // Phase 4: Grid-based cityscape with street structure
  buildCityscape() {
    const cityGroup = new THREE.Group();

    const BLOCK_SIZE = 8;
    const STREET_WIDTH = 3;
    const SPACING = BLOCK_SIZE + STREET_WIDTH;
    const EXTENT = 5;

    const buildingColors = [0x0c1225, 0x101830, 0x0e1420];
    const buildingMats = buildingColors.map(c => new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.7,
      metalness: 0.4,
      emissive: c,
      emissiveIntensity: 0.15,
    }));

    const windowGeo = new THREE.PlaneGeometry(0.3, 0.4);
    const colorBuckets: { color: number; transforms: { pos: THREE.Vector3; rotY: number; opacity: number }[] }[] = [
      { color: COLORS.hotPink, transforms: [] },
      { color: COLORS.cyan, transforms: [] },
      { color: COLORS.amber, transforms: [] },
    ];

    // Grid-based building placement
    let totalBuildings = 0;
    for (let bx = -EXTENT; bx <= EXTENT; bx++) {
      for (let bz = -EXTENT; bz <= EXTENT; bz++) {
        const cx = bx * SPACING;
        const cz = bz * SPACING;

        // Skip blocks near apartment
        if (Math.abs(cx) < 14 && Math.abs(cz) < 14) continue;

        const dist = Math.sqrt(cx * cx + cz * cz);
        const numBuildings = 1 + Math.floor(Math.random() * 3);

        for (let b = 0; b < numBuildings && totalBuildings < 200; b++) {
          const w = 2 + Math.random() * (BLOCK_SIZE - 3);
          const d = 2 + Math.random() * (BLOCK_SIZE - 3);
          // Height scales with distance from center (taller at edges)
          const baseH = 8 + (dist / (EXTENT * SPACING)) * 35;
          const h = baseH + Math.random() * 15;

          const ox = (Math.random() - 0.5) * (BLOCK_SIZE - w) * 0.8;
          const oz = (Math.random() - 0.5) * (BLOCK_SIZE - d) * 0.8;

          const building = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            buildingMats[Math.floor(Math.random() * buildingMats.length)]
          );
          building.position.set(cx + ox, h / 2 - 5, cz + oz);
          cityGroup.add(building);
          totalBuildings++;

          // Spires on some buildings
          if (Math.random() < 0.25) {
            const spireH = 1 + Math.random() * 3;
            const spire = new THREE.Mesh(
              new THREE.CylinderGeometry(0.03, 0.06, spireH, 6),
              buildingMats[0]
            );
            spire.position.set(building.position.x, building.position.y + h / 2 + spireH / 2, building.position.z);
            cityGroup.add(spire);
            const tip = new THREE.Mesh(
              new THREE.SphereGeometry(0.08, 6, 4),
              new THREE.MeshStandardMaterial({
                color: 0x000000,
                emissive: Math.random() > 0.5 ? COLORS.hotPink : COLORS.cyan,
                emissiveIntensity: 3.0,
                toneMapped: false,
              })
            );
            tip.position.set(building.position.x, building.position.y + h / 2 + spireH, building.position.z);
            cityGroup.add(tip);
            this.neonMeshes.push(tip);
          }

          // Windows (instanced)
          const windowRows = Math.floor(h / 0.8);
          const windowCols = Math.floor(w / 0.6);
          for (let row = 0; row < windowRows; row++) {
            for (let col = 0; col < windowCols; col++) {
              if (Math.random() > 0.4) {
                const bucketIdx = Math.random() > 0.7 ? 0 : Math.random() > 0.5 ? 1 : 2;
                const side = Math.random() > 0.5 ? 1 : -1;
                colorBuckets[bucketIdx].transforms.push({
                  pos: new THREE.Vector3(
                    building.position.x + (w / 2 + 0.01) * side,
                    building.position.y - h / 2 + row * 0.8 + 0.5,
                    building.position.z - d / 2 + col * 0.6 + 0.3
                  ),
                  rotY: side > 0 ? Math.PI / 2 : -Math.PI / 2,
                  opacity: 0.4 + Math.random() * 0.6,
                });
              }
            }
          }
        }
      }
    }

    // Instanced windows
    for (const bucket of colorBuckets) {
      if (bucket.transforms.length === 0) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
      });
      const instanced = new THREE.InstancedMesh(windowGeo, mat, bucket.transforms.length);
      const dummy = new THREE.Object3D();
      const baseColor = new THREE.Color(bucket.color);

      bucket.transforms.forEach((t, i) => {
        dummy.position.copy(t.pos);
        dummy.rotation.set(0, t.rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
        const dimmed = baseColor.clone().multiplyScalar(t.opacity);
        instanced.setColorAt(i, dimmed);
      });

      instanced.instanceMatrix.needsUpdate = true;
      instanced.instanceColor!.needsUpdate = true;
      instanced.userData.baseColor = baseColor;
      cityGroup.add(instanced);
      this.windowInstances.push(instanced);
    }

    // Neon signs — reduced to 25 with dark backing panels
    for (let i = 0; i < 25; i++) {
      const signW = 2 + Math.random() * 3;
      const signH = 0.8 + Math.random() * 1.2;
      const signColor = [COLORS.hotPink, COLORS.cyan, COLORS.amber, COLORS.purple][
        Math.floor(Math.random() * 4)
      ];
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 25;
      const signY = 2 + Math.random() * 15;

      // Dark backing panel
      const backDist = dist + 0.1;
      const backing = new THREE.Mesh(
        new THREE.PlaneGeometry(signW + 0.3, signH + 0.2),
        new THREE.MeshStandardMaterial({ color: 0x080c15, roughness: 0.8, metalness: 0.3 })
      );
      backing.position.set(Math.sin(angle) * backDist, signY, Math.cos(angle) * backDist);
      backing.lookAt(0, signY, 0);
      cityGroup.add(backing);

      // Neon sign
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(signW, signH),
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: signColor,
          emissiveIntensity: 2.5,
          toneMapped: false,
          transparent: true,
          opacity: 0.8,
        })
      );
      sign.position.set(Math.sin(angle) * dist, signY, Math.cos(angle) * dist);
      sign.lookAt(0, signY, 0);
      cityGroup.add(sign);
      this.neonMeshes.push(sign);
    }

    // Billboards
    for (let i = 0; i < 4; i++) {
      const bbColor = [COLORS.hotPink, COLORS.cyan, COLORS.amber, COLORS.purple][i % 4];
      const billboard = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 3),
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: bbColor,
          emissiveIntensity: 3.0,
          toneMapped: false,
          transparent: true,
          opacity: 0.9,
        })
      );
      const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 20 + Math.random() * 10;
      billboard.position.set(Math.sin(angle) * dist, 15 + Math.random() * 10, Math.cos(angle) * dist);
      billboard.lookAt(0, billboard.position.y, 0);
      cityGroup.add(billboard);
      this.neonMeshes.push(billboard);
    }

    // Vehicle trails
    const trailColors = [COLORS.cyan, COLORS.hotPink, COLORS.amber];
    for (let i = 0; i < 10; i++) {
      const trailLen = 3 + Math.random() * 8;
      const trail = new THREE.Mesh(
        new THREE.BoxGeometry(trailLen, 0.04, 0.04),
        new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: trailColors[i % trailColors.length],
          emissiveIntensity: 3.0,
          toneMapped: false,
          transparent: true,
          opacity: 0.7,
        })
      );
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 30;
      trail.position.set(
        Math.sin(angle) * dist,
        5 + Math.random() * 25,
        Math.cos(angle) * dist
      );
      trail.rotation.y = Math.random() * Math.PI;
      cityGroup.add(trail);
      this.neonMeshes.push(trail);
    }

    // Ground with canvas street-grid texture
    const groundCanvas = document.createElement("canvas");
    groundCanvas.width = 512;
    groundCanvas.height = 512;
    const gCtx = groundCanvas.getContext("2d")!;
    gCtx.fillStyle = "#020308";
    gCtx.fillRect(0, 0, 512, 512);
    const cells = EXTENT * 2 + 1;
    const cellPx = 512 / cells;
    gCtx.strokeStyle = "#0a1525";
    gCtx.lineWidth = 3;
    for (let i = 0; i <= cells; i++) {
      const p = i * cellPx;
      gCtx.beginPath(); gCtx.moveTo(p, 0); gCtx.lineTo(p, 512); gCtx.stroke();
      gCtx.beginPath(); gCtx.moveTo(0, p); gCtx.lineTo(512, p); gCtx.stroke();
    }
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;

    const groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.9,
        metalness: 0.1,
      })
    );
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -7;
    cityGroup.add(groundPlane);

    // Street-level glow strips along grid lines
    const glowStripMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const gridExtent = EXTENT * SPACING;
    for (let n = -EXTENT; n < EXTENT; n++) {
      const streetCenter = n * SPACING + SPACING / 2;
      // X-running strip
      const xStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(gridExtent * 2, 0.3),
        glowStripMat
      );
      xStrip.rotation.x = -Math.PI / 2;
      xStrip.position.set(0, -6.98, streetCenter);
      cityGroup.add(xStrip);
      // Z-running strip
      const zStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, gridExtent * 2),
        glowStripMat
      );
      zStrip.rotation.x = -Math.PI / 2;
      zStrip.position.set(streetCenter, -6.98, 0);
      cityGroup.add(zStrip);
    }

    // Phase 4 + 7: Sky dome — inverted sphere with gradient canvas texture
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 512;
    skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext("2d")!;
    const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#020410");
    gradient.addColorStop(0.4, "#0a0e27");
    gradient.addColorStop(0.7, "#1a0a2e");
    gradient.addColorStop(1.0, "#2a0a1a");
    skyCtx.fillStyle = gradient;
    skyCtx.fillRect(0, 0, 512, 256);
    const skyTexture = new THREE.CanvasTexture(skyCanvas);
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 16),
      new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide,
      })
    );
    cityGroup.add(skyDome);

    this.scene.add(cityGroup);
  }

  buildResumeStations() {
    this.createStation(
      new THREE.Vector3(0, 0, -10),
      "experience",
      "EXPERIENCE",
      COLORS.hotPink
    );

    this.createStation(
      new THREE.Vector3(-7, 0, -4),
      "skills",
      "SKILLS",
      COLORS.cyan
    );

    this.createStation(
      new THREE.Vector3(-5, 0, 8),
      "projects",
      "PROJECTS",
      COLORS.amber
    );

    this.createStation(
      new THREE.Vector3(7, 0, 4),
      "education",
      "EDUCATION",
      COLORS.purple
    );

    this.createStation(
      new THREE.Vector3(3, 0, -6),
      "about",
      "ABOUT",
      COLORS.electricWhite
    );

    this.addHolographicLabels();
  }

  addHolographicLabels() {
    const labelData = [
      { text: "EXP", pos: new THREE.Vector3(0, 3.2, -10), color: COLORS.hotPink },
      { text: "SKL", pos: new THREE.Vector3(-7, 3.2, -4), color: COLORS.cyan },
      { text: "PRJ", pos: new THREE.Vector3(-5, 3.2, 8), color: COLORS.amber },
      { text: "EDU", pos: new THREE.Vector3(7, 3.2, 4), color: COLORS.purple },
      { text: "BIO", pos: new THREE.Vector3(3, 3.2, -6), color: COLORS.electricWhite },
    ];

    labelData.forEach(({ text, pos, color }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;

      ctx.clearRect(0, 0, 256, 64);
      const c = new THREE.Color(color);
      const hex = `#${c.getHexString()}`;

      ctx.shadowColor = hex;
      ctx.shadowBlur = 15;
      ctx.font = "bold 36px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = hex;
      ctx.fillText(text, 128, 42);

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `${hex}40`;
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 5, 236, 54);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(pos);
      sprite.scale.set(2, 0.5, 1);
      this.scene.add(sprite);
    });
  }

  createStation(
    position: THREE.Vector3,
    _type: string,
    _label: string,
    color: number
  ) {
    const group = new THREE.Group();
    group.position.copy(position);

    const basePadGeo = new THREE.CylinderGeometry(1.2, 1.3, 0.08, 6);
    const basePadMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e1a,
      metalness: 0.9,
      roughness: 0.1,
    });
    const basePad = new THREE.Mesh(basePadGeo, basePadMat);
    basePad.position.y = 0.04;
    group.add(basePad);

    const ringGeo = new THREE.RingGeometry(1.1, 1.3, 6);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: 2.5,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    group.add(ring);
    this.neonMeshes.push(ring);

    const beamGeo = new THREE.CylinderGeometry(0.02, 0.02, 3, 8);
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.3,
      toneMapped: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.5;
    group.add(beam);
    this.hologramMeshes.push(beam);

    const iconGeo = new THREE.OctahedronGeometry(0.25, 0);
    const iconMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: color,
      emissiveIntensity: 2.0,
      toneMapped: false,
    });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.position.y = 2.5;
    group.add(icon);
    this.hologramMeshes.push(icon);

    this.scene.add(group);
  }

  // Phase 7: Atmospheric effects — larger particles, blue-tinted rain
  addAtmosphericEffects() {
    const particleCount = this.qualityConfig.particles.floatingCount;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const pinkC = new THREE.Color(COLORS.hotPink);
    const cyanC = new THREE.Color(COLORS.cyan);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = Math.random() * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 24;

      const c = Math.random() > 0.5 ? pinkC : cyanC;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.floatingParticles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.floatingParticles);

    const rainCount = this.qualityConfig.particles.rainCount;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 80;
      rainPositions[i * 3 + 1] = Math.random() * 30;
      rainPositions[i * 3 + 2] = 13 + Math.random() * 40;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));

    const rainMat = new THREE.PointsMaterial({
      size: 0.08,
      color: 0x6688cc,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.rainParticles = new THREE.Points(rainGeo, rainMat);
    this.scene.add(this.rainParticles);
  }

  setupControls() {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
  }

  requestPointerLock = () => {
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
    if (this.renderer.domElement.requestPointerLock) {
      try {
        this.renderer.domElement.requestPointerLock();
      } catch {
        this.enableFallbackMouseLook();
      }
    } else {
      this.enableFallbackMouseLook();
    }
  };

  enableFallbackMouseLook = () => {
    this.isLocked = true;
    this.onLockChange?.(true);
    document.addEventListener("mousemove", this.onMouseMove);
  };

  onPointerLockError = () => {
    this.enableFallbackMouseLook();
  };

  onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.isLocked = locked;
    this.onLockChange?.(locked);
    if (locked) {
      document.addEventListener("mousemove", this.onMouseMove);
    } else {
      document.removeEventListener("mousemove", this.onMouseMove);
    }
  };

  onMouseMove = (e: MouseEvent) => {
    if (!this.isLocked) return;
    const sensitivity = 0.002;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= e.movementX * sensitivity;
    this.euler.x -= e.movementY * sensitivity;
    this.euler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  };

  onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW": case "ArrowUp": this.moveForward = true; break;
      case "KeyS": case "ArrowDown": this.moveBackward = true; break;
      case "KeyA": case "ArrowLeft": this.moveLeft = true; break;
      case "KeyD": case "ArrowRight": this.moveRight = true; break;
      case "ShiftLeft": case "ShiftRight": this.sprinting = true; break;
    }
  };

  onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW": case "ArrowUp": this.moveForward = false; break;
      case "KeyS": case "ArrowDown": this.moveBackward = false; break;
      case "KeyA": case "ArrowLeft": this.moveLeft = false; break;
      case "KeyD": case "ArrowRight": this.moveRight = false; break;
      case "ShiftLeft": case "ShiftRight": this.sprinting = false; break;
    }
  };

  onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  };

  resolveCollisions(position: THREE.Vector3): THREE.Vector3 {
    const resolved = position.clone();
    for (const box of COLLISION_BOXES) {
      const cx = resolved.x;
      const cz = resolved.z;
      const r = PLAYER_RADIUS;
      const minX = box.min.x;
      const minZ = box.min.z;
      const maxX = box.max.x;
      const maxZ = box.max.z;

      const closestX = Math.max(minX, Math.min(cx, maxX));
      const closestZ = Math.max(minZ, Math.min(cz, maxZ));
      const dx = cx - closestX;
      const dz = cz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < r * r) {
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const pen = r - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          resolved.x += nx * pen;
          resolved.z += nz * pen;
        } else {
          const penLeft = cx - minX + r;
          const penRight = maxX - cx + r;
          const penBack = cz - minZ + r;
          const penFront = maxZ - cz + r;
          const minPen = Math.min(penLeft, penRight, penBack, penFront);
          if (minPen === penLeft) resolved.x = minX - r;
          else if (minPen === penRight) resolved.x = maxX + r;
          else if (minPen === penBack) resolved.z = minZ - r;
          else resolved.z = maxZ + r;
        }
      }
    }
    return resolved;
  }

  update() {
    this.fpsFrames++;
    const now = performance.now();
    const fpsElapsed = now - this.fpsTime;
    if (fpsElapsed >= 500) {
      this.currentFps = Math.round(this.fpsFrames / (fpsElapsed / 1000));
      this.fpsFrames = 0;
      this.fpsTime = now;
      this.onFpsUpdate?.(this.currentFps);
    }

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    if (this.isLocked) {
      const targetSpeed = (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)
        ? (this.sprinting ? SPRINT_SPEED : WALK_SPEED)
        : 0;

      const accelLerp = 1 - Math.exp(-ACCEL_FACTOR * delta);
      if (targetSpeed > 0) {
        this.currentSpeed += (targetSpeed - this.currentSpeed) * accelLerp;
      } else {
        this.currentSpeed *= Math.exp(-DECEL_RATE * delta);
        if (this.currentSpeed < 0.01) this.currentSpeed = 0;
      }

      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      if (this.direction.lengthSq() > 0) this.direction.normalize();

      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(this.camera.quaternion);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(this.camera.quaternion);
      right.y = 0;
      right.normalize();

      const moveVec = new THREE.Vector3();
      moveVec.addScaledVector(forward, this.direction.z);
      moveVec.addScaledVector(right, this.direction.x);
      if (moveVec.lengthSq() > 0) moveVec.normalize();

      const newPos = this.camera.position.clone();
      newPos.addScaledVector(moveVec, this.currentSpeed * delta);

      const corrected = this.resolveCollisions(newPos);
      corrected.y = PLAYER_HEIGHT;

      const bobFreq = this.sprinting ? HEAD_BOB_SPRINT_FREQ : HEAD_BOB_WALK_FREQ;
      const speedRatio = Math.min(this.currentSpeed / WALK_SPEED, 1);
      if (this.currentSpeed > 0.1) {
        this.headBobPhase += delta * bobFreq * Math.PI * 2;
        corrected.y += Math.sin(this.headBobPhase) * HEAD_BOB_AMP * speedRatio;
      } else {
        this.headBobPhase = 0;
      }

      this.camera.position.copy(corrected);
    }

    // Phase 1: Photo mode bloom override — reduced from 1.5 to 0.7
    if (this.currentSpeed < 0.01) {
      this.photoModeIdleTime += delta;
      if (this.photoModeIdleTime > 2.0 && !this.photoModeActive && this.qualityTier !== 'low') {
        this.photoModeActive = true;
        if (this.bloomPass) {
          this.bloomPass.enabled = true;
          this.bloomPass.strength = 0.7;
        }
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * 1.0);
        if (this.vignettePass) {
          this.vignettePass.enabled = true;
          if (this.vignettePass.uniforms["uDarkness"]) {
            this.vignettePass.uniforms["uDarkness"].value = 0.6;
          }
        }
        this.onPhotoModeChange?.(true);
      }
    } else {
      this.photoModeIdleTime = 0;
      if (this.photoModeActive) {
        this.photoModeActive = false;
        if (this.bloomPass) {
          this.bloomPass.enabled = this.qualityConfig.bloom.enabled;
          this.bloomPass.strength = this.qualityConfig.bloom.strength;
        }
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.qualityConfig.renderScale);
        if (this.vignettePass) {
          this.vignettePass.enabled = this.qualityConfig.vignette.enabled;
          if (this.vignettePass.uniforms["uDarkness"]) {
            this.vignettePass.uniforms["uDarkness"].value = this.qualityConfig.vignette.darkness;
          }
        }
        this.onPhotoModeChange?.(false);
      }
    }

    // Phase 1: Neon pulse — reduced from 2.0+sin*1.0 to 1.2+sin*0.4
    this.neonMeshes.forEach((mesh, i) => {
      const mat = mesh.material as THREE.Material & { opacity?: number; emissiveIntensity?: number };
      if ("emissiveIntensity" in mat) {
        mat.emissiveIntensity = 1.2 + Math.sin(time * 2 + i * 0.5) * 0.4;
      }
      if (mat.opacity !== undefined) {
        mat.opacity = 0.5 + Math.sin(time * 2 + i * 0.5) * 0.3;
      }
    });

    // Phase 1: Hologram pulse — reduced from 1.5+sin*0.8 to 0.8+sin*0.4
    this.hologramMeshes.forEach((mesh, i) => {
      mesh.rotation.y = time * 0.5 + i;
      const mat = mesh.material as THREE.Material & { emissiveIntensity?: number };
      if ("emissiveIntensity" in mat) {
        mat.emissiveIntensity = 0.8 + Math.sin(time * 3 + i) * 0.4;
      }
      if (mesh.geometry.type === "OctahedronGeometry") {
        mesh.position.y = 2.5 + Math.sin(time * 1.5 + i) * 0.15;
        mesh.rotation.x = time * 0.3;
      }
    });

    if (this.floatingParticles) {
      const pos = this.floatingParticles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setY(i, y + Math.sin(time + i * 0.1) * 0.002);
        const x = pos.getX(i);
        pos.setX(i, x + Math.cos(time * 0.5 + i * 0.05) * 0.001);
      }
      pos.needsUpdate = true;
    }

    if (this.rainParticles) {
      const rPos = this.rainParticles.geometry.attributes.position;
      for (let i = 0; i < rPos.count; i++) {
        let y = rPos.getY(i);
        y -= 8 * delta;
        if (y < -5) y = 25 + Math.random() * 5;
        rPos.setY(i, y);
      }
      rPos.needsUpdate = true;
    }

    if (this.qualityConfig.cityLightFlicker) {
      for (const inst of this.windowInstances) {
        if (Math.random() > 0.97) {
          const baseColor = inst.userData.baseColor as THREE.Color;
          const idx = Math.floor(Math.random() * inst.count);
          const brightness = 0.1 + Math.random() * 0.7;
          const flickered = baseColor.clone().multiplyScalar(brightness);
          inst.setColorAt(idx, flickered);
          inst.instanceColor!.needsUpdate = true;
        }
      }
    }

    let closestHotspot: Hotspot | null = null;
    let closestDist = Infinity;
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    for (const hotspot of HOTSPOTS) {
      const dx = camX - hotspot.position.x;
      const dz = camZ - hotspot.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < hotspot.radius && dist < closestDist) {
        closestDist = dist;
        closestHotspot = hotspot;
      }
    }

    const fwd = new THREE.Vector3(0, 0, -1);
    fwd.applyQuaternion(this.camera.quaternion);
    fwd.normalize();
    for (const hotspot of HOTSPOTS) {
      const toHotspot = new THREE.Vector3(
        hotspot.position.x - camX,
        0,
        hotspot.position.z - camZ
      );
      const projDist = toHotspot.dot(new THREE.Vector3(fwd.x, 0, fwd.z).normalize());
      if (projDist > 0 && projDist < 5) {
        const crossDist = Math.sqrt(toHotspot.lengthSq() - projDist * projDist);
        if (crossDist < 1.5 && projDist < closestDist) {
          closestDist = projDist;
          closestHotspot = hotspot;
        }
      }
    }

    if (closestHotspot !== this.activeHotspot) {
      this.activeHotspot = closestHotspot;
      this.onHotspotChange?.(closestHotspot);
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  async loadSampleGLB() {
    try {
      const gltf = await this.assetLoader.loadGLB("/models/sample-room.glb");
      this.sampleGLBGroup = new THREE.Group();
      this.sampleGLBGroup.add(gltf.scene);
      this.sampleGLBGroup.position.set(5, 0.05, -4);
      this.sampleGLBGroup.scale.set(0.6, 0.6, 0.6);

      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
            mat.emissiveIntensity = 2.0;
            mat.toneMapped = false;
          }
        }
      });

      this.scene.add(this.sampleGLBGroup);
    } catch (_err) {
      // GLB load is optional; scene works without it
    }
  }

  animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    this.update();
  };

  start() {
    this.animate();
  }

  setQuality(tier: QualityTier) {
    this.qualityTier = tier;
    this.qualityConfig = QUALITY_PRESETS[tier];

    this.photoModeActive = false;
    this.photoModeIdleTime = 0;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.qualityConfig.renderScale);

    this.renderer.toneMappingExposure = this.qualityConfig.toneMapping.exposure;

    this.renderer.shadowMap.enabled = this.qualityConfig.shadows.enabled;

    if (this.bloomPass) {
      this.bloomPass.enabled = this.qualityConfig.bloom.enabled;
      this.bloomPass.strength = this.qualityConfig.bloom.strength;
      this.bloomPass.radius = this.qualityConfig.bloom.radius;
      this.bloomPass.threshold = this.qualityConfig.bloom.threshold;
    }

    if (this.vignettePass) {
      this.vignettePass.enabled = this.qualityConfig.vignette.enabled;
      if (this.vignettePass.uniforms["uDarkness"]) {
        this.vignettePass.uniforms["uDarkness"].value = this.qualityConfig.vignette.darkness;
      }
    }

    if (this.chromaticPass) {
      this.chromaticPass.enabled = this.qualityConfig.chromaticAberration.enabled;
      if (this.chromaticPass.uniforms["uOffset"]) {
        this.chromaticPass.uniforms["uOffset"].value = this.qualityConfig.chromaticAberration.offset;
      }
    }

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.composer?.setSize(w, h);

    this.onQualityChange?.(tier);
  }

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = undefined;
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
    window.removeEventListener("resize", this.onResize);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.dispose();
        if (obj.material.map) obj.material.map.dispose();
      }
    });

    if (this.floatingParticles) {
      this.floatingParticles.geometry.dispose();
      (this.floatingParticles.material as THREE.PointsMaterial).dispose();
    }
    if (this.rainParticles) {
      this.rainParticles.geometry.dispose();
      (this.rainParticles.material as THREE.PointsMaterial).dispose();
    }

    // Dispose procedural textures
    if (this.proceduralTextures) {
      this.proceduralTextures.floorMap.dispose();
      this.proceduralTextures.floorRoughness.dispose();
      this.proceduralTextures.ceilingMap.dispose();
    }

    this.assetLoader.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }
}
