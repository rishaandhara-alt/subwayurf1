// ============================================================
// SUBWAY DASH 3D — mobile-first endless subway runner
// Three.js WebGL, procedural textures (no external assets),
// synthesized audio, swipe controls, hoverboards, powerups.
// ============================================================
import * as THREE from 'three';

// ---------------- Config ----------------
const CFG = {
  LANE_W: 2.4,
  LANES: [-2.4, 0, 2.4],
  VIEW_DIST: 150,
  RECYCLE_DIST: 28,
  BASE_SPEED: 14,
  MAX_SPEED: 34,
  ACCEL: 0.22,            // speed gain per second
  GRAVITY: -34,
  JUMP_V: 13.5,
  SLIDE_TIME: 0.65,
  PLAYER_Z: 0,
};

const state = {
  mode: 'menu',           // menu | playing | dead | paused
  speed: CFG.BASE_SPEED,
  score: 0,
  coins: 0,
  best: +(localStorage.getItem('sd3d_best') || 0),
  totalDist: 0,
  shake: 0,
  time: 0,
  magnetT: 0, jetT: 0, boardT: 0, x2T: 0,
  boardsLeft: 0,
  combo: 0, comboT: 0,
};

// ---------------- Renderer / Scene ----------------
const canvas = document.getElementById('gamecanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);

// fog + sky gradient background texture
function makeSkyTexture(top, mid, bot) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(0.55, mid); grad.addColorStop(1, bot);
  g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = makeSkyTexture('#1c2f5e', '#5a6f9e', '#d98a55');
scene.fog = new THREE.Fog(0x8fa3c8, 45, CFG.VIEW_DIST + 15);

// ---------------- Lights ----------------
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x30251c, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdcae, 2.2);
sun.position.set(-18, 30, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(0, 0, -30);

// ---------------- Procedural texture helpers ----------------
function noiseOverlay(g, w, h, alpha, size = 1) {
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = `rgba(${Math.random() > .5 ? 255 : 0},${Math.random() > .5 ? 255 : 0},0,0)`;
    g.globalAlpha = Math.random() * alpha;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
  g.globalAlpha = 1;
}
function texFromCanvas(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Ground: gravel ballast between rails, sleepers, side platforms
function makeGroundTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // track area base (ballast)
  g.fillStyle = '#4a4640'; g.fillRect(0, 0, W, H);
  noiseOverlay(g, W, H, 0.25, 2);
  // side platform concrete
  const platL = 0.14 * W, platR = 0.86 * W;
  g.fillStyle = '#7d7a72'; g.fillRect(0, 0, platL, H); g.fillRect(platR, 0, W - platR, H);
  // platform tactile yellow line
  g.fillStyle = '#c9b23a'; g.fillRect(platL - 10, 0, 8, H); g.fillRect(platR + 2, 0, 8, H);
  // concrete slabs seams
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2;
  for (let y = 0; y < H; y += 64) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(platL, y); g.stroke();
    g.beginPath(); g.moveTo(platR, y); g.lineTo(W, y); g.stroke();
  }
  // sleepers (wooden ties) under each of 3 lanes
  for (const lanePx of [0.3, 0.5, 0.7]) {
    const cx = lanePx * W;
    for (let y = 10; y < H; y += 52) {
      g.save();
      g.translate(cx, y);
      g.fillStyle = '#3d2f22';
      g.fillRect(-34, -6, 68, 12);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(-34, 2, 68, 4);
      g.restore();
    }
    // steel rails
    for (const off of [-26, 26]) {
      const grd = g.createLinearGradient(cx + off - 3, 0, cx + off + 3, 0);
      grd.addColorStop(0, '#5c5f66'); grd.addColorStop(.5, '#c9ced6'); grd.addColorStop(1, '#5c5f66');
      g.fillStyle = grd; g.fillRect(cx + off - 3, 0, 6, H);
    }
  }
  // grime streaks
  g.globalAlpha = 0.15; g.fillStyle = '#14120f';
  for (let i = 0; i < 30; i++) g.fillRect(Math.random() * W, Math.random() * H, 3, 40 + Math.random() * 80);
  g.globalAlpha = 1;
  return c;
}

// Building facade with lit windows
function makeBuildingTexture(baseColor, seed) {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = baseColor; g.fillRect(0, 0, W, H);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // floor bands
  const floors = 10;
  for (let f = 0; f < floors; f++) {
    const y = f * (H / floors);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, y + H / floors - 6, W, 6);
    // windows
    const cols = 4;
    for (let wI = 0; wI < cols; wI++) {
      const wx = 18 + wI * ((W - 36) / cols), wy = y + 14, ww = (W - 36) / cols - 16, wh = H / floors - 30;
      const lit = rnd() > 0.55;
      g.fillStyle = lit ? `rgba(255,${200 + rnd() * 40 | 0},${120 + rnd() * 80 | 0},0.95)` : 'rgba(20,26,40,.9)';
      g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(wx, wy, ww, wh);
      if (lit) { g.fillStyle = 'rgba(255,240,180,.18)'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8); }
    }
  }
  noiseOverlay(g, W, H, 0.12, 2);
  return c;
}

