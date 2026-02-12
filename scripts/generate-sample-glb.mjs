import { writeFileSync, mkdirSync } from "fs";

function buildGLB() {
  const gltf = {
    asset: { version: "2.0", generator: "cyberpunk-portfolio-pipeline" },
    scene: 0,
    scenes: [{ name: "SampleRoom", nodes: [0, 1, 2, 3] }],
    nodes: [
      { name: "floor", mesh: 0, translation: [0, -0.05, 0] },
      { name: "pedestal", mesh: 1, translation: [0, 0.4, 0] },
      { name: "cyber_orb", mesh: 2, translation: [0, 1.05, 0] },
      { name: "holo_panel", mesh: 3, translation: [0.8, 1.0, 0], rotation: [0, -0.3827, 0, 0.9239] },
    ],
    meshes: [
      { name: "floor_mesh", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] },
      { name: "pedestal_mesh", primitives: [{ attributes: { POSITION: 3, NORMAL: 4 }, indices: 5, material: 1 }] },
      { name: "orb_mesh", primitives: [{ attributes: { POSITION: 6, NORMAL: 7 }, indices: 8, material: 2 }] },
      { name: "panel_mesh", primitives: [{ attributes: { POSITION: 9, NORMAL: 10 }, indices: 11, material: 3 }] },
    ],
    materials: [
      { name: "floor_mat", pbrMetallicRoughness: { baseColorFactor: [0.10, 0.10, 0.18, 1], metallicFactor: 0, roughnessFactor: 0.8 } },
      { name: "pedestal_mat", pbrMetallicRoughness: { baseColorFactor: [0.09, 0.13, 0.24, 1], metallicFactor: 0.6, roughnessFactor: 0.4 } },
      { name: "orb_mat", pbrMetallicRoughness: { baseColorFactor: [0.02, 0.85, 0.91, 1], metallicFactor: 0.8, roughnessFactor: 0.2 }, emissiveFactor: [0.02, 0.85, 0.91] },
      { name: "panel_mat", pbrMetallicRoughness: { baseColorFactor: [1, 0.16, 0.43, 1], metallicFactor: 0, roughnessFactor: 0.3 }, emissiveFactor: [1, 0.16, 0.43], doubleSided: true },
    ],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };

  const bufferParts = [];
  let byteOffset = 0;

  function addAccessor(data, componentType, type, count) {
    const isFloat = componentType === 5126;
    const TypedArray = isFloat ? Float32Array : Uint16Array;
    const arr = new TypedArray(data);
    const bytes = new Uint8Array(arr.buffer);

    const bvIdx = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: byteOffset,
      byteLength: bytes.byteLength,
    });

    const accIdx = gltf.accessors.length;
    const acc = { bufferView: bvIdx, componentType, type, count };
    if (isFloat && type === "VEC3") {
      let minV = [Infinity, Infinity, Infinity];
      let maxV = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < data.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          minV[j] = Math.min(minV[j], data[i + j]);
          maxV[j] = Math.max(maxV[j], data[i + j]);
        }
      }
      acc.min = minV;
      acc.max = maxV;
    }
    gltf.accessors.push(acc);

    bufferParts.push(bytes);
    const padded = (bytes.byteLength + 3) & ~3;
    if (padded > bytes.byteLength) {
      bufferParts.push(new Uint8Array(padded - bytes.byteLength));
    }
    byteOffset += padded;
    return accIdx;
  }

  function box(sx, sy, sz) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const pos = [
      -hx,-hy, hz,  hx,-hy, hz,  hx, hy, hz, -hx, hy, hz,
      -hx,-hy,-hz, -hx, hy,-hz,  hx, hy,-hz,  hx,-hy,-hz,
      -hx, hy,-hz, -hx, hy, hz,  hx, hy, hz,  hx, hy,-hz,
      -hx,-hy,-hz,  hx,-hy,-hz,  hx,-hy, hz, -hx,-hy, hz,
       hx,-hy,-hz,  hx, hy,-hz,  hx, hy, hz,  hx,-hy, hz,
      -hx,-hy,-hz, -hx,-hy, hz, -hx, hy, hz, -hx, hy,-hz,
    ];
    const nor = [
      0,0,1, 0,0,1, 0,0,1, 0,0,1,
      0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
      0,1,0, 0,1,0, 0,1,0, 0,1,0,
      0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
      1,0,0, 1,0,0, 1,0,0, 1,0,0,
      -1,0,0, -1,0,0, -1,0,0, -1,0,0,
    ];
    const idx = [];
    for (let f = 0; f < 6; f++) {
      const o = f * 4;
      idx.push(o, o+1, o+2, o, o+2, o+3);
    }
    return { pos, nor, idx, vertCount: 24, triCount: 12 };
  }

  function cylinder(rTop, rBot, h, segs) {
    const pos = [], nor = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(c * rTop, h / 2, s * rTop);
      nor.push(c, 0, s);
      pos.push(c * rBot, -h / 2, s * rBot);
      nor.push(c, 0, s);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
    const topCenter = pos.length / 3;
    pos.push(0, h / 2, 0); nor.push(0, 1, 0);
    const botCenter = pos.length / 3;
    pos.push(0, -h / 2, 0); nor.push(0, -1, 0);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const na = ((i + 1) / segs) * Math.PI * 2;
      const ci = pos.length / 3;
      pos.push(Math.cos(a) * rTop, h / 2, Math.sin(a) * rTop); nor.push(0, 1, 0);
      pos.push(Math.cos(na) * rTop, h / 2, Math.sin(na) * rTop); nor.push(0, 1, 0);
      idx.push(topCenter, ci, ci + 1);
      const bi = pos.length / 3;
      pos.push(Math.cos(na) * rBot, -h / 2, Math.sin(na) * rBot); nor.push(0, -1, 0);
      pos.push(Math.cos(a) * rBot, -h / 2, Math.sin(a) * rBot); nor.push(0, -1, 0);
      idx.push(botCenter, bi, bi + 1);
    }
    return { pos, nor, idx, vertCount: pos.length / 3, triCount: idx.length / 3 };
  }

  function icosphere(radius, subdivisions) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      -1, t, 0,  1, t, 0, -1,-t, 0,  1,-t, 0,
       0,-1, t,  0, 1, t,  0,-1,-t,  0, 1,-t,
       t, 0,-1,  t, 0, 1, -t, 0,-1, -t, 0, 1,
    ];
    let faces = [
      0,11,5, 0,5,1, 0,1,7, 0,7,10, 0,10,11,
      1,5,9, 5,11,4, 11,10,2, 10,7,6, 7,1,8,
      3,9,4, 3,4,2, 3,2,6, 3,6,8, 3,8,9,
      4,9,5, 2,4,11, 6,2,10, 8,6,7, 9,8,1,
    ];
    const midCache = {};
    function midpoint(a, b) {
      const key = Math.min(a, b) + "_" + Math.max(a, b);
      if (midCache[key] !== undefined) return midCache[key];
      const mx = (verts[a*3] + verts[b*3]) / 2;
      const my = (verts[a*3+1] + verts[b*3+1]) / 2;
      const mz = (verts[a*3+2] + verts[b*3+2]) / 2;
      const idx = verts.length / 3;
      verts.push(mx, my, mz);
      midCache[key] = idx;
      return idx;
    }
    for (let s = 0; s < subdivisions; s++) {
      const newFaces = [];
      for (let i = 0; i < faces.length; i += 3) {
        const a = faces[i], b = faces[i+1], c = faces[i+2];
        const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        newFaces.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
      }
      faces = newFaces;
    }
    for (let i = 0; i < verts.length; i += 3) {
      const l = Math.sqrt(verts[i]**2 + verts[i+1]**2 + verts[i+2]**2);
      verts[i] = verts[i] / l * radius;
      verts[i+1] = verts[i+1] / l * radius;
      verts[i+2] = verts[i+2] / l * radius;
    }
    const normals = [];
    for (let i = 0; i < verts.length; i += 3) {
      const l = Math.sqrt(verts[i]**2 + verts[i+1]**2 + verts[i+2]**2);
      normals.push(verts[i]/l, verts[i+1]/l, verts[i+2]/l);
    }
    return { pos: verts, nor: normals, idx: faces, vertCount: verts.length / 3, triCount: faces.length / 3 };
  }

  function plane(w, h) {
    const hw = w / 2, hh = h / 2;
    const pos = [-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0];
    const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const idx = [0, 1, 2, 0, 2, 3];
    return { pos, nor, idx, vertCount: 4, triCount: 2 };
  }

  const floorData = box(4, 0.1, 4);
  addAccessor(floorData.pos, 5126, "VEC3", floorData.vertCount);
  addAccessor(floorData.nor, 5126, "VEC3", floorData.vertCount);
  addAccessor(floorData.idx, 5123, "SCALAR", floorData.idx.length);

  const pedData = cylinder(0.3, 0.35, 0.8, 8);
  addAccessor(pedData.pos, 5126, "VEC3", pedData.vertCount);
  addAccessor(pedData.nor, 5126, "VEC3", pedData.vertCount);
  addAccessor(pedData.idx, 5123, "SCALAR", pedData.idx.length);

  const orbData = icosphere(0.25, 1);
  addAccessor(orbData.pos, 5126, "VEC3", orbData.vertCount);
  addAccessor(orbData.nor, 5126, "VEC3", orbData.vertCount);
  addAccessor(orbData.idx, 5123, "SCALAR", orbData.idx.length);

  const panelData = plane(0.6, 0.4);
  addAccessor(panelData.pos, 5126, "VEC3", panelData.vertCount);
  addAccessor(panelData.nor, 5126, "VEC3", panelData.vertCount);
  addAccessor(panelData.idx, 5123, "SCALAR", panelData.idx.length);

  const binBuffer = Buffer.concat(bufferParts.map(b => Buffer.from(b.buffer, b.byteOffset, b.byteLength)));
  gltf.buffers.push({ byteLength: binBuffer.byteLength });

  const jsonStr = JSON.stringify(gltf);
  const jsonPadded = jsonStr + " ".repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBuf = Buffer.from(jsonPadded, "utf8");

  const binPadded = binBuffer.byteLength % 4 === 0 ? binBuffer : Buffer.concat([binBuffer, Buffer.alloc((4 - (binBuffer.byteLength % 4)) % 4)]);

  const totalLength = 12 + 8 + jsonBuf.byteLength + 8 + binPadded.byteLength;
  const glb = Buffer.alloc(totalLength);
  let off = 0;

  glb.writeUInt32LE(0x46546C67, off); off += 4;
  glb.writeUInt32LE(2, off); off += 4;
  glb.writeUInt32LE(totalLength, off); off += 4;

  glb.writeUInt32LE(jsonBuf.byteLength, off); off += 4;
  glb.writeUInt32LE(0x4E4F534A, off); off += 4;
  jsonBuf.copy(glb, off); off += jsonBuf.byteLength;

  glb.writeUInt32LE(binPadded.byteLength, off); off += 4;
  glb.writeUInt32LE(0x004E4942, off); off += 4;
  binPadded.copy(glb, off);

  mkdirSync("client/public/models", { recursive: true });
  writeFileSync("client/public/models/sample-room.glb", glb);
  console.log(`sample-room.glb written (${glb.byteLength} bytes)`);
}

buildGLB();
