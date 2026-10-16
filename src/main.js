// Downshaft: the ledges rise toward a ceiling of spikes. Keep dropping down, don't fall into the dark.
import * as THREE from 'three';
import { buildHuman, styleFor } from './character.js';
import * as startng from './startng.js';

// ---- tuning (metres, seconds)
const HW = 4.5; // half the shaft's width
const CEIL_Y = 7.2; // where the spike tips are
const DEATH_Y = -9.6; // below the bottom of the screen
const VIEW_HALF_H = 8.3;
const VIEW_HALF_W = 5.5;
const SCALE = 0.95; // the character, about 1.65 m tall here
const HEAD = 1.72 * SCALE;
const R = 0.26; // the player's half width, for standing on edges
const MAX_HP = 10;
const RUN = 6.4;
const GRAVITY = 28;
const TERMINAL = 17;
const SPRING_V = 12;
const CONVEYOR_V = 2.8;
const PLAT_H = 0.36;
const PLAT_D = 1.8;
const DAMAGE = 4;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: fine */ }
}

// ---- renderer, scene, camera
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0a0e');
scene.fog = new THREE.Fog('#0b0a0e', 20, 40);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
const camBase = new THREE.Vector3();
function fit() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(VIEW_HALF_H / t, VIEW_HALF_W / (t * camera.aspect));
  camBase.set(0, 0.9, dist);
  camera.position.copy(camBase);
  camera.lookAt(0, -0.2, 0);
  camera.updateProjectionMatrix();
  scene.fog.near = dist - 2;
  scene.fog.far = dist + 16;
}
addEventListener('resize', fit);
fit();

// ---- lights
scene.add(new THREE.HemisphereLight('#a9b6ff', '#1c1022', 0.75));
const key = new THREE.DirectionalLight('#fff3e2', 2.4);
key.position.set(3, 10, 12);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 11, bottom: -12, near: 1, far: 40 });
key.shadow.bias = -0.0005;
scene.add(key);
const ceilingGlow = new THREE.PointLight('#ff3048', 40, 9, 2);
ceilingGlow.position.set(0, CEIL_Y - 0.6, 1.6);
scene.add(ceilingGlow);
const lamp = new THREE.PointLight('#ffe9c4', 10, 7, 2);
scene.add(lamp);

// ---- textures (drawn, so there's nothing to download)
function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function speckle(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

function drawBricks(g, w, h) {
  g.fillStyle = '#17141c';
  g.fillRect(0, 0, w, h);
  const rows = 8;
  const bh = h / rows;
  const bw = w / 4;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let c = -1; c < 5; c++) {
      const l = 22 + Math.random() * 14;
      g.fillStyle = `hsl(${250 + Math.random() * 25}, ${10 + Math.random() * 8}%, ${l}%)`;
      g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, bh - 6);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(c * bw + off + 3, r * bh + 3, bw - 6, 3);
    }
  }
  speckle(g, w, h, 2500, 0.12);
}
const wallTex = canvasTexture(256, 256, drawBricks, 7, 9);
const sideTex = canvasTexture(256, 256, drawBricks, 1, 9);

const stoneTex = canvasTexture(256, 64, (g, w, h) => {
  g.fillStyle = '#8a92a4';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1800, 0.25);
  g.strokeStyle = 'rgba(30,30,40,0.35)';
  g.lineWidth = 2;
  for (let x = 64; x < w; x += 64) {
    g.beginPath();
    g.moveTo(x + rand(-6, 6), 0);
    g.lineTo(x + rand(-6, 6), h);
    g.stroke();
  }
});

const crackTex = canvasTexture(128, 64, (g, w, h) => {
  g.fillStyle = '#6d58a8';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 900, 0.25);
  g.strokeStyle = 'rgba(20,10,40,0.8)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    let x = rand(0, w);
    let y = 0;
    g.beginPath();
    g.moveTo(x, y);
    while (y < h) {
      x += rand(-12, 12);
      y += rand(6, 14);
      g.lineTo(x, y);
    }
    g.stroke();
  }
});

const BELT_TILE = 0.9; // metres per chevron
const beltTex = canvasTexture(128, 64, (g, w, h) => {
  g.fillStyle = '#10262d';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#5ee7ff';
  g.beginPath();
  g.moveTo(30, 6);
  g.lineTo(70, h / 2);
  g.lineTo(30, h - 6);
  g.lineTo(52, h - 6);
  g.lineTo(92, h / 2);
  g.lineTo(52, 6);
  g.closePath();
  g.fill();
}, 2.7 / BELT_TILE, 1);

