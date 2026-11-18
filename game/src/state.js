// The whole game state: player, cars, traffic, pedestrians, police, wanted level,
// cash, health, collectibles, particles and the save file.
import { makeRng, clamp, dist2, circleRect } from './rng.js';
import { ROAD_LINES, WORLD_W, WORLD_H, PLACES } from './city.js';

export const SAVE_KEY = 'meridian-heat-save-v1';

let nextId = 1;

export function makeCar(x, y, angle, color, kind = 'traffic') {
  return {
    id: nextId++, kind, x, y, angle, speed: 0,
    color, len: 44, wid: 22,
    hp: 100, smoke: 0, hitCooldown: 0,
    // traffic AI
    axis: 'x', line: y, dir: 1, cruise: 90 + Math.random() * 60,
    // police AI
    target: null, siren: kind === 'police',
    // parked
    parked: kind === 'parked',
    driver: kind !== 'parked',
  };
}

export function createState(city) {
  const rng = makeRng(987654321);
  const state = {
    mode: 'title', // title | playing | paused | busted | dead | missionEnd
    time: 0, // seconds played
    clock: 9 * 60, // game clock in minutes, starts 09:00
    day: 1,
    cash: 250,
    wanted: 0,
    wantedHeat: 0, // 0..1 progress toward next star
    wantedTimer: 0, // time out of police sight
    health: 100,
    maxHealth: 100,
    ammo: 12,
    ammoReserve: 48,
    missionIndex: 0,
    mission: null,
    missionMessage: '',
    missionMessageTimer: 0,
    packages: 0, // collectible golden packages found, of 10
    packageSpots: [],
    cars: [],
    peds: [],
    police: [],
    thugs: [],
    pickups: [],
    bullets: [],
    particles: [],
    popups: [],
    shake: 0,
    flash: 0,
    bustedReason: '',
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 },
    player: {
      x: 1080, y: 1980, angle: 0, speed: 0,
      onFoot: true, car: null,
      walkSpeed: 175, runSpeed: 305,
      radius: 13,
      punchCooldown: 0, shootCooldown: 0,
      invuln: 0,
    },
    cam: { x: 1080, y: 1980 },
    rng,
    city,
    flags: {},
  };

  // Ten golden packages hidden around the city.
  const spots = [
    { x: 480, y: 1200 }, { x: 1950, y: 480 }, { x: 2850, y: 1650 },
    { x: 750, y: 2550 }, { x: 3450, y: 2400 }, { x: 1650, y: 2850 },
    { x: 2550, y: 1350 }, { x: 1050, y: 3150 }, { x: 3150, y: 750 },
    { x: 2250, y: 3150 },
  ];
  state.packageSpots = spots.map((s) => ({ ...s, taken: false }));

  // Parked cars on the road lanes, plus a starter car near the fixer office.
  for (let i = 0; i < 26; i++) {
    const horizontal = rng.chance(0.5);
    const line = ROAD_LINES[rng.int(0, ROAD_LINES.length - 1)];
    const along = rng.range(120, WORLD_W - 120);
    const lane = rng.chance(0.5) ? 18 : -18;
    const x = horizontal ? along : line + lane;
    const y = horizontal ? line + lane : along;
    const angle = horizontal ? (lane > 0 ? 0 : Math.PI) : (lane > 0 ? Math.PI / 2 : -Math.PI / 2);
    const c = makeCar(x, y, angle, rng.pick(city.carColors), 'parked');
    state.cars.push(c);
  }
  const starter = makeCar(1120, 1950, 0, '#e74c3c', 'parked');
  starter.name = 'Breeze';
  state.cars.push(starter);

  // Traffic cars on the roads.
  for (let i = 0; i < 16; i++) spawnTraffic(state, true);
  // Pedestrians on sidewalks.
  for (let i = 0; i < 26; i++) spawnPed(state, true);

  // Health and ammo pickups at the clinic and a few corners.
  state.pickups.push({ kind: 'health', x: PLACES.clinic.x, y: PLACES.clinic.y + 40, respawn: 0 });
  state.pickups.push({ kind: 'ammo', x: 2250, y: 780, respawn: 0 });
  state.pickups.push({ kind: 'health', x: 1650, y: 1500, respawn: 0 });
  state.pickups.push({ kind: 'ammo', x: 3150, y: 3120, respawn: 0 });

  return state;
}

export function spawnTraffic(state, anywhere = false) {
  const { city, rng, player } = state;
  let x; let y;
  let tries = 0;
  do {
    const p = city.randomRoadPoint(rng);
    x = p.x; y = p.y;
    tries++;
  } while (!anywhere && tries < 20 && dist2(x, y, player.x, player.y) < 500 * 500);
  const horizontal = rng.chance(0.5);
  const line = horizontal ? y : x;
  const car = makeCar(x, y, horizontal ? 0 : Math.PI / 2, rng.pick(city.carColors), 'traffic');
  car.axis = horizontal ? 'x' : 'y';
  car.line = line;
  car.dir = rng.chance(0.5) ? 1 : -1;
  car.angle = horizontal ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  car.speed = car.cruise;
  // Lane offset: drive on the right side of the road.
  if (horizontal) car.y = line + (car.dir > 0 ? 18 : -18);
  else car.x = line + (car.dir > 0 ? -18 : 18);
  state.cars.push(car);
  return car;
}