// Train body with windows + ads
function makeTrainTexture(color, seed) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // stripe
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, H * 0.56, W, 14);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, H * 0.56 + 14, W, 4);
  // window band
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 80;
    g.fillStyle = 'rgba(18,28,44,.92)'; g.fillRect(x, 40, 56, 60);
    g.fillStyle = 'rgba(150,200,255,.25)'; g.fillRect(x, 40, 56, 18);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(x, 40, 56, 60);
  }
  // random ad posters lower half
  for (let i = 0; i < 3; i++) {
    const x = 40 + i * 160;
    g.fillStyle = `hsl(${rnd() * 360},70%,60%)`; g.fillRect(x, 140, 110, 70);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.font = 'bold 20px sans-serif';
    g.fillText(['RIDE!', 'NEW!', 'CITY!'][i], x + 22, 182);
  }
  // rivets & grime
  noiseOverlay(g, W, H, 0.15, 2);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, H - 18, W, 18);
  return c;
}

// Graffiti wall panel for tunnel sides
function makeWallTexture(seed) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#57534b'; g.fillRect(0, 0, W, H);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // bricks
  for (let y = 0; y < H; y += 24) {
    const off = (y / 24) % 2 ? 32 : 0;
    for (let x = -32; x < W; x += 64) {
      g.fillStyle = `rgb(${90 + rnd() * 30 | 0},${70 + rnd() * 25 | 0},${58 + rnd() * 20 | 0})`;
      g.fillRect(x + off + 2, y + 2, 60, 20);
    }
  }
  // graffiti blobs
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `hsla(${rnd() * 360},80%,55%,.75)`;
    g.beginPath();
    g.ellipse(rnd() * W, 60 + rnd() * 140, 30 + rnd() * 50, 18 + rnd() * 26, rnd() * 3, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.stroke();
  }
  noiseOverlay(g, W, H, 0.2, 2);
  return c;
}

// Coin sprite texture
function makeCoinTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S * .38, S * .35, 8, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#fff8d6'); grad.addColorStop(.45, '#ffd23f'); grad.addColorStop(.8, '#e3a516'); grad.addColorStop(1, '#a86e00');
  g.fillStyle = grad; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, 7); g.fill();
  g.strokeStyle = '#8a5c00'; g.lineWidth = 6; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 12, 0, 7); g.stroke();
  g.fillStyle = '#8a5c00'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('$', S / 2, S / 2 + 4);
  return c;
}

// ---------------- Shared geometries/materials ----------------
const groundTex = texFromCanvas(makeGroundTexture(), 1, CFG.VIEW_DIST / 12);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 });
const groundGeo = new THREE.PlaneGeometry(14, 12);

const buildingCanvases = [];
const bColors = ['#3a4a63', '#4d3a52', '#5c4a3d', '#37505a', '#55404a'];
for (let i = 0; i < 5; i++) buildingCanvases.push(makeBuildingTexture(bColors[i], i * 7919 + 13));
const buildingMats = buildingCanvases.map((cv, i) =>
  new THREE.MeshStandardMaterial({ map: texFromCanvas(cv), roughness: .85, metalness: .1 }));

const trainColors = ['#d94f4f', '#3f7fd9', '#e8b93c', '#4faf6d', '#9a5fd9', '#e0e4ea'];
const trainMats = trainColors.map((col, i) =>
  new THREE.MeshStandardMaterial({ map: texFromCanvas(makeTrainTexture(col, i * 104729 + 7)), roughness: .5, metalness: .35 }));
const trainTopMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: .6, metalness: .4 });

const wallMats = [0, 1, 2].map(i =>
  new THREE.MeshStandardMaterial({ map: texFromCanvas(makeWallTexture(i * 31337 + 5), 3, 1), roughness: .9 }));

const coinTex = texFromCanvas(makeCoinTexture());
const coinMat = new THREE.MeshStandardMaterial({ map: coinTex, emissive: 0x6a4b00, emissiveIntensity: .5, roughness: .35, metalness: .8, transparent: true });
const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 20);
// rotate so it's a vertical disc facing player
coinGeo.rotateX(Math.PI / 2);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

// powerup materials
const puDefs = {
  magnet: { color: 0xff3b3b, emissive: 0x990000, icon: '🧲' },
  x2:     { color: 0xffd23f, emissive: 0x997a00, icon: '✖2' },
  board:  { color: 0x7cf6ff, emissive: 0x006a77, icon: '🛹' },
};

// ---------------- Player character rig ----------------
function buildPlayer() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: .8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0xe8552f, roughness: .75 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2d4a7a, roughness: .8 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: .6 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2f2f35, roughness: .7 });

  const mk = (mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
    return m;
  };

  // torso group (pivot at hips)
  const body = new THREE.Group(); root.add(body);
  body.add(mk(jacket, .5, .55, .3, 0, 1.05, 0));           // chest
  const head = mk(skin, .34, .36, .32, 0, 1.55, 0); body.add(head);
  const cap = mk(capMat, .38, .12, .36, 0, 1.76, 0); body.add(cap);
  const brim = mk(capMat, .38, .05, .16, 0, 1.7, -.22); body.add(brim);
  // backpack
  body.add(mk(new THREE.MeshStandardMaterial({ color: 0x3ec6a8, roughness: .7 }), .42, .46, .18, 0, 1.1, .26));

  // arms (pivot at shoulder)
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(.34 * side, 1.3, 0);
    pivot.add(mk(jacket, .14, .42, .14, 0, -.2, 0));
    pivot.add(mk(skin, .12, .16, .12, 0, -.48, 0));
    body.add(pivot); return pivot;
  }
  const armL = arm(-1), armR = arm(1);

  // legs (pivot at hip)
  function leg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(.14 * side, .78, 0);
    pivot.add(mk(pants, .18, .45, .18, 0, -.24, 0));
    pivot.add(mk(shoe, .2, .1, .3, 0, -.52, -.06));
    body.add(pivot); return pivot;
  }
  const legL = leg(-1), legR = leg(1);

  root.userData = { body, armL, armR, legL, legR, head };
  return root;
}
const player = buildPlayer();
player.position.y = 0;
scene.add(player);