// ---- the shaft: back wall, side walls, ceiling of spikes
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(2 * HW + 2.4, 45), wallMat);
backWall.position.set(0, -2, -1.9);
backWall.receiveShadow = true;
scene.add(backWall);

const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95, color: '#c9c3d6' });
for (const side of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 45, 7), sideMat);
  wall.position.set(side * (HW + 0.6), -2, 1.6);
  wall.receiveShadow = true;
  scene.add(wall);
  // a strip of hazard light down each wall edge
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 45, 0.06), new THREE.MeshBasicMaterial({ color: '#3a2f4a' }));
  strip.position.set(side * HW, -2, 5.1);
  scene.add(strip);
}

const metal = new THREE.MeshStandardMaterial({ color: '#c9ccd6', metalness: 0.85, roughness: 0.28 });
const darkMetal = new THREE.MeshStandardMaterial({ color: '#2a2833', metalness: 0.6, roughness: 0.5 });
const ceiling = new THREE.Group();
const ceilingSlab = new THREE.Mesh(new THREE.BoxGeometry(2 * HW + 2.4, 1.4, 7), darkMetal);
ceilingSlab.position.set(0, CEIL_Y + 1.45, 1.6);
ceiling.add(ceilingSlab);
const bigSpike = new THREE.ConeGeometry(0.24, 0.8, 6);
bigSpike.rotateX(Math.PI);
const spikeTipMat = new THREE.MeshStandardMaterial({ color: '#ff8090', emissive: '#ff1e3c', emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.3 });
// one instanced mesh per material keeps the ceiling to two draw calls
const spikeSpots = [[], [], []];
for (let row = 0; row < 3; row++) {
  for (let x = -HW + 0.2; x <= HW - 0.1; x += 0.45) spikeSpots[row].push([x + (row === 1 ? 0.225 : 0), CEIL_Y + 0.4, -1.2 + row * 1.1]);
}
const dummy = new THREE.Object3D();
function instanced(geo, material, spots) {
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  spots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  return mesh;
}
ceiling.add(instanced(bigSpike, metal, [...spikeSpots[0], ...spikeSpots[2]]));
ceiling.add(instanced(bigSpike, spikeTipMat, spikeSpots[1]));
const warn = new THREE.Mesh(new THREE.BoxGeometry(2 * HW, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: '#ff3048' }));
warn.position.set(0, CEIL_Y + 0.78, 0.95);
ceiling.add(warn);
scene.add(ceiling);

// ---- floating dust, drifting up as the shaft scrolls
const DUST = 260;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3] = rand(-HW, HW);
  dustPos[i * 3 + 1] = rand(DEATH_Y, CEIL_Y + 1);
  dustPos[i * 3 + 2] = rand(-1.6, 3);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#b9b2d6', size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
scene.add(dust);

// ---- bursts of sparks and grit
const SPARKS = 320;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARKS * 3).fill(-999);
const sparkCol = new Float32Array(SPARKS * 3);
const sparkVel = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
let sparkNext = 0;
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  size: 0.13, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
sparks.frustumCulled = false;
scene.add(sparks);
const tmpColor = new THREE.Color();

function burst(x, y, color, n = 14, speed = 3, up = 1) {
  tmpColor.set(color);
  for (let k = 0; k < n; k++) {
    const i = sparkNext;
    sparkNext = (sparkNext + 1) % SPARKS;
    sparkPos.set([x + rand(-0.3, 0.3), y + rand(0, 0.15), rand(-0.5, 0.6)], i * 3);
    const a = rand(0, Math.PI);
    sparkVel.set([Math.cos(a) * speed * rand(0.4, 1), Math.sin(a) * speed * up * rand(0.3, 1), rand(-1, 1)], i * 3);
    sparkCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    sparkLife[i] = rand(0.35, 0.7);
  }
}

