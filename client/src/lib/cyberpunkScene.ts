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

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.darkNavy);
    this.scene.fog = new THREE.FogExp2(COLORS.darkNavy, 0.012);
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

  buildApartment() {
    const roomWidth = 20;
    const roomDepth = 24;
    const roomHeight = 4;

    // TODO: Future – replace flat color with baked lightmap texture (KTX2)
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: COLORS.darkFloor,
      roughness: 0.3,
      metalness: 0.6,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const gridHelper = new THREE.GridHelper(roomWidth, 40, 0x1a1f3a, 0x0f1225);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    const ceilingGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: COLORS.ceilingDark,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight;
    this.scene.add(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({
      color: COLORS.wallDark,
      roughness: 0.7,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomHeight),
      wallMat
    );
    backWall.position.set(0, roomHeight / 2, -roomDepth / 2);
    this.scene.add(backWall);

    const frontWallLeft = new THREE.Mesh(
      new THREE.PlaneGeometry(5, roomHeight),
      wallMat
    );
    frontWallLeft.position.set(-7.5, roomHeight / 2, roomDepth / 2);
    frontWallLeft.rotation.y = Math.PI;
    this.scene.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(
      new THREE.PlaneGeometry(5, roomHeight),
      wallMat
    );
    frontWallRight.position.set(7.5, roomHeight / 2, roomDepth / 2);
    frontWallRight.rotation.y = Math.PI;
    this.scene.add(frontWallRight);

    const frontWallTop = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 1),
      wallMat
    );
    frontWallTop.position.set(0, roomHeight - 0.5, roomDepth / 2);
    frontWallTop.rotation.y = Math.PI;
    this.scene.add(frontWallTop);

    const windowGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 3),
      new THREE.MeshPhysicalMaterial({
        color: 0x0a1428,
        transparent: true,
        opacity: 0.15,
        roughness: 0,
        metalness: 0.1,
        transmission: 0.9,
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

    const leftWallGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(roomDepth, roomHeight),
      new THREE.MeshPhysicalMaterial({
        color: 0x0a1428,
        transparent: true,
        opacity: 0.1,
        roughness: 0,
        metalness: 0.1,
        transmission: 0.9,
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
      wallMat
    );
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    this.addNeonStrips(roomWidth, roomDepth, roomHeight);
    this.addFurniture();
  }

  addNeonStrips(w: number, d: number, h: number) {
    const neonCyanMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.cyan,
      emissiveIntensity: 3.0,
      toneMapped: false,
    });
    const neonPinkMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: COLORS.hotPink,
      emissiveIntensity: 3.0,
      toneMapped: false,
    });

    const strips: { pos: [number, number, number]; size: [number, number, number]; mat: THREE.Material }[] = [
      { pos: [-w / 2 + 0.05, h - 0.1, 0], size: [0.03, 0.03, d], mat: neonCyanMat },
      { pos: [w / 2 - 0.05, h - 0.1, 0], size: [0.03, 0.03, d], mat: neonPinkMat },
      { pos: [0, h - 0.05, -d / 2 + 0.05], size: [w, 0.03, 0.03], mat: neonCyanMat },
      { pos: [0, 0.05, -d / 2 + 0.05], size: [w, 0.03, 0.03], mat: neonPinkMat },
      { pos: [0, h - 0.05, d / 2 - 0.05], size: [w, 0.03, 0.03], mat: neonPinkMat },
      { pos: [-w / 2 + 0.05, 0.05, 0], size: [0.03, 0.03, d], mat: neonPinkMat },
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
      roughness: 0.6,
      metalness: 0.4,
    });

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.2), metalMat);
    deskTop.position.set(7, 0.85, -10);
    deskTop.castShadow = true;
    this.scene.add(deskTop);

    const legGeo = new THREE.BoxGeometry(0.05, 0.85, 0.05);
    [[-1.4, -10.5], [1.4, -10.5], [-1.4, -9.5], [1.4, -9.5]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(7 + x, 0.425, z);
      this.scene.add(leg);
    });

    const monitorStand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), metalMat);
    monitorStand.position.set(7, 1.15, -10.3);
    this.scene.add(monitorStand);

    const monitorScreen = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1, 0.05),
      new THREE.MeshBasicMaterial({ color: COLORS.deepBlue })
    );
    monitorScreen.position.set(7, 1.65, -10.4);
    this.scene.add(monitorScreen);

    const screenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: COLORS.cyan,
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 0.5,
        toneMapped: false,
      })
    );
    screenGlow.position.set(7, 1.65, -10.37);
    this.scene.add(screenGlow);
    this.hologramMeshes.push(screenGlow);

    const couchBase = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 1.5), darkMat);
    couchBase.position.set(-5, 0.35, 3);
    this.scene.add(couchBase);
    const couchBack = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 0.2), darkMat);
    couchBack.position.set(-5, 0.75, 2.3);
    this.scene.add(couchBack);

    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 1), metalMat);
    tableTop.position.set(-5, 0.45, 5.5);
    this.scene.add(tableTop);
    [[-0.9, 5], [0.9, 5], [-0.9, 6], [0.9, 6]].forEach(([x, z]) => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), metalMat);
      tl.position.set(-5 + x, 0.225, z);
      this.scene.add(tl);
    });

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x151830,
      metalness: 0.7,
      roughness: 0.3,
    });
    for (let y = 1; y <= 3; y += 0.7) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.5), shelfMat);
      shelf.position.set(8, y, 0);
      this.scene.add(shelf);
    }
  }

  addLighting() {
    const ambient = new THREE.AmbientLight(0x050810, 0.5);
    this.scene.add(ambient);

    const shadowsEnabled = this.qualityConfig.shadows.enabled;
    const shadowMapSize = this.qualityConfig.shadows.mapSize;
    const maxCasters = this.qualityConfig.shadows.casterCount;
    let casterIndex = 0;

    const cyanPoint = new THREE.PointLight(COLORS.cyan, 3, 20);
    cyanPoint.position.set(-8, 3, 5);
    if (shadowsEnabled && casterIndex < maxCasters) {
      cyanPoint.castShadow = true;
      cyanPoint.shadow.mapSize.width = shadowMapSize;
      cyanPoint.shadow.mapSize.height = shadowMapSize;
      casterIndex++;
    }
    this.scene.add(cyanPoint);
    this.shadowCastingLights.push(cyanPoint);

    const pinkPoint = new THREE.PointLight(COLORS.hotPink, 3, 20);
    pinkPoint.position.set(8, 3, -5);
    if (shadowsEnabled && casterIndex < maxCasters) {
      pinkPoint.castShadow = true;
      pinkPoint.shadow.mapSize.width = shadowMapSize;
      pinkPoint.shadow.mapSize.height = shadowMapSize;
      casterIndex++;
    }
    this.scene.add(pinkPoint);
    this.shadowCastingLights.push(pinkPoint);

    const purplePoint = new THREE.PointLight(COLORS.purple, 2, 15);
    purplePoint.position.set(0, 3.5, 0);
    this.scene.add(purplePoint);

    const amberSpot = new THREE.SpotLight(COLORS.amber, 2, 10, Math.PI / 6, 0.5);
    amberSpot.position.set(7, 3.5, -10);
    amberSpot.target.position.set(7, 0, -10);
    this.scene.add(amberSpot);
    this.scene.add(amberSpot.target);

    const windowLight = new THREE.RectAreaLight(COLORS.cyan, 1.5, 10, 3);
    windowLight.position.set(0, 2, 12.5);
    windowLight.lookAt(0, 2, 0);
    this.scene.add(windowLight);

    const leftWindowLight = new THREE.RectAreaLight(COLORS.hotPink, 0.8, 24, 4);
    leftWindowLight.position.set(-10.5, 2, 0);
    leftWindowLight.lookAt(0, 2, 0);
    this.scene.add(leftWindowLight);

    this.addLightCones();
  }

  addLightCones() {
    const coneMat1 = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(5, 3, 16, 1, true), coneMat1);
    cone1.position.set(-8, 1.5, 5);
    cone1.rotation.x = Math.PI;
    this.scene.add(cone1);
    this.lightCones.push(cone1);

    const coneMat2 = new THREE.MeshBasicMaterial({
      color: COLORS.hotPink,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(5, 3, 16, 1, true), coneMat2);
    cone2.position.set(8, 1.5, -5);
    cone2.rotation.x = Math.PI;
    this.scene.add(cone2);
    this.lightCones.push(cone2);

    const coneMat3 = new THREE.MeshBasicMaterial({
      color: COLORS.amber,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone3 = new THREE.Mesh(new THREE.ConeGeometry(2, 3, 16, 1, true), coneMat3);
    cone3.position.set(7, 2, -10);
    cone3.rotation.x = Math.PI;
    this.scene.add(cone3);
    this.lightCones.push(cone3);
  }

  buildCityscape() {
    const cityGroup = new THREE.Group();

    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x060918,
      roughness: 0.8,
      metalness: 0.3,
    });

    const windowGeo = new THREE.PlaneGeometry(0.3, 0.4);
    const colorBuckets: { color: number; transforms: { pos: THREE.Vector3; rotY: number; opacity: number }[] }[] = [
      { color: COLORS.hotPink, transforms: [] },
      { color: COLORS.cyan, transforms: [] },
      { color: COLORS.amber, transforms: [] },
    ];

    for (let i = 0; i < 80; i++) {
      const w = 1 + Math.random() * 3;
      const h = 3 + Math.random() * 25;
      const d = 1 + Math.random() * 3;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        buildingMat
      );

      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      building.position.set(
        Math.sin(angle) * dist,
        h / 2 - 5,
        Math.cos(angle) * dist
      );
      cityGroup.add(building);

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
              opacity: 0.2 + Math.random() * 0.6,
            });
          }
        }
      }
    }

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

    for (let i = 0; i < 15; i++) {
      const signW = 1 + Math.random() * 2;
      const signH = 0.5 + Math.random() * 1;
      const signColor = [COLORS.hotPink, COLORS.cyan, COLORS.amber, COLORS.purple][
        Math.floor(Math.random() * 4)
      ];
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
      const angle = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 20;
      sign.position.set(
        Math.sin(angle) * dist,
        2 + Math.random() * 12,
        Math.cos(angle) * dist
      );
      sign.lookAt(0, sign.position.y, 0);
      cityGroup.add(sign);
      this.neonMeshes.push(sign);
    }

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
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
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
      size: 0.06,
      color: 0x8899bb,
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

    if (this.currentSpeed < 0.01) {
      this.photoModeIdleTime += delta;
      if (this.photoModeIdleTime > 2.0 && !this.photoModeActive && this.qualityTier !== 'low') {
        this.photoModeActive = true;
        if (this.bloomPass) {
          this.bloomPass.enabled = true;
          this.bloomPass.strength = 1.5;
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

    this.neonMeshes.forEach((mesh, i) => {
      const mat = mesh.material as THREE.Material & { opacity?: number; emissiveIntensity?: number };
      if ("emissiveIntensity" in mat) {
        mat.emissiveIntensity = 2.0 + Math.sin(time * 2 + i * 0.5) * 1.0;
      }
      if (mat.opacity !== undefined) {
        mat.opacity = 0.5 + Math.sin(time * 2 + i * 0.5) * 0.3;
      }
    });

    this.hologramMeshes.forEach((mesh, i) => {
      mesh.rotation.y = time * 0.5 + i;
      const mat = mesh.material as THREE.Material & { emissiveIntensity?: number };
      if ("emissiveIntensity" in mat) {
        mat.emissiveIntensity = 1.5 + Math.sin(time * 3 + i) * 0.8;
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