// shadow blob (fake contact shadow for extra grounding)
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
scene.add(blob);

// hoverboard mesh
const boardMesh = new THREE.Group();
{
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x18c6e8, emissive: 0x0affff, emissiveIntensity: .6, roughness: .3, metalness: .6 }));
  deck.castShadow = true;
  boardMesh.add(deck);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 1.4),
    new THREE.MeshBasicMaterial({ color: 0x7cf6ff, transparent: true, opacity: .8 }));
  glow.position.y = -.1; boardMesh.add(glow);
}
boardMesh.visible = false;
scene.add(boardMesh);

// jetpack
const jetMesh = new THREE.Group();
{
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .6, 10),
    new THREE.MeshStandardMaterial({ color: 0xccd2dd, metalness: .8, roughness: .3 }));
  tank.position.y = .3; jetMesh.add(tank);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9d2f });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(.09, .4, 8), flameMat); f1.position.set(.08, -.1, 0); f1.rotation.x = Math.PI;
  const f2 = f1.clone(); f2.position.x = -.08;
  jetMesh.add(f1, f2);
  jetMesh.userData.flames = [f1, f2];
}
jetMesh.visible = false;
scene.add(jetMesh);

// ---------------- World object pools ----------------
const worldObjects = [];   // {mesh, type, lane, z, ...}
const pool = { ground: [], buildings: [], walls: [], trains: [], obstacles: [], coins: [], pickups: [] };

// Ground tiles
const GROUND_TILES = 16;
for (let i = 0; i < GROUND_TILES; i++) {
  const tile = new THREE.Mesh(groundGeo, groundMat);
  tile.rotation.x = -Math.PI / 2;
  tile.receiveShadow = true;
  scene.add(tile);
  pool.ground.push(tile);
}

// Buildings on both sides
const BUILDING_COUNT = 26;
for (let i = 0; i < BUILDING_COUNT; i++) {
  const h = 8 + Math.random() * 22;
  const mat = buildingMats[i % buildingMats.length];
  const b = new THREE.Mesh(boxGeo, mat);
  b.scale.set(6 + Math.random() * 4, h, 8 + Math.random() * 6);
  b.userData.h = h;
  b.userData.side = i % 2 === 0 ? -1 : 1;
  scene.add(b);
  pool.buildings.push(b);
}

// Tunnel/retaining walls just beyond platforms
const WALL_COUNT = 14;
for (let i = 0; i < WALL_COUNT; i++) {
  const w = new THREE.Mesh(boxGeo, wallMats[i % wallMats.length]);
  w.scale.set(0.6, 5, 12);
  w.userData.side = i % 2 === 0 ? -1 : 1;
  scene.add(w);
  pool.walls.push(w);
}

// lamp posts for atmosphere
const lampGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6);
const lampMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: .6, metalness: .5 });
const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
const lamps = [];
for (let i = 0; i < 10; i++) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(lampGeo, lampMat); pole.position.y = 2.1; grp.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 8), bulbMat);
  bulb.position.set(i % 2 ? -.5 : .5, 4.2, 0); grp.add(bulb);
  grp.userData.side = i % 2 === 0 ? -1 : 1;
  scene.add(grp); lamps.push(grp);
}

// ---------------- Spawning ----------------
function spawnPattern(zFar) {
  // choose a pattern every "chunk" of 14 units
  const r = Math.random();
  const dz = zFar;
  if (r < 0.20) patternTrainBarrier(dz);
  else if (r < 0.36) patternLowBarriers(dz);
  else if (r < 0.50) patternOverheadGantry(dz);
  else if (r < 0.62) patternZigzagCoins(dz);
  else if (r < 0.74) patternTwoTrains(dz);
  else if (r < 0.85) patternCoinArc(dz);
  else patternMixed(dz);
  // occasional powerup
  if (Math.random() < 0.16) spawnPickup(CFG.LANES[(Math.random() * 3) | 0], dz + 6, ['magnet', 'x2', 'board'][(Math.random() * 3) | 0]);
}

function addObstacle(mesh, lane, z, kind, passUnder, passOver) {
  mesh.position.set(lane, 0, z);
  mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(mesh);
  worldObjects.push({ mesh, type: 'obstacle', lane, z, kind, passUnder, passOver, len: mesh.userData.len || 2 });
}

function makeBarrierGroup(h = 1.1, w = 2.1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdd4444, roughness: .6 });
  const matW = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .5 });
  const bar = new THREE.Mesh(boxGeo, mat); bar.scale.set(w, h * .5, .3); bar.position.y = .35 + h * .25; g.add(bar);
  const bar2 = new THREE.Mesh(boxGeo, matW); bar2.scale.set(w, h * .2, .32); bar2.position.y = .35 + h * .55; g.add(bar2);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x333740 }));
    leg.scale.set(.12, h + .7, .12); leg.position.set(s * (w / 2 - .1), (h + .7) / 2, 0); g.add(leg);
  }
  g.userData.len = 1.2;
  return g;
}