function updateSparks(dt, rise) {
  for (let i = 0; i < SPARKS; i++) {
    if (sparkLife[i] <= 0) continue;
    sparkLife[i] -= dt;
    if (sparkLife[i] <= 0) {
      sparkPos[i * 3 + 1] = -999;
      continue;
    }
    sparkVel[i * 3 + 1] -= 9 * dt;
    sparkPos[i * 3] += sparkVel[i * 3] * dt;
    sparkPos[i * 3 + 1] += (sparkVel[i * 3 + 1] + rise) * dt;
    sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
    const fade = Math.min(1, sparkLife[i] * 3);
    sparkCol[i * 3] *= 0.97 + 0.03 * fade;
    sparkCol[i * 3 + 1] *= 0.97 + 0.03 * fade;
    sparkCol[i * 3 + 2] *= 0.97 + 0.03 * fade;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

// ---- platforms
const TYPES = {
  normal: { color: '#9aa3b5', w: 2.7 },
  spikes: { color: '#ff4d5e', w: 2.7 },
  conveyor: { color: '#5ee7ff', w: 2.7 },
  spring: { color: '#ffb84d', w: 2.1 },
  crumble: { color: '#b98cff', w: 2.7 },
};
const edgeMats = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 1.1 })]));
const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85 });
const spikeBaseMat = new THREE.MeshStandardMaterial({ color: '#4a2a33', metalness: 0.5, roughness: 0.5 });
const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, emissive: '#5ee7ff', emissiveMap: beltTex, emissiveIntensity: 0.55, roughness: 0.6 });
const springMat = new THREE.MeshStandardMaterial({ color: '#ffb84d', roughness: 0.45, metalness: 0.2 });
const coilMat = new THREE.MeshStandardMaterial({ color: '#d7d9e0', metalness: 0.9, roughness: 0.25 });
const crackMat = new THREE.MeshStandardMaterial({ map: crackTex, roughness: 0.9 });

const slabGeo = new THREE.BoxGeometry(2.7, PLAT_H, PLAT_D);
const springBaseGeo = new THREE.BoxGeometry(2.1, 0.2, PLAT_D);
const springPadGeo = new THREE.BoxGeometry(2.1, 0.16, PLAT_D);
const edgeGeo = new THREE.BoxGeometry(1, 0.06, 0.06);
const smallSpike = new THREE.ConeGeometry(0.12, 0.42, 6);
const coilGeo = new THREE.TorusGeometry(0.2, 0.035, 8, 20);
coilGeo.rotateX(Math.PI / 2);
const rollerGeo = new THREE.CylinderGeometry(PLAT_H / 2 + 0.02, PLAT_H / 2 + 0.02, PLAT_D + 0.04, 14);
rollerGeo.rotateX(Math.PI / 2);
const beltGeo = new THREE.BoxGeometry(2.7 - 0.3, 0.04, PLAT_D - 0.2);
const chunkGeo = new THREE.BoxGeometry(2.7 / 4 - 0.05, PLAT_H, PLAT_D);

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

let platforms = [];

function addPlatform(type, x, y) {
  const { w } = TYPES[type];
  const group = new THREE.Group();
  const p = { type, x, y, prevY: y, w, n: state.spawned++, group, dir: 0, crumble: -1, broken: false, healed: false, bounce: 0, chunks: null, pad: null, rollers: null };

  const edge = new THREE.Mesh(edgeGeo, edgeMats[type]);
  edge.scale.x = w;
  edge.position.set(0, -0.03, PLAT_D / 2 + 0.02);

  if (type === 'normal') {
    const slab = shadowed(new THREE.Mesh(slabGeo, stoneMat));
    slab.position.y = -PLAT_H / 2;
    group.add(slab, edge);
  } else if (type === 'spikes') {
    const slab = shadowed(new THREE.Mesh(slabGeo, spikeBaseMat));
    slab.position.y = -PLAT_H / 2;
    group.add(slab, edge);
    const spots = [];
    for (let row = 0; row < 2; row++) {
      for (let sx = -w / 2 + 0.18; sx < w / 2 - 0.1; sx += 0.3) spots.push([sx + row * 0.15, 0.21, row ? -0.35 : 0.35]);
    }
    group.add(shadowed(instanced(smallSpike, metal, spots)));
  } else if (type === 'conveyor') {
    p.dir = Math.random() < 0.5 ? -1 : 1;
    const slab = shadowed(new THREE.Mesh(slabGeo, darkMetal));
    slab.position.y = -PLAT_H / 2;
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.01;
    if (p.dir < 0) belt.rotation.y = Math.PI; // the same texture, pointing (and moving) the other way
    group.add(slab, belt, edge);
    p.rollers = [-1, 1].map((side) => {
      const r = shadowed(new THREE.Mesh(rollerGeo, coilMat));
      r.position.set(side * (w / 2), -PLAT_H / 2, 0);
      group.add(r);
      return r;
    });
  } else if (type === 'spring') {
    const base = shadowed(new THREE.Mesh(springBaseGeo, darkMetal));
    base.position.y = -0.62;
    group.add(base);
    p.pad = new THREE.Group();
    const pad = shadowed(new THREE.Mesh(springPadGeo, springMat));
    pad.position.y = -0.08;
    p.pad.add(pad, edge);
    group.add(p.pad);
    p.coils = [];
    for (const cx of [-0.6, 0.6]) {
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(coilGeo, coilMat);
        c.position.set(cx, -0.48 + k * 0.13, 0);
        c.castShadow = true;
        group.add(c);
        p.coils.push(c);
      }
    }
  } else if (type === 'crumble') {
    p.chunks = [];
    for (let k = 0; k < 4; k++) {
      const c = shadowed(new THREE.Mesh(chunkGeo, crackMat));
      c.position.set(-w / 2 + (k + 0.5) * (w / 4), -PLAT_H / 2, 0);
      c.userData = { vx: 0, vy: 0, spin: 0, home: c.position.clone() };
      group.add(c);
      p.chunks.push(c);
    }
    group.add(edge);
    p.edge = edge;
  }

  group.position.set(x, y, 0);
  scene.add(group);
  platforms.push(p);
  state.lastType = type;
  state.lastX = x;
  return p;
}

