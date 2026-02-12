import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "meshoptimizer";

export interface AssetLoaderOptions {
  dracoDecoderPath?: string;
  ktx2TranscoderPath?: string;
  renderer?: THREE.WebGLRenderer;
}

export interface LoadProgress {
  loaded: number;
  total: number;
  fraction: number;
}

export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private dracoLoader: DRACOLoader;
  private ktx2Loader: KTX2Loader | null = null;
  private cache = new Map<string, GLTF>();

  constructor(options: AssetLoaderOptions = {}) {
    const dracoPath = options.dracoDecoderPath ?? "/draco/";
    const ktx2Path = options.ktx2TranscoderPath ?? "/basis/";

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(dracoPath);
    this.dracoLoader.preload();

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    if (options.renderer) {
      this.initKTX2(ktx2Path, options.renderer);
    }
  }

  initKTX2(path: string, renderer: THREE.WebGLRenderer) {
    this.ktx2Loader = new KTX2Loader();
    this.ktx2Loader.setTranscoderPath(path);
    this.ktx2Loader.detectSupport(renderer);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
  }

  async loadGLB(
    url: string,
    onProgress?: (progress: LoadProgress) => void
  ): Promise<GLTF> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    return new Promise<GLTF>((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf);
          resolve(gltf);
        },
        (event) => {
          if (onProgress && event.lengthComputable) {
            onProgress({
              loaded: event.loaded,
              total: event.total,
              fraction: event.loaded / event.total,
            });
          }
        },
        (error) => {
          reject(new Error(`Failed to load GLB: ${url} – ${error}`));
        }
      );
    });
  }

  static createInstances(
    sourceMesh: THREE.Mesh,
    transforms: { position: THREE.Vector3; rotation?: THREE.Euler; scale?: THREE.Vector3 }[]
  ): THREE.InstancedMesh {
    const geo = sourceMesh.geometry;
    const mat = sourceMesh.material as THREE.Material;
    const instanced = new THREE.InstancedMesh(geo, mat, transforms.length);
    const dummy = new THREE.Object3D();

    transforms.forEach((t, i) => {
      dummy.position.copy(t.position);
      if (t.rotation) dummy.rotation.copy(t.rotation);
      if (t.scale) dummy.scale.copy(t.scale);
      else dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    });

    instanced.instanceMatrix.needsUpdate = true;
    return instanced;
  }

  static setupLOD(
    levels: { mesh: THREE.Object3D; distance: number }[]
  ): THREE.LOD {
    const lod = new THREE.LOD();
    levels.forEach(({ mesh, distance }) => {
      lod.addLevel(mesh, distance);
    });
    return lod;
  }

  dispose() {
    this.dracoLoader.dispose();
    this.ktx2Loader?.dispose();
    this.cache.clear();
  }
}