function makeGantry() { // overhead beam — must roll under
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: .5, metalness: .6 });
  const beam = new THREE.Mesh(boxGeo, mat); beam.scale.set(8.6, .5, .5); beam.position.y = 1.75; g.add(beam);
  const sign = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x1c6dd0, roughness: .6 }));
  sign.scale.set(3, .8, .3); sign.position.y = 2.35; g.add(sign);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(boxGeo, mat); post.scale.set(.25, 2, .25); post.position.set(s * 4.1, 1, 0); g.add(post);
  }
  g.userData.len = 1.4;
  return g;
}

function makeTrain(lane, z, moving = false) {
  const g = new THREE.Group();
  const len = 16 + Math.random() * 8;
  const mat = trainMats[(Math.random() * trainMats.length) | 0];
  const body = new THREE.Mesh(boxGeo, mat);
  body.scale.set(2.2, 2.6, len); body.position.y = 1.75; g.add(body);
  const top = new THREE.Mesh(boxGeo, trainTopMat);
  top.scale.set(2.0, .3, len); top.position.y = 3.15; g.add(top);
  // front lights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6cc });
  for (const s of [-.7, .7]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 8), lightMat);
    l.position.set(s, 1.2, -len / 2 - .02); g.add(l);
  }
  g.position.set(lane, 0, z);
  g.userData.len = len;
  g.userData.moving = moving;
  g.userData.speed = moving ? 6 + Math.random() * 4 : 0;
  scene.add(g);
  worldObjects.push({ mesh: g, type: 'train', lane, z, kind: 'solid', passUnder: false, passOver: moving, len });
}

function spawnTrainBarrier(z) { // one blocked lane + barrier in another
  const blockedLane = (Math.random() * 3) | 0;
  makeTrain(CFG.LANES[blockedLane], z - 8 + Math.random() * 4, Math.random() < .4);
  const other = (blockedLane + 1 + ((Math.random() * 2) | 0)) % 3;
  const bar = makeBarrierGroup();
  addObstacle(bar, CFG.LANES[other], z + 10, 'solid', false, false);
  maybeCoinsLine(other, z + 14, 4);
}
function patternTrainBarrier(z) { spawnTrainBarrier(z); }
function patternTwoTrains(z) {
  const skip = (Math.random() * 3) | 0;
  for (let i = 0; i < 3; i++) if (i !== skip) makeTrain(CFG.LANES[i], z - 6 + Math.random() * 6, Math.random() < .3);
  maybeCoinsLine(skip, z, 6);
}
function patternLowBarriers(z) {
  const count = 1 + ((Math.random() * 2) | 0);
  const lanes = [0, 1, 2].sort(() => Math.random() - .5).slice(0, count);
  lanes.forEach((l, i) => {
    const bar = makeBarrierGroup(1.0);
    addObstacle(bar, CFG.LANES[l], z + i * 5, 'solid', false, true); // can jump over
  });
  maybeCoinsArc(lanes[0], z, 5);
}
function patternOverheadGantry(z) {
  const g = makeGantry();
  addObstacle(g, 0, z + 4, 'overhead', true /*roll under*/, false);
  maybeCoinsLine(((Math.random() * 3) | 0), z + 10, 5);
}
function patternZigzagCoins(z) {
  let lane = (Math.random() * 3) | 0;
  for (let i = 0; i < 12; i++) {
    spawnCoin(CFG.LANES[lane], z + i * 2.2);
    if (i % 3 === 2) lane = Math.min(2, Math.max(0, lane + (Math.random() < .5 ? -1 : 1)));
  }
  const bar = makeBarrierGroup();
  addObstacle(bar, CFG.LANES[lane], z + 8, 'solid', false, true);
}
function patternCoinArc(z) { maybeCoinsArc(((Math.random() * 3) | 0), z, 9); }
function patternMixed(z) {
  const pick = (Math.random() * 3) | 0;
  const bar = makeBarrierGroup();
  addObstacle(bar, CFG.LANES[pick], z, 'solid', false, true);
  makeTrain(CFG.LANES[(pick + 1) % 3], z - 4, false);
  maybeCoinsLine((pick + 2) % 3, z + 6, 6);
}

function spawnCoin(lane, z, y = 1.0) {
  const m = new THREE.Mesh(coinGeo, coinMat);
  m.position.set(lane, y, z);
  scene.add(m);
  worldObjects.push({ mesh: m, type: 'coin', lane, z, y });
}
function maybeCoinsLine(laneIdx, z, n) {
  for (let i = 0; i < n; i++) spawnCoin(CFG.LANES[laneIdx], z + i * 2.2);
}
function maybeCoinsArc(laneIdx, z, n) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    spawnCoin(CFG.LANES[laneIdx], z + i * 2, 1.0 + Math.sin(t * Math.PI) * 1.6);
  }
}
function spawnPickup(lane, z, kind) {
  const def = puDefs[kind];
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(.42),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: def.emissive, emissiveIntensity: .8, roughness: .3, metalness: .4 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.62, .045, 8, 24),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: .7 }));
  g.add(ring);
  g.position.set(lane, 1.2, z);
  g.userData.kind = kind;
  scene.add(g);
  worldObjects.push({ mesh: g, type: 'pickup', lane, z, kind });
}

// ---------------- Spawning cursor ----------------
let spawnCursor = -40;   // next pattern z (negative = ahead of player)