function removePlatform(p) {
  scene.remove(p.group); // geometry and materials are shared, so nothing to dispose
}

function pickType() {
  const n = state.spawned;
  if (n < 5) return n === 3 ? 'conveyor' : 'normal';
  const d = Math.min(1, n / 90);
  const weights = {
    normal: 0.46 - 0.24 * d,
    spikes: state.lastType === 'spikes' ? 0 : 0.11 + 0.13 * d,
    conveyor: 0.16,
    spring: 0.1,
    crumble: 0.1 + 0.1 * d,
  };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [type, wgt] of Object.entries(weights)) {
    if ((r -= wgt) <= 0) return type;
  }
  return 'normal';
}

function pickX(type) {
  const half = HW - TYPES[type].w / 2;
  let x = rand(-half, half);
  for (let i = 0; i < 3 && Math.abs(x - state.lastX) < 1.2; i++) x = rand(-half, half);
  return x;
}

function fill() {
  let low = platforms[platforms.length - 1];
  while (low.y > DEATH_Y - 3) {
    const gap = rand(2.1, 2.9);
    const type = pickType();
    low = addPlatform(type, pickX(type), low.y - gap);
  }
}

function updatePlatform(p, dt) {
  if (p.type === 'conveyor') {
    for (const r of p.rollers) r.rotation.z -= p.dir * (CONVEYOR_V / (PLAT_H / 2)) * dt;
  } else if (p.type === 'spring' && p.bounce > 0) {
    p.bounce = Math.max(0, p.bounce - dt * 2.2);
    const k = Math.sin((1 - p.bounce) * 22) * p.bounce;
    p.pad.position.y = k * 0.22;
    p.coils.forEach((c, i) => (c.scale.y = 1 + k * 0.8 * ((i % 3) + 1) / 3));
  } else if (p.type === 'crumble') {
    if (p.crumble > 0) {
      p.crumble -= dt;
      for (const c of p.chunks) c.position.x = c.userData.home.x + rand(-0.03, 0.03);
      if (p.crumble <= 0) breakPlatform(p);
    } else if (p.broken) {
      for (const c of p.chunks) {
        const u = c.userData;
        u.vy -= GRAVITY * 0.6 * dt;
        c.position.x += u.vx * dt;
        c.position.y += u.vy * dt;
        c.rotation.z += u.spin * dt;
        c.rotation.x += u.spin * 0.5 * dt;
      }
    }
  }
}

function breakPlatform(p) {
  p.broken = true;
  p.edge.visible = false;
  p.chunks.forEach((c, i) => {
    c.userData.vx = (i - 1.5) * rand(0.4, 1.1);
    c.userData.vy = rand(-1, 1);
    c.userData.spin = rand(-5, 5);
  });
  burst(p.x, p.y, TYPES.crumble.color, 18, 2.5, 0.6);
  sfx.crumble();
  if (player.on === p) {
    player.on = null;
    player.vy = 0;
  }
}

// ---- the player
let hero = null;
let heroStyleKey = '';
const heroHolder = new THREE.Group();
heroHolder.scale.setScalar(SCALE);
scene.add(heroHolder);

const LOCAL_GUEST_STYLE = { body: 'male', primaryColor: '#d8fd71', secondaryColor: '#2b2f4a', skinColor: '#8d5524', hairColor: '#17120f', hair: 'short', hat: 'cap', accessory: 'none' };

function setHeroStyle(style) {
  const keyStr = JSON.stringify(style ?? {});
  if (hero && keyStr === heroStyleKey) return;
  heroStyleKey = keyStr;
  if (hero) {
    heroHolder.remove(hero.root);
    hero.dispose();
  }
  hero = buildHuman(style ?? {});
  hero.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  heroHolder.add(hero.root);
}