export function spawnPed(state, anywhere = false) {
  const { city, rng, player } = state;
  let x; let y;
  let tries = 0;
  do {
    const p = city.randomRoadPoint(rng);
    x = p.x; y = p.y;
    tries++;
  } while (!anywhere && tries < 20 && dist2(x, y, player.x, player.y) < 400 * 400);
  const onRoad = rng.chance(0.5);
  const ped = {
    id: nextId++,
    x: onRoad ? x + rng.range(-46, 46) : x,
    y: onRoad ? y : y + rng.range(-46, 46),
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(35, 70),
    color: rng.pick(['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1']),
    flee: 0, wander: rng.range(1, 4),
    dead: false,
  };
  state.peds.push(ped);
  return ped;
}

export function spawnPoliceCar(state) {
  const { player, rng } = state;
  const angle = rng.range(0, Math.PI * 2);
  const d = 650;
  const x = clamp(player.x + Math.cos(angle) * d, 60, WORLD_W - 60);
  const y = clamp(player.y + Math.sin(angle) * d, 60, WORLD_H - 60);
  const car = makeCar(x, y, 0, '#1a1a2e', 'police');
  car.kind = 'police';
  state.cars.push(car);
  state.police.push(car);
  return car;
}

export function spawnFootCop(state) {
  const { player, rng } = state;
  const angle = rng.range(0, Math.PI * 2);
  const d = 420;
  const cop = {
    id: nextId++, kind: 'cop',
    x: clamp(player.x + Math.cos(angle) * d, 60, WORLD_W - 60),
    y: clamp(player.y + Math.sin(angle) * d, 60, WORLD_H - 60),
    angle, speed: 130, hp: 60, shootCooldown: rng.range(0.5, 1.5),
  };
  state.thugs.push(cop);
  return cop;
}

export function addWanted(state, amount) {
  state.wantedHeat = clamp(state.wantedHeat + amount, 0, 5.99);
  const stars = Math.floor(state.wantedHeat);
  if (stars > state.wanted) {
    state.wanted = stars;
    state.wantedTimer = 0;
  }
}

export function addPopup(state, x, y, text, color = '#fff') {
  state.popups.push({ x, y, text, color, life: 1.2 });
}

export function addParticles(state, x, y, color, n = 10, speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = state.rng.range(0, Math.PI * 2);
    const s = state.rng.range(speed * 0.3, speed);
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: state.rng.range(0.3, 0.8), color, size: state.rng.range(2, 5) });
  }
}

export function damagePlayer(state, amount, source = '') {
  const p = state.player;
  if (p.invuln > 0 || state.mode !== 'playing') return;
  state.health = Math.max(0, state.health - amount);
  state.flash = Math.min(0.5, state.flash + 0.25);
  state.shake = Math.min(10, state.shake + 4);
  addParticles(state, p.x, p.y, '#e74c3c', 8, 100);
  if (state.health <= 0) {
    state.mode = 'dead';
    state.bustedReason = source || 'You were taken down on the streets of Port Meridian.';
  }
}

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      health: state.health,
      ammo: state.ammo,
      ammoReserve: state.ammoReserve,
      missionIndex: state.missionIndex,
      packages: state.packageSpots.filter((p) => p.taken).length,
      taken: state.packageSpots.map((p) => (p.taken ? 1 : 0)),
      x: state.player.x, y: state.player.y,
      stats: state.stats,
      day: state.day,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function applySave(state, data) {
  if (!data) return false;
  state.cash = data.cash ?? state.cash;
  state.health = data.health ?? 100;
  state.ammo = data.ammo ?? 12;
  state.ammoReserve = data.ammoReserve ?? 48;
  state.missionIndex = data.missionIndex ?? 0;
  state.stats = { ...state.stats, ...(data.stats ?? {}) };
  state.day = data.day ?? 1;
  state.player.x = data.x ?? state.player.x;
  state.player.y = data.y ?? state.player.y;
  state.player.onFoot = true;
  state.player.car = null;
  if (Array.isArray(data.taken)) {
    state.packageSpots.forEach((p, i) => { p.taken = data.taken[i] === 1; });
    state.packages = state.packageSpots.filter((p) => p.taken).length;
  }
  return true;
}

export function carCorners(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const hl = car.len / 2;
  const hw = car.wid / 2;
  return [
    { x: car.x + c * hl - s * hw, y: car.y + s * hl + c * hw },
    { x: car.x + c * hl + s * hw, y: car.y + s * hl - c * hw },
    { x: car.x - c * hl + s * hw, y: car.y - s * hl - c * hw },
    { x: car.x - c * hl - s * hw, y: car.y - s * hl + c * hw },
  ];
}

export function carsOverlap(a, b) {
  // Circle approximation on the two cars' centres, cheap and good enough.
  const r = (a.len + b.len) / 2 - 6;
  return dist2(a.x, a.y, b.x, b.y) < r * r;
}

export function pointInCar(x, y, car) {
  const dx = x - car.x;
  const dy = y - car.y;
  const c = Math.cos(-car.angle);
  const s = Math.sin(-car.angle);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) < car.len / 2 + 6 && Math.abs(ly) < car.wid / 2 + 6;
}

export function buildingHit(state, x, y, r) {
  return state.city.solidAt(x, y, r);
}