// ---------------- Audio (WebAudio synth) ----------------
let actx = null, masterGain = null, muted = false;
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = actx.createGain(); masterGain.gain.value = .5; masterGain.connect(actx.destination);
}
function beep(freq, dur = .12, type = 'square', vol = .2, slide = 0) {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
  o.connect(g); g.connect(masterGain);
  o.start(); o.stop(actx.currentTime + dur);
}
function noiseBurst(dur = .3, vol = .35) {
  if (!actx || muted) return;
  const len = actx.sampleRate * dur;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(masterGain); src.start();
}
const sfx = {
  coin: () => { beep(1400, .08, 'square', .12); setTimeout(() => beep(1900, .1, 'square', .1), 50); },
  jump: () => beep(300, .18, 'sine', .2, 500),
  roll: () => beep(500, .12, 'sawtooth', .12, -300),
  swap: () => beep(700, .06, 'triangle', .1, 200),
  power: () => { beep(600, .1, 'square', .15); setTimeout(() => beep(900, .1, 'square', .15), 80); setTimeout(() => beep(1200, .15, 'square', .15), 160); },
  crash: () => { noiseBurst(.5, .5); beep(120, .4, 'sawtooth', .3, -80); },
  board: () => beep(400, .25, 'sine', .18, 300),
};

// ---------------- Input: swipes + keys ----------------
let touchStart = null, holdTimer = null;
function isUiTarget(e) {
  const el = e.target;
  return !!(el && el.closest && el.closest('.screen, #hud, .icon-btn, button'));
}
function onTouchStart(e) {
  if (state.mode !== 'playing' || isUiTarget(e)) return;
  const t = e.changedTouches ? e.changedTouches[0] : e;
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  holdTimer = setTimeout(() => { if (touchStart) activateBoard(); }, 380);
}
function onTouchEnd(e) {
  clearTimeout(holdTimer);
  if (!touchStart || state.mode !== 'playing' || isUiTarget(e)) { touchStart = null; return; }
  const t = e.changedTouches ? e.changedTouches[0] : e;
  const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const held = performance.now() - touchStart.time > 360;
  touchStart = null;
  if (Math.max(adx, ady) < 24) { if (!held) tryJump(); return; } // tap = jump
  if (adx > ady) dx > 0 ? moveLane(1) : moveLane(-1);
  else dy < 0 ? tryJump() : tryRoll();
}
addEventListener('touchstart', onTouchStart, { passive: true });
addEventListener('touchend', onTouchEnd, { passive: true });
addEventListener('keydown', e => {
  if (state.mode !== 'playing') return;
  if (e.key === 'ArrowLeft' || e.key === 'a') moveLane(-1);
  if (e.key === 'ArrowRight' || e.key === 'd') moveLane(1);
  if (e.key === 'ArrowUp' || e.key === 'w' || e.code === 'Space') tryJump();
  if (e.key === 'ArrowDown' || e.key === 's') tryRoll();
  if (e.key === 'Shift') activateBoard();
  if (e.key === 'Escape' || e.key === 'p') togglePause();
});

// ---------------- Player mechanics ----------------
const P = {
  lane: 1, x: 0, targetX: 0,
  y: 0, vy: 0, grounded: true,
  rolling: false, rollT: 0,
  airJumpUsed: false,
};
function moveLane(dir) {
  const nl = Math.min(2, Math.max(0, P.lane + dir));
  if (nl === P.lane) return;
  P.lane = nl; P.targetX = CFG.LANES[nl];
  sfx.swap();
}
function tryJump() {
  if (state.jetT > 0) return;
  if (P.grounded) {
    P.vy = CFG.JUMP_V; P.grounded = false; P.airJumpUsed = false; sfx.jump();
  } else if (!P.airJumpUsed && state.boardT <= 0) {
    // double-jump flip when airborne (feels great, forgiving)
    P.vy = CFG.JUMP_V * .85; P.airJumpUsed = true; sfx.jump();
  }
}
function tryRoll() {
  if (P.grounded && !P.rolling) { P.rolling = true; P.rollT = CFG.SLIDE_TIME; sfx.roll(); }
  else if (!P.grounded) { P.vy = -CFG.JUMP_V; } // fast-fall into roll
}
function activateBoard() {
  if (state.mode !== 'playing') return;
  if (state.boardsLeft > 0 && state.boardT <= 0) {
    state.boardsLeft--; state.boardT = 6; sfx.board();
    updatePowerupUI();
  }
}