const player = { x: 0, y: 0, vx: 0, vy: 0, on: null, ignore: null, invuln: 0, facing: 0, dieT: 0, cause: '' };
const state = { mode: 'menu', elapsed: 0, rise: 0, floor: 0, hp: MAX_HP, spawned: 0, lastType: 'normal', lastX: 0, shake: 0 };
const keys = { left: false, right: false };

function reset() {
  platforms.forEach(removePlatform);
  platforms = [];
  Object.assign(state, { elapsed: 0, rise: 0, floor: 0, hp: MAX_HP, spawned: 0, lastType: 'normal', lastX: 0, shake: 0 });
  const start = addPlatform('normal', 0, 0.4);
  start.healed = true;
  Object.assign(player, { x: 0, y: start.y, vx: 0, vy: 0, on: start, ignore: null, invuln: 0, facing: 0, dieT: 0, cause: '' });
  heroHolder.rotation.set(0, 0, 0);
  heroHolder.visible = true;
  fill();
  renderHud();
}

function land(p) {
  player.on = p;
  player.y = p.y;
  const impact = Math.min(1, -player.vy / TERMINAL);
  player.vy = 0;
  if (p.n > state.floor) {
    state.floor = p.n;
    renderHud();
  }
  burst(player.x, p.y, TYPES[p.type].color, 6 + Math.round(impact * 10), 1.5 + impact * 2, 0.7);
  const heal = () => {
    if (p.healed) return;
    p.healed = true;
    if (state.hp < MAX_HP) {
      state.hp++;
      sfx.heal();
      renderHud();
    }
  };
  switch (p.type) {
    case 'spikes':
      hurt('spikes');
      break;
    case 'spring':
      heal();
      p.bounce = 1;
      player.on = null;
      player.vy = SPRING_V;
      sfx.spring();
      break;
    case 'crumble':
      heal();
      sfx.land();
      if (p.crumble < 0) p.crumble = 0.32;
      break;
    case 'conveyor':
      heal();
      sfx.conveyor();
      break;
    default:
      heal();
      sfx.land();
  }
}

function hurt(cause) {
  state.hp = Math.max(0, state.hp - DAMAGE);
  player.invuln = 1;
  state.shake = 0.35;
  hero.hurt();
  const flash = $('hurt');
  flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove('on')));
  burst(player.x, player.y + (cause === 'ceiling' ? HEAD : 0.3), '#ff4d5e', 20, 4, cause === 'ceiling' ? -1 : 1);
  if (cause === 'ceiling') sfx.ceiling();
  else sfx.spikes();
  renderHud();
  if (state.hp <= 0) die(cause);
}

function die(cause) {
  if (state.mode !== 'playing') return;
  state.mode = 'dying';
  player.cause = cause;
  player.dieT = 0;
  player.on = null;
  if (cause !== 'fall') player.vy = 7;
  state.shake = 0.5;
  sfx.die();
}

function stepPlaying(dt) {
  state.elapsed += dt;
  state.rise = 1.8 + Math.min(2.4, state.elapsed * 0.02);
  const dy = state.rise * dt;
  for (const p of platforms) {
    p.prevY = p.y;
    p.y += dy;
    p.group.position.y = p.y;
  }

  // sideways
  const input = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  player.vx = approach(player.vx, input * RUN, (player.on ? 60 : 38) * dt);
  let x = player.x + player.vx * dt;
  if (player.on?.type === 'conveyor') x += player.on.dir * CONVEYOR_V * dt;
  const clamped = clamp(x, -HW + R, HW - R);
  if (clamped !== x) player.vx = 0;
  player.x = clamped;

  // standing, or falling and maybe landing
  if (player.on) {
    const p = player.on;
    if (p.broken || Math.abs(player.x - p.x) > p.w / 2 + R) {
      player.on = null;
      player.vy = 0;
    } else {
      player.y = p.y;
    }
  }
  if (!player.on) {
    const prevY = player.y;
    player.vy = Math.max(player.vy - GRAVITY * dt, -TERMINAL);
    player.y += player.vy * dt;
    let best = null;
    for (const p of platforms) {
      if (p.broken || p === player.ignore) continue;
      if (Math.abs(player.x - p.x) > p.w / 2 + R) continue;
      if (prevY >= p.prevY - 0.02 && player.y <= p.y && (!best || p.y > best.y)) best = p;
    }
    if (best) land(best);
  }
  if (player.ignore && (player.y < player.ignore.y - 0.6 || !platforms.includes(player.ignore))) player.ignore = null;

  // the ceiling
  if (player.y + HEAD >= CEIL_Y) {
    player.y = CEIL_Y - HEAD;
    if (player.on) {
      player.ignore = player.on;
      player.on = null;
    }
    player.vy = Math.min(player.vy, -2.5);
    if (player.invuln <= 0) hurt('ceiling');
  }
  player.invuln = Math.max(0, player.invuln - dt);

  if (player.y < DEATH_Y && state.mode === 'playing') die('fall');

  for (const p of platforms) updatePlatform(p, dt);

  // drop what has gone into the ceiling, add more below
  while (platforms.length && platforms[0].y > CEIL_Y + 4) {
    const p = platforms.shift();
    if (player.ignore === p) player.ignore = null;
    removePlatform(p);
  }
  fill();
}

function stepDying(dt) {
  player.dieT += dt;
  state.rise *= 1 - Math.min(1, dt * 2);
  for (const p of platforms) {
    p.y += state.rise * dt;
    p.group.position.y = p.y;
    updatePlatform(p, dt);
  }
  player.vy = Math.max(player.vy - GRAVITY * dt, -TERMINAL);
  player.y += player.vy * dt;
  heroHolder.rotation.z += dt * 6 * (player.cause === 'fall' ? 0.3 : 1);
  if (player.dieT > (player.cause === 'fall' ? 0.7 : 1.4)) gameOver();
}

// ---- the main loop
let last = performance.now();
let menuWave = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (state.mode === 'playing') {
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps && state.mode === 'playing'; i++) stepPlaying(dt / steps);
    if (Math.floor(state.elapsed) !== Math.floor(state.elapsed - dt)) renderTime();
  } else if (state.mode === 'dying') {
    stepDying(dt);
  } else if (state.mode === 'menu') {
    menuWave -= dt;
    if (menuWave <= 0) {
      hero.wave();
      menuWave = 6;
    }
  }

  const rise = state.mode === 'menu' ? 0.5 : state.mode === 'paused' ? 0 : state.rise;
  if (state.mode !== 'paused') {
    wallTex.offset.y -= (rise * dt) / 5;
    sideTex.offset.y -= (rise * dt) / 5;
    if (state.mode === 'playing') beltTex.offset.x -= (CONVEYOR_V * dt) / BELT_TILE;
    for (let i = 0; i < DUST; i++) {
      let y = dustPos[i * 3 + 1] + (rise * 0.9 + 0.1) * dt;
      if (y > CEIL_Y + 1) y = DEATH_Y;
      dustPos[i * 3 + 1] = y;
    }
    dustGeo.attributes.position.needsUpdate = true;
    updateSparks(dt, rise);
  }

  // the character
  if (state.mode !== 'paused') {
    heroHolder.position.set(player.x, player.y, 0);
    const moving = state.mode === 'playing' && Math.abs(player.vx) > 0.5;
    const target = moving ? Math.sign(player.vx) * Math.PI * 0.42 : 0;
    player.facing += (target - player.facing) * Math.min(1, dt * 12);
    hero.root.rotation.y = player.facing;
    hero.setWalking(player.on && moving ? 1.6 * Math.abs(player.vx) / RUN : 0);
    hero.setAirborne(player.on || state.mode === 'menu' ? 0 : 1);
    heroHolder.visible = !(player.invuln > 0 && Math.floor(player.invuln * 16) % 2 === 0);
    hero.update(t);
  }

  lamp.position.set(player.x, player.y + 1.4, 2);
  ceilingGlow.intensity = 34 + Math.sin(t * 7) * 6 + (player.y + HEAD > CEIL_Y - 2 ? 40 : 0);

  state.shake = Math.max(0, state.shake - dt);
  camera.position.set(
    camBase.x + player.x * 0.06 + (Math.random() - 0.5) * state.shake,
    camBase.y + (Math.random() - 0.5) * state.shake,
    camBase.z,
  );
  renderer.render(scene, camera);
}