// ---------------- Collisions ----------------
function checkCollisions(dt) {
  const px = player.position.x, pz = CFG.PLAYER_Z;
  const pyHead = P.y + (P.rolling ? 0.75 : 1.8);
  const pyFeet = P.y;

  // landed on roof last frame? re-plant player on it each frame
  if (P.onRoof) {
    const o = P.onRoof;
    if (!o.dead && Math.abs(o.mesh.position.z - pz) <= o.len / 2 + .6) {
      P.y = 3.3; P.vy = 0; P.grounded = true;
    } else {
      P.onRoof = null; P.grounded = false; // ran off the end — start falling
    }
  }

  for (const o of worldObjects) {
    const dz = o.mesh.position.z - pz;
    if (o.type === 'coin' || o.type === 'pickup') {
      // magnet pull
      if (o.type === 'coin' && state.magnetT > 0 && dz < 6 && dz > -3) {
        o.mesh.position.x += (px - o.mesh.position.x) * dt * 6;
        o.mesh.position.z += (pz - o.mesh.position.z) * dt * 6;
        o.mesh.position.y += (pyFeet + 1 - o.mesh.position.y) * dt * 6;
      }
      const near = Math.abs(o.mesh.position.x - px) < .8 && Math.abs(dz) < .9 &&
                   Math.abs(o.mesh.position.y - (pyFeet + 1)) < (o.type === 'coin' ? 1.4 : 1.6);
      if (near) collect(o);
      continue;
    }
    // obstacle / train
    const halfLen = (o.len || 2) / 2;
    if (Math.abs(dz) >= halfLen + .5) continue;
    const laneX = o.mesh.position.x;
    if (Math.abs(laneX - px) >= (o.type === 'train' ? 1.5 : 1.35)) continue;

    if (o.kind === 'overhead') { // gantry: hit unless rolling under or low enough
      if (!P.rolling && pyFeet < 1.5 && pyHead > 1.55) crash(o);
      continue;
    }
    // solid / train — skip if we're standing on this very train's roof
    if (o === P.onRoof) continue;
    const heightBlocked = o.type === 'train' ? 3.3 : 1.6;
    if (pyFeet < heightBlocked) {
      // land on top of a train roof only when already high enough (jumped onto it)
      if (o.type === 'train' && pyFeet >= heightBlocked - 0.55 && P.vy <= 0) {
        P.y = heightBlocked; P.vy = 0; P.grounded = true; P.onRoof = o; P.airJumpUsed = false; continue;
      }
      if (state.jetT > 0) continue;                 // flying above everything
      if (state.boardT > 0 && o.type !== 'train') { // hoverboard smashes barriers
        destroyObj(o); sfx.crash(); state.shake = .3; vibrate([30]); continue;
      }
      if (state.boardT > 0 && o.type === 'train') { boardFail(); continue; }
      crash(o);
    } else if (o.type === 'train' && pyFeet <= heightBlocked + .4 && P.vy <= 0 && !P.onRoof) {
      // glancing landing from just above
      P.y = heightBlocked; P.vy = 0; P.grounded = true; P.onRoof = o;
    }
  }
}
function collect(o) {
  if (o.type === 'coin') {
    state.combo++; state.comboT = 1.2;
    const mult = state.x2T > 0 ? 2 : 1;
    state.coins += mult;
    state.score += 5 * mult;
    sfx.coin();
    showCombo();
    // pop particle: quick scale-out
    o.dead = true;
  } else {
    const k = o.kind;
    sfx.power();
    if (k === 'magnet') state.magnetT = 8;
    if (k === 'x2') state.x2T = 8;
    if (k === 'board') { state.boardsLeft = Math.min(state.boardsLeft + 1, 3); toast('Hoverboard! Hold ↑ to ride'); }
    o.dead = true;
    updatePowerupUI();
  }
  o.dead = true;
}
function destroyObj(o) {
  o.mesh.scale.multiplyScalar(.01);
  o.dead = true;
}
function crash(o) {
  if (state.mode !== 'playing') return;
  state.mode = 'dead';
  sfx.crash();
  state.shake = 1;
  // death animation: knock object slightly, ragdoll player back
  player.userData.dying = 0;
  vibrate(navigator.vibrate ? [80, 40, 120] : null);
  setTimeout(showGameOver, 900);
}
function boardFail() {
  state.boardT = 0; boardMesh.visible = false;
  toast('Board wrecked!');
  crash(null);
}
function vibrate(p) { if (navigator.vibrate && p) navigator.vibrate(p); }

// ---------------- UI wiring ----------------
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('scoreVal'), coins: $('coinVal'), combo: $('comboBar'),
  loading: $('loading'), menu: $('menuScreen'), pause: $('pauseScreen'), over: $('overScreen'),
  menuBest: $('menuBest'), overScore: $('overScore'), overCoins: $('overCoins'), overBest: $('overBest'),
  newBest: $('newBest'), powerups: $('powerups'), soundBtn: $('soundBtn'),
};
ui.menuBest.textContent = state.best.toLocaleString();

$('playBtn').onclick = startGame;
$('retryBtn').onclick = startGame;
$('homeBtn').onclick = () => gotoMenu();
$('resumeBtn').onclick = togglePause;
$('quitBtn').onclick = () => gotoMenu();
$('pauseBtn').onclick = togglePause;
ui.soundBtn.onclick = () => { muted = !muted; ui.soundBtn.textContent = muted ? '🔇' : '🔊'; };

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

let toasts = [];
function toast(msg) {
  const d = document.createElement('div');
  d.className = 'pu'; d.style.position = 'fixed'; d.style.left = '50%';
  d.style.top = '120px'; d.style.transform = 'translateX(-50%)'; d.style.zIndex = 9;
  d.textContent = msg; document.body.appendChild(d);
  setTimeout(() => d.remove(), 1400);
}
function showCombo() {
  if (state.combo >= 3) {
    ui.combo.textContent = `COMBO x${state.combo}`;
    ui.combo.style.opacity = 1;
  }
}
function updatePowerupUI() {
  ui.powerups.innerHTML = '';
  const items = [];
  if (state.magnetT > 0) items.push(['🧲', state.magnetT]);
  if (state.x2T > 0) items.push(['✖2', state.x2T]);
  if (state.boardT > 0) items.push(['🛹', state.boardT]);
  if (state.boardsLeft > 0) items.push(['🛹×' + state.boardsLeft, null]);
  if (state.jetT > 0) items.push(['🚀', state.jetT]);
  for (const [icon, t] of items) {
    const d = document.createElement('div'); d.className = 'pu';
    d.innerHTML = `<span>${icon}</span>` + (t != null ? `<span class="t">${t.toFixed(1)}s</span>` : '');
    ui.powerups.appendChild(d);
  }
}