// ---- sound: small synth blips, no files
let actx = null;
let muted = load('downshaft:muted') === '1';
function audio() {
  if (muted) return null;
  if (!actx) {
    try { actx = new AudioContext(); } catch { return null; }
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone({ f = 440, to = f, dur = 0.12, type = 'sine', vol = 0.15, delay = 0 }) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
let noiseBuf = null;
function noise({ dur = 0.2, vol = 0.2, f = 1200 }) {
  const a = audio();
  if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = f;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
  src.stop(a.currentTime + dur);
}
const sfx = {
  land: () => tone({ f: 190, to: 80, dur: 0.1, type: 'triangle', vol: 0.2 }),
  heal: () => tone({ f: 880, to: 1400, dur: 0.09, vol: 0.05, delay: 0.04 }),
  conveyor: () => { tone({ f: 150, to: 120, dur: 0.12, type: 'square', vol: 0.05 }); tone({ f: 190, to: 80, dur: 0.1, type: 'triangle', vol: 0.15 }); },
  spikes: () => { noise({ dur: 0.2, vol: 0.3, f: 2600 }); tone({ f: 240, to: 70, dur: 0.28, type: 'sawtooth', vol: 0.1 }); },
  ceiling: () => { tone({ f: 1600, to: 500, dur: 0.2, type: 'square', vol: 0.05 }); noise({ dur: 0.16, vol: 0.25, f: 3800 }); },
  spring: () => tone({ f: 240, to: 960, dur: 0.24, type: 'square', vol: 0.06 }),
  crumble: () => noise({ dur: 0.4, vol: 0.22, f: 450 }),
  die: () => tone({ f: 420, to: 50, dur: 1, type: 'sawtooth', vol: 0.1 }),
  start: () => { tone({ f: 523, dur: 0.1, vol: 0.1, type: 'triangle' }); tone({ f: 784, dur: 0.16, vol: 0.1, type: 'triangle', delay: 0.1 }); },
};
function renderMute() {
  $('mute').textContent = muted ? '🔇' : '🔊';
}
function toggleMute() {
  muted = !muted;
  save('downshaft:muted', muted ? '1' : '0');
  renderMute();
}

// ---- HUD
const hpBar = $('hp');
for (let i = 0; i < MAX_HP; i++) hpBar.append(document.createElement('i'));
function renderHud() {
  $('floor').textContent = `B${state.floor}`;
  [...hpBar.children].forEach((el, i) => el.classList.toggle('on', i < state.hp));
  hpBar.classList.toggle('low', state.hp <= DAMAGE);
  renderTime();
}
function renderTime() {
  $('time').textContent = formatTime(state.elapsed);
}

// ---- start.ng: who's playing, the card, the board
let who = { user: null, guest: { name: 'Guest', style: null, face: null } };

function renderPlayer() {
  const { user, guest } = who;
  const player = user ?? guest;
  const face = $('player-face');
  if (player.face) face.src = player.face;
  else face.removeAttribute('src');
  $('player-name').textContent = player.name || 'Guest';
  $('player-account').textContent = user?.account ? `@${user.account}` : 'Not signed in';
  $('player-sign-in').hidden = !!user || !startng.START_NG;
  $('player-card').hidden = false;
  setHeroStyle(user ? user.style ?? styleFor(user.id) : guest.style ?? LOCAL_GUEST_STYLE);
  if (state.mode === 'menu' || state.mode === 'over') renderSignInButton();
}

function renderSignInButton() {
  const canSignIn = !!startng.START_NG && !who.user;
  $('sign-in').hidden = !canSignIn || (state.mode === 'menu' && startng.choseGuest);
}

async function refreshPlayer() {
  const reply = await startng.whoami();
  if (reply) {
    who = reply;
    renderPlayer();
  }
}

async function renderBoard() {
  if (!startng.START_NG) return;
  const entries = await startng.leaderboard(10);
  if (!entries) return;
  const list = $('board');
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No runs yet. Be the first down the shaft!';
    list.replaceChildren(li);
  } else {
    list.replaceChildren(...entries.map((e) => {
      const li = document.createElement('li');
      if (who.user && e.player_id === who.user.id) li.className = 'me';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `#${e.rank}`;
      const name = document.createElement('span');
      name.className = 'name';
      const dot = document.createElement('i');
      dot.style.background = e.color || '#9aa3b5';
      const label = document.createElement('span');
      label.textContent = e.name;
      name.append(dot, label);
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = `B${e.stats?.floors ?? e.score ?? 0}`;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = formatTime(e.stats?.time ?? 0);
      li.append(rank, name, val, sub);
      return li;
    }));
  }
  $('board-wrap').hidden = false;
}

// ---- screens
const overlay = $('overlay');

function showOverlay({ title, message, result = null, legend = true, action }) {
  $('title').innerHTML = title;
  $('message').textContent = message;
  const res = $('result');
  res.hidden = !result;
  if (result) res.replaceChildren(...result);
  $('legend').hidden = !legend;
  $('action').textContent = action;
  overlay.hidden = false;
  renderSignInButton();
}

function showMenu() {
  state.mode = 'menu';
  showOverlay({
    title: 'Down<span>shaft</span>',
    message: "The shaft is rising into a ceiling of spikes. Drop from ledge to ledge, and don't fall into the dark.",
    action: 'Play',
  });
  renderBoard();
}

function play() {
  audio();
  reset();
  state.mode = 'playing';
  overlay.hidden = true;
  $('hp-wrap').hidden = false;
  sfx.start();
}

function pause() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  keys.left = keys.right = false;
  showOverlay({ title: 'Paused', message: `Floor B${state.floor} · ${formatTime(state.elapsed)}`, action: 'Resume' });
}