function gotoMenu() {
  state.mode = 'menu';
  hide(ui.pause); hide(ui.over); hide(ui.hud); show(ui.menu);
  ui.menuBest.textContent = state.best.toLocaleString();
  clearWorld();
}
function togglePause() {
  if (state.mode === 'playing') { state.mode = 'paused'; show(ui.pause); }
  else if (state.mode === 'paused') { state.mode = 'playing'; hide(ui.pause); clock.getDelta(); }
}
function showGameOver() {
  hide(ui.hud);
  const isBest = state.score > state.best;
  if (isBest) { state.best = Math.floor(state.score); localStorage.setItem('sd3d_best', state.best); }
  ui.newBest.classList.toggle('hidden', !isBest);
  ui.overScore.textContent = Math.floor(state.score).toLocaleString();
  ui.overCoins.textContent = state.coins;
  ui.overBest.textContent = state.best.toLocaleString();
  show(ui.over);
}

function clearWorld() {
  for (const o of worldObjects) scene.remove(o.mesh);
  worldObjects.length = 0;
}

function startGame() {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  clearWorld();
  Object.assign(state, { mode: 'playing', speed: CFG.BASE_SPEED, score: 0, coins: 0, totalDist: 0, magnetT: 0, jetT: 0, boardT: 0, x2T: 0, boardsLeft: 1, combo: 0, comboT: 0, shake: 0 });
  Object.assign(P, { lane: 1, x: 0, targetX: 0, y: 0, vy: 0, grounded: true, rolling: false, rollT: 0, airJumpUsed: false, onRoof: null });
  player.rotation.set(0, 0, 0); player.position.set(0, 0, CFG.PLAYER_Z);
  player.userData.dying = undefined;
  jetMesh.visible = false; boardMesh.visible = false;
  spawnCursor = -40;
  // pre-populate ahead
  for (let i = 0; i < 8; i++) { spawnPattern(spawnCursor - i * 16); }
  hide(ui.menu); hide(ui.over); hide(ui.pause); show(ui.hud);
  updatePowerupUI();
}

// ---------------- Scenery init positions ----------------
const SPAN_GROUND = 12 * GROUND_TILES;
pool.ground.forEach((t, i) => { t.position.set(0, 0, -i * 12 + 10); });
const SPAN_B = 60;
pool.buildings.forEach((b, i) => {
  const row = Math.floor(i / 2);
  b.position.set(b.userData.side * (11 + Math.random() * 4), b.userData.h / 2, -row * (SPAN_B / 13) + 10);
});
const SPAN_W = 12 * WALL_COUNT / 2;
pool.walls.forEach((w, i) => { w.position.set(w.userData.side * 6.4, 2.5, -(i >> 1) * 12 + 10); });
const SPAN_L = 10 * 15;
lamps.forEach((l, i) => { l.position.set(l.userData.side * 5.6, 0, -i * 15 + 10); });