function resume() {
  state.mode = 'playing';
  overlay.hidden = true;
  last = performance.now();
}

function stat(label, value) {
  const div = document.createElement('div');
  const small = document.createElement('small');
  small.textContent = label;
  const b = document.createElement('b');
  b.textContent = value;
  div.append(small, b);
  return div;
}

async function gameOver() {
  state.mode = 'over';
  heroHolder.visible = false;
  const floors = state.floor;
  const time = Math.floor(state.elapsed);
  let best = null;
  try { best = JSON.parse(load('downshaft:best')); } catch { best = null; }
  const newLocalBest = !best || floors > best.floors || (floors === best.floors && time > best.time);
  if (newLocalBest) save('downshaft:best', JSON.stringify({ floors, time }));

  const note = document.createElement('p');
  const causes = {
    fall: 'You fell into the dark.',
    ceiling: 'The ceiling spikes got you.',
    spikes: 'Those spikes were sharper than they looked.',
  };
  showOverlay({
    title: 'Game <span>over</span>',
    message: causes[player.cause] ?? 'The shaft wins this time.',
    result: [stat('FLOOR', `B${floors}`), stat('TIME', formatTime(time)), note],
    legend: false,
    action: 'Play again',
  });

  if (who.user) {
    note.textContent = 'Saving your run…';
    const saved = await startng.saveRun({ floors, time });
    if (saved.ok) {
      const { improved, rank, stats } = saved.result;
      note.textContent = improved ? `New best! You're #${rank} on start.ng.` : `Your best is B${stats.floors} (#${rank}).`;
    } else {
      note.textContent = saved.error || "Couldn't save your run.";
    }
    renderBoard();
  } else {
    const local = newLocalBest ? 'A new personal best!' : `Your best: B${best.floors}.`;
    note.textContent = startng.START_NG ? `${local} Sign in to put it on the leaderboard.` : local;
  }
}

function onAction() {
  if (state.mode === 'paused') resume();
  else if (state.mode === 'menu' || state.mode === 'over') play();
}

// ---- input
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) {
    keys[KEYMAP[e.code]] = true;
    e.preventDefault();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state.mode === 'playing') pause();
    else if (state.mode === 'paused') resume();
  } else if (e.code === 'KeyM') {
    toggleMute();
  } else if ((e.code === 'Enter' || e.code === 'Space') && !overlay.hidden) {
    e.preventDefault();
    onAction();
  }
});
addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
});
addEventListener('blur', () => {
  keys.left = keys.right = false;
  pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

// touch: the on-screen buttons, or hold either side of the screen
const touches = new Map();
function syncTouches() {
  const dirs = [...touches.values()];
  keys.left = dirs.includes('left');
  keys.right = dirs.includes('right');
  $('touch-left').classList.toggle('held', keys.left);
  $('touch-right').classList.toggle('held', keys.right);
}
function pointerDown(e, dir) {
  if (state.mode !== 'playing') return;
  touches.set(e.pointerId, dir ?? (e.clientX < innerWidth / 2 ? 'left' : 'right'));
  syncTouches();
}
function pointerUp(e) {
  touches.delete(e.pointerId);
  syncTouches();
}
canvas.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && pointerDown(e));
for (const dir of ['left', 'right']) {
  const btn = $(`touch-${dir}`);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerDown(e, dir);
  });
}
addEventListener('pointerup', pointerUp);
addEventListener('pointercancel', pointerUp);
if (matchMedia('(pointer: coarse)').matches) $('touch').hidden = false;

$('action').addEventListener('click', onAction);
$('pause').addEventListener('click', () => (state.mode === 'paused' ? resume() : pause()));
$('mute').addEventListener('click', toggleMute);
$('sign-in').addEventListener('click', startng.signIn);
$('player-sign-in').addEventListener('click', startng.signIn);

// ---- go
renderMute();
renderPlayer();
reset();
showMenu();
requestAnimationFrame(frame);
refreshPlayer().then(renderBoard);
startng.onPlayerChange((reply) => {
  who = reply;
  renderPlayer();
  if (state.mode === 'menu' || state.mode === 'over') renderBoard();
});

// for testing from the console
window.downshaft = {
  state,
  player,
  keys,
  get platforms() { return platforms; },
  setStyle: setHeroStyle,
  get hero() { return hero; },
  heroHolder,
  camera,
  camBase,
  step(dt) { // advances the simulation without rendering
    if (state.mode === 'playing') stepPlaying(dt);
    else if (state.mode === 'dying') stepDying(dt);
  },
};