// ---------------- Main loop ----------------
const clock = new THREE.Clock();
let puUIAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  const playing = state.mode === 'playing';
  const dying = state.mode === 'dead';

  // speed & score
  if (playing) {
    state.speed = Math.min(CFG.MAX_SPEED, state.speed + CFG.ACCEL * dt);
    const mult = state.x2T > 0 ? 2 : 1;
    state.score += state.speed * dt * mult;
    state.totalDist += state.speed * dt;
  }

  const scroll = (playing || dying ? (dying ? Math.max(0, state.speed - dt * 40) : state.speed) : 6) * dt;
  if (dying) state.speed = Math.max(0, state.speed - 40 * dt);

  // ---- move world toward player ----
  for (let i = worldObjects.length - 1; i >= 0; i--) {
    const o = worldObjects[i];
    let vz = scroll;
    if (o.type === 'train' && o.mesh.userData.moving) vz = scroll - o.mesh.userData.speed * dt;
    o.mesh.position.z += vz;
    if (o.type === 'coin') o.mesh.rotation.y += dt * 5;
    if (o.type === 'pickup') { o.mesh.children[0].rotation.y += dt * 3; o.mesh.children[1].rotation.z += dt * 2; o.mesh.position.y = 1.2 + Math.sin(state.time * 3 + o.z) * .12; }
    if (o.dead || o.mesh.position.z > CFG.RECYCLE_DIST) { scene.remove(o.mesh); worldObjects.splice(i, 1); }
  }

  // spawn new patterns ahead (also during menu flythrough for ambiance)
  if (playing || state.mode === 'menu') {
    spawnCursor += scroll;
    while (spawnCursor > -CFG.VIEW_DIST) {
      spawnPattern(spawnCursor - 16);
      spawnCursor -= 14 + Math.random() * 8;
    }
  }

  // ---- scenery scroll/wrap ----
  const wrap = (arr, span) => arr.forEach(m => { m.position.z += scroll; if (m.position.z > 14) m.position.z -= span; });
  wrap(pool.ground, SPAN_GROUND);
  wrap(pool.buildings, SPAN_B);
  wrap(pool.walls, 12 * (WALL_COUNT / 2));
  wrap(lamps, 15 * lamps.length);

  // ---- player physics ----
  if (playing || dying) {
    if (!dying) {
      P.x += (P.targetX - P.x) * Math.min(1, dt * 14);
      player.position.x = P.x;
      // gravity
      if (state.jetT > 0) {
        P.y += (7 - P.y) * dt * 3; P.vy = 0; P.grounded = false; P.onRoof = null;
      } else {
        if (P.onRoof) { P.y = 3.3; }
        else {
          P.vy += CFG.GRAVITY * dt;
          P.y += P.vy * dt;
          if (P.y <= 0) { P.y = 0; P.vy = 0; if (!P.grounded) { P.grounded = true; state.shake = Math.max(state.shake, .08); } }
        }
      }
      // roll timer
      if (P.rolling) { P.rollT -= dt; if (P.rollT <= 0) P.rolling = false; }
      // powerup timers
      state.magnetT = Math.max(0, state.magnetT - dt);
      state.x2T = Math.max(0, state.x2T - dt);
      state.jetT = Math.max(0, state.jetT - dt);
      if (state.boardT > 0) {
        state.boardT -= dt;
        if (state.boardT <= 0) boardMesh.visible = false;
      }
      state.comboT -= dt; if (state.comboT <= 0) { state.combo = 0; ui.combo.style.opacity = 0; }
      checkCollisions(dt);
    } else {
      // death ragdoll
      player.userData.dying += dt;
      const d = player.userData.dying;
      player.rotation.x = Math.min(1.4, d * 5);
      player.position.y = Math.max(0, P.y + Math.sin(d * 10) * .2);
    }
    player.position.y = P.y;

    // run animation
    if (!dying) {
      const runF = state.time * (10 + state.speed * .55);
      const ud = player.userData;
      if (P.rolling) {
        ud.body.rotation.x = -1.15; ud.body.position.y = -.45; player.scale.y = .62;
        ud.armL.rotation.x = 1; ud.armR.rotation.x = 1; ud.legL.rotation.x = -.4; ud.legR.rotation.x = .4;
      } else if (!P.grounded || state.jetT > 0) {
        ud.body.rotation.x = .15; ud.body.position.y = 0; player.scale.y = 1;
        ud.armL.rotation.x = -2.2; ud.armR.rotation.x = -2.2;
        ud.legL.rotation.x = .6; ud.legR.rotation.x = -.3;
      } else {
        player.scale.y = 1;
        ud.body.rotation.x = .12 + Math.sin(runF * 2) * .03; ud.body.position.y = 0;
        ud.legL.rotation.x = Math.sin(runF) * 1.1;
        ud.legR.rotation.x = Math.sin(runF + Math.PI) * 1.1;
        ud.armL.rotation.x = Math.sin(runF + Math.PI) * 1.0;
        ud.armR.rotation.x = Math.sin(runF) * 1.0;
        ud.body.position.y = Math.abs(Math.sin(runF)) * .05;
      }
      player.rotation.z = (P.targetX - P.x) * -.12;
    }
  }

  // attach accessories
  boardMesh.visible = state.boardT > 0;
  if (boardMesh.visible) {
    boardMesh.position.set(player.position.x, P.y - .08, CFG.PLAYER_Z);
    boardMesh.rotation.z = player.rotation.z;
    boardMesh.position.y += Math.sin(state.time * 18) * .02;
  }
  jetMesh.visible = state.jetT > 0;
  if (jetMesh.visible) {
    jetMesh.position.set(player.position.x, P.y + .9, CFG.PLAYER_Z + .35);
    const fl = jetMesh.userData.flames;
    fl.forEach(f => { f.scale.y = .7 + Math.random() * .8; });
  }
  blob.position.set(player.position.x, (P.onRoof ? 3.32 : 0.02), CFG.PLAYER_Z);
  blob.material.opacity = Math.max(0, .5 - P.y * .12);

  // ---- camera ----
  const camTargetY = 3.2 + P.y * .45;
  camera.position.x += (player.position.x * .55 - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 5);
  camera.position.z = CFG.PLAYER_Z + 6.5;
  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 2.2);
    camera.position.x += (Math.random() - .5) * state.shake * .5;
    camera.position.y += (Math.random() - .5) * state.shake * .35;
  }
  const lookSpeedLean = player.position.x * .3;
  camera.lookAt(lookSpeedLean, 1.4 + P.y * .3, CFG.PLAYER_Z - 12);
  camera.fov = 70 + (state.speed - CFG.BASE_SPEED) * .5;
  camera.updateProjectionMatrix();

  // sun follows player for consistent shadows
  sun.position.x = player.position.x - 18;
  sun.target.position.x = player.position.x;

  // HUD numbers
  if (playing) {
    ui.score.textContent = Math.floor(state.score).toLocaleString();
    ui.coins.textContent = state.coins;
    puUIAccum += dt;
    if (puUIAccum > .2) { puUIAccum = 0; updatePowerupUI(); }
  }

  renderer.render(scene, camera);
}

// ---------------- resize ----------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// prevent iOS bounce / context menu
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------------- boot ----------------
camera.position.set(0, 3.2, 6.5);
spawnCursor = -40; // menu flythrough spawns patterns continuously in animate()
setTimeout(() => { hide(ui.loading); show(ui.menu); }, 600);
animate();
