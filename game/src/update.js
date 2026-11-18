// Per-frame simulation: driving and walking, traffic and pedestrians, police,
// thugs and bullets, the wanted level, pickups and the camera.
import { clamp, lerp, angleLerp, angleTo, dist2, circleRect } from './rng.js';
import { WORLD_W, WORLD_H, ROAD_LINES, PLACES } from './city.js';
import {
  spawnTraffic, spawnPed, spawnPoliceCar, spawnFootCop, addWanted,
  addPopup, addParticles, damagePlayer, saveGame, carsOverlap, pointInCar,
  buildingHit,
} from './state.js';
import { updateMission, nearMissionStart, startMission } from './missions.js';

const FOOT_RADIUS = 13;

function moveWithCollisions(state, x, y, r) {
  const city = state.city;
  // X axis, then Y axis, so the player slides along walls.
  if (!city.solidAt(x, state.player.y, r)) state.player.x = x;
  if (!city.solidAt(state.player.x, y, r)) state.player.y = y;
}

export function updatePlaying(state, input, dt) {
  const p = state.player;
  const city = state.city;
  state.time += dt;
  state.clock = (state.clock + dt * 2) % (24 * 60); // a game day lasts 12 real minutes
  if (state.clock < dt * 2) state.day++;

  // --- banners, popups, particles ---
  if (state.banner) {
    state.banner.timer -= dt;
    if (state.banner.timer <= 0) state.banner = null;
  }
  if (state.missionMessageTimer > 0) state.missionMessageTimer -= dt;
  state.popups = state.popups.filter((pp) => (pp.life -= dt) > 0);
  state.particles = state.particles.filter((pt) => {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    return pt.life > 0;
  });
  state.shake = Math.max(0, state.shake - dt * 22);
  state.flash = Math.max(0, state.flash - dt * 1.4);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;

  // --- wanted decay: out of police sight it fades ---
  if (state.wanted > 0) {
    const seen = state.police.some((c) => dist2(c.x, c.y, p.x, p.y) < 520 * 520)
      || state.thugs.some((t) => t.kind === 'cop' && dist2(t.x, t.y, p.x, p.y) < 380 * 380);
    if (!seen) {
      state.wantedTimer += dt;
      if (state.wantedTimer > 6) {
        state.wantedHeat = Math.max(0, state.wantedHeat - dt * 0.25);
        const stars = Math.floor(state.wantedHeat);
        if (stars < state.wanted) {
          state.wanted = stars;
          state.wantedTimer = 0;
          if (state.wanted === 0) {
            state.police = [];
            state.thugs = state.thugs.filter((t) => t.kind === 'thug');
            addPopup(state, p.x, p.y - 40, 'You lost the heat.', '#2ecc71');
          }
        }
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  // --- police spawning to match the wanted level ---
  const wantPolice = state.wanted >= 3 ? 3 : state.wanted >= 2 ? 2 : state.wanted >= 1 ? 1 : 0;
  if (state.police.length < wantPolice && Math.random() < dt * 0.8) spawnPoliceCar(state);
  if (state.wanted >= 2 && p.onFoot && Math.random() < dt * 0.25
    && state.thugs.filter((t) => t.kind === 'cop').length < state.wanted) spawnFootCop(state);

  // --- car collision cooldowns ---
  for (const c of state.cars) if (c.hitCooldown > 0) c.hitCooldown -= dt;

  // --- player ---
  if (p.onFoot) updateOnFoot(state, input, dt);
  else updateDriving(state, input, dt);

  updateTraffic(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt);
  updateThugs(state, dt);
  updateBullets(state, dt);
  updatePickups(state, dt);
  updateMission(state, dt);

  // --- garage repair: drive into Rook's Garage, pay $50, car fixed ---
  if (!p.onFoot && p.car && dist2(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 110 * 110) {
    if (p.car.hp < 100 && state.cash >= 50) {
      state.cash -= 50;
      p.car.hp = 100;
      p.car.smoke = 0;
      state.audio.cash();
      addPopup(state, p.x, p.y - 40, 'Car repaired -$50', '#2ecc71');
      addParticles(state, p.x, p.y, '#2ecc71', 12, 90);
    }
  }

  // --- mission start prompt ---
  if (nearMissionStart(state)) {
    if (input.wasPressed('enter')) {
      state.audio.missionStart();
      startMission(state, state.missionIndex);
    }
  }

  // --- collectible packages ---
  for (const s of state.packageSpots) {
    if (!s.taken && dist2(p.x, p.y, s.x, s.y) < 40 * 40) {
      s.taken = true;
      state.packages++;
      state.cash += 150;
      state.audio.cash();
      addPopup(state, s.x, s.y - 20, 'Golden package! +$150', '#f1c40f');
      addParticles(state, s.x, s.y, '#f1c40f', 16, 150);
      saveGame(state);
    }
  }

  // --- camera follows with smoothing ---
  const camTarget = p;
  state.cam.x = lerp(state.cam.x, camTarget.x, 1 - Math.pow(0.001, dt));
  state.cam.y = lerp(state.cam.y, camTarget.y, 1 - Math.pow(0.001, dt));

  // --- audio ---
  const speed01 = p.onFoot ? 0 : clamp(Math.abs(p.car ? p.car.speed : 0) / 420, 0, 1);
  state.audio.engine(speed01, !p.onFoot);
  state.audio.siren(state.wanted > 0 && state.police.length > 0, dt);

  // --- keep traffic and peds populated near the player ---
  if (state.cars.filter((c) => c.kind === 'traffic').length < 14 && Math.random() < dt * 1.5) spawnTraffic(state);
  if (state.peds.length < 24 && Math.random() < dt * 1.5) spawnPed(state);
}

function updateOnFoot(state, input, dt) {
  const p = state.player;
  const ax = input.axis();
  const running = input.down('run');
  const speed = running ? p.runSpeed : p.walkSpeed;
  let vx = ax.x;
  let vy = ax.y;
  const len = Math.hypot(vx, vy);
  if (len > 0) { vx /= len; vy /= len; }
  const nx = p.x + vx * speed * dt;
  const ny = p.y + vy * speed * dt;
  moveWithCollisions(state, nx, ny, FOOT_RADIUS);
  if (len > 0) p.angle = Math.atan2(vy, vx);

  // Aim with the mouse.
  const mx = input.mouse.wx;
  const my = input.mouse.wy;
  if (Math.hypot(mx - p.x, my - p.y) > 20) p.aimAngle = Math.atan2(my - p.y, mx - p.x);

  // Punch: F when close to a ped or thug.
  if ((input.wasPressed('attack') || input.mouse.clicked) && p.shootCooldown <= 0) {
    shoot(state);
  }
  // Enter a car.
  if (input.wasPressed('enter')) {
    const car = nearestCar(state, p.x, p.y, 70);
    if (car) enterCar(state, car);
  }
}

function shoot(state) {
  const p = state.player;
  if (p.shootCooldown > 0) return;
  // Close quarters: punch instead of wasting a bullet.
  const near = state.thugs.find((t) => dist2(p.x, p.y, t.x, t.y) < 42 * 42);
  if (near) {
    p.shootCooldown = 0.35;
    near.hp -= 25;
    state.audio.punch();
    addParticles(state, near.x, near.y, '#f1c40f', 6, 90);
    return;
  }
  if (state.ammo <= 0) {
    state.audio.fail();
    addPopup(state, p.x, p.y - 30, 'No ammo — find an ammo pickup', '#e74c3c');
    p.shootCooldown = 0.4;
    return;
  }
  p.shootCooldown = 0.22;
  state.ammo--;
  state.stats.shotsFired++;
  const a = p.aimAngle ?? p.angle;
  state.bullets.push({
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
    life: 0.9, from: 'player', damage: 34,
  });
  state.audio.gunshot();
  state.shake = Math.min(8, state.shake + 2);
  addWanted(state, 0.34);
}

function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const c of state.cars) {
    const d = dist2(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  p.onFoot = false;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  car.parked = false;
  car.kind = car.kind === 'police' ? 'police' : 'player';
  car.driver = true;
  if (car.kind === 'player') {
    state.stats.carsStolen++;
    addWanted(state, 0.5);
    state.audio.pickup();
    addPopup(state, car.x, car.y - 40, 'Car taken!', '#f1c40f');
  }
}

export function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  p.onFoot = true;
  p.car = null;
  car.speed = 0;
  car.kind = 'parked';
  // Step out to the side of the car.
  const side = Math.PI / 2;
  p.x = car.x + Math.cos(car.angle + side) * 34;
  p.y = car.y + Math.sin(car.angle + side) * 34;
  const cl = state.city.clampToWorld(p.x, p.y, FOOT_RADIUS);
  p.x = cl.x; p.y = cl.y;
}

function updateDriving(state, input, dt) {
  const p = state.player;
  const car = p.car;
  if (!car) { p.onFoot = true; return; }
  const ax = input.axis();
  const maxSpeed = car.kind === 'police' ? 460 : 430;
  const accel = 340;
  const brake = 520;
  const reverseMax = 160;

  if (ax.y < 0) car.speed += accel * dt;
  else if (ax.y > 0) {
    if (car.speed > 5) car.speed -= brake * dt;
    else car.speed -= accel * 0.6 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 120 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  car.speed = clamp(car.speed, -reverseMax, maxSpeed);

  const steer = ax.x;
  const grip = input.down('brake') ? 0.45 : 1; // Space = handbrake drift
  const turnRate = (2.6 - Math.min(1.4, Math.abs(car.speed) / 320)) * grip;
  if (Math.abs(car.speed) > 5) {
    car.angle += steer * turnRate * dt * Math.sign(car.speed);
    if (input.down('brake') && Math.abs(car.speed) > 120) {
      if (Math.random() < dt * 20) addParticles(state, car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18, '#cccccc', 1, 40);
    }
  }

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const r = 12; // half the car's width: the road is 76 wide, so this keeps cars on it
  // Car vs building: stop with a thud.
  if (!state.city.solidAt(nx, car.y, r)) car.x = nx;
  else if (Math.abs(car.speed) > 60) { car.speed *= -0.3; state.audio.crash(); state.shake = Math.min(10, state.shake + 5); damageCar(state, car, 8); }
  if (!state.city.solidAt(car.x, ny, r)) car.y = ny;
  else if (Math.abs(car.speed) > 60) { car.speed *= -0.3; state.audio.crash(); state.shake = Math.min(10, state.shake + 5); damageCar(state, car, 8); }
  const cl = state.city.clampToWorld(car.x, car.y, r);
  car.x = cl.x; car.y = cl.y;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  // Car vs car.
  for (const other of state.cars) {
    if (other === car || other.kind === 'player') continue;
    if (carsOverlap(car, other)) {
      const d = Math.abs(car.speed - (other.speed || 0));
      if (d > 40 && car.hitCooldown <= 0) {
        state.audio.crash();
        state.shake = Math.min(10, state.shake + 4);
        damageCar(state, car, 6);
        damageCar(state, other, 6);
        car.hitCooldown = 0.5;
        other.hitCooldown = 0.5;
      }
      // Push apart.
      const a = angleTo(other.x, other.y, car.x, car.y);
      car.x += Math.cos(a) * 2;
      car.y += Math.sin(a) * 2;
      car.speed *= 0.92;
      if (other.kind === 'traffic') other.speed *= 0.5;
    }
  }
  // Car vs pedestrian: peds get hit, wanted rises.
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (pointInCar(ped.x, ped.y, car) && Math.abs(car.speed) > 40) {
      ped.dead = true;
      state.stats.pedsHit++;
      addWanted(state, 0.8);
      addParticles(state, ped.x, ped.y, '#e74c3c', 12, 130);
      addPopup(state, ped.x, ped.y - 20, 'Pedestrian hit!', '#e74c3c');
      state.audio.crash();
    }
  }

  if (input.wasPressed('enter')) exitCar(state);
  if (input.wasPressed('attack') || input.mouse.clicked) {
    // Honk / no shooting from a car.
    if (Math.random() < 0.5) state.audio.phone();
  }
}

function damageCar(state, car, amount) {
  car.hp = Math.max(0, car.hp - amount);
  car.smoke = clamp(1 - car.hp / 100, 0, 1);
  if (car.hp <= 0 && car.kind === 'player') {
    addParticles(state, car.x, car.y, '#555', 30, 200);
    state.audio.crash();
    exitCar(state);
    addPopup(state, car.x, car.y - 40, 'Your car is wrecked!', '#e74c3c');
    state.cars = state.cars.filter((c) => c !== car);
  }
}

function updateTraffic(state, dt) {
  const p = state.player;
  for (const car of [...state.cars]) {
    if (car.kind !== 'traffic') continue;
    // Drive along its road; at an intersection, sometimes turn.
    const speed = car.cruise * (car.slowTimer > 0 ? 0.25 : 1);
    if (car.slowTimer > 0) car.slowTimer -= dt;
    const step = speed * dt * car.dir;
    let nx = car.x;
    let ny = car.y;
    if (car.axis === 'x') nx += step;
    else ny += step;
    // Intersection check.
    const nearLine = ROAD_LINES.some((l) => Math.abs((car.axis === 'x' ? ny : nx) - l) < 4);
    if (nearLine && Math.random() < dt * 0.9) {
      // Turn onto the crossing road.
      const cross = ROAD_LINES.reduce((best, l) => (Math.abs(l - (car.axis === 'x' ? car.y : car.x)) < Math.abs(best - (car.axis === 'x' ? car.y : car.x)) ? l : best), ROAD_LINES[0]);
      if (car.axis === 'x') {
        car.axis = 'y';
        car.line = cross;
        car.y = cross + (car.dir > 0 ? -18 : 18);
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.axis = 'x';
        car.line = cross;
        car.x = cross + (car.dir > 0 ? 18 : -18);
        car.angle = car.dir > 0 ? 0 : Math.PI;
      }
      continue;
    }
    // Stop at world edge: turn around.
    if (nx < 60 || nx > WORLD_W - 60 || ny < 60 || ny > WORLD_H - 60) {
      car.dir *= -1;
      car.angle += Math.PI;
      continue;
    }
    // Avoid the car ahead.
    const ahead = state.cars.find((o) => o !== car && o.kind === 'traffic'
      && Math.abs(o.x - car.x) < 60 && Math.abs(o.y - car.y) < 60);
    if (ahead && Math.abs(car.speed) > 0) car.slowTimer = 0.4;
    car.x = nx;
    car.y = ny;
    // Keep on the lane.
    if (car.axis === 'x') car.y = car.line + (car.dir > 0 ? 18 : -18);
    else car.x = car.line + (car.dir > 0 ? -18 : 18);
    car.speed = speed;
    // Despawn far away traffic, respawn near the player.
    if (dist2(car.x, car.y, p.x, p.y) > 1600 * 1600) {
      state.cars = state.cars.filter((c) => c !== car);
      spawnTraffic(state);
    }
  }
}

function updatePeds(state, dt) {
  const p = state.player;
  for (const ped of [...state.peds]) {
    if (ped.dead) continue;
    const gunfireNear = state.bullets.some((b) => dist2(b.x, b.y, ped.x, ped.y) < 200 * 200);
    const carNear = !p.onFoot && p.car && dist2(p.x, p.y, ped.x, ped.y) < 120 * 120 && Math.abs(p.car.speed) > 100;
    if (gunfireNear || carNear) ped.flee = 2.5;
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = angleTo(p.x, p.y, ped.x, ped.y);
      ped.angle = a;
      ped.x += Math.cos(a) * 150 * dt;
      ped.y += Math.sin(a) * 150 * dt;
    } else {
      ped.wander -= dt;
      if (ped.wander <= 0) {
        ped.wander = state.rng.range(1, 5);
        ped.angle = state.rng.range(0, Math.PI * 2);
      }
      const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      if (!state.city.solidAt(nx, ny, 10)) { ped.x = nx; ped.y = ny; }
      else ped.angle += Math.PI / 2;
    }
    const cl = state.city.clampToWorld(ped.x, ped.y, 10);
    ped.x = cl.x; ped.y = cl.y;
    if (dist2(ped.x, ped.y, p.x, p.y) > 1500 * 1500) {
      state.peds = state.peds.filter((q) => q !== ped);
      spawnPed(state);
    }
  }
  state.peds = state.peds.filter((ped) => !ped.dead || Math.random() < 0.001);
}

function updatePolice(state, dt) {
  const p = state.player;
  for (const car of [...state.police]) {
    if (car.kind === 'player') continue; // player stole a police car: it is no longer police
    const targetAngle = angleTo(car.x, car.y, p.x, p.y);
    car.angle = angleLerp(car.angle, targetAngle, 1 - Math.pow(0.05, dt));
    const targetSpeed = dist2(car.x, car.y, p.x, p.y) > 90 * 90 ? 380 : 140;
    car.speed = lerp(car.speed, targetSpeed, 1 - Math.pow(0.2, dt));
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!state.city.solidAt(nx, car.y, 14)) car.x = nx;
    else { car.angle += Math.PI / 3; }
    if (!state.city.solidAt(car.x, ny, 14)) car.y = ny;
    else { car.angle += Math.PI / 3; }
    // Ram the player's car.
    if (!p.onFoot && p.car && carsOverlap(car, p.car)) {
      if (car.hitCooldown <= 0) {
        damageCar(state, p.car, 8);
        state.shake = Math.min(10, state.shake + 3);
        state.audio.crash();
        car.hitCooldown = 0.7;
      }
    }
    // Busted: a police car touches the player on foot.
    if (p.onFoot && dist2(car.x, car.y, p.x, p.y) < 40 * 40) {
      busted(state, 'The Port Meridian police caught you on foot.');
    }
    // Despawn police that fell far behind when the heat is gone.
    if (state.wanted === 0 && dist2(car.x, car.y, p.x, p.y) > 1200 * 1200) {
      state.police = state.police.filter((c) => c !== car);
      state.cars = state.cars.filter((c) => c !== car);
    }
  }
}

export function busted(state, reason) {
  const fine = Math.min(state.cash, 200);
  state.cash -= fine;
  state.wanted = 0;
  state.wantedHeat = 0;
  state.police = [];
  state.cars = state.cars.filter((c) => c.kind !== 'police');
  state.thugs = state.thugs.filter((t) => t.kind === 'thug');
  state.mode = 'busted';
  state.bustedReason = `${reason} You paid a $${fine} fine.`;
  state.audio.busted();
  saveGame(state);
}

function updateThugs(state, dt) {
  const p = state.player;
  for (const t of [...state.thugs]) {
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    t.angle = angleTo(t.x, t.y, p.x, p.y);
    if (d > 320) {
      t.x += Math.cos(t.angle) * t.speed * dt;
      t.y += Math.sin(t.angle) * t.speed * dt;
    } else if (d < 180) {
      t.x -= Math.cos(t.angle) * t.speed * 0.5 * dt;
      t.y -= Math.sin(t.angle) * t.speed * 0.5 * dt;
    }
    if (state.city.solidAt(t.x, t.y, 12)) {
      t.x -= Math.cos(t.angle) * t.speed * dt;
      t.y -= Math.sin(t.angle) * t.speed * dt;
    }
    t.shootCooldown -= dt;
    if (t.shootCooldown <= 0 && d < 420) {
      t.shootCooldown = state.rng.range(0.9, 1.8);
      const a = t.angle + state.rng.range(-0.12, 0.12);
      state.bullets.push({
        x: t.x + Math.cos(a) * 20, y: t.y + Math.sin(a) * 20,
        vx: Math.cos(a) * 460, vy: Math.sin(a) * 460,
        life: 1.1, from: t.kind, damage: 9,
      });
      state.audio.gunshot();
    }
    if (t.hp <= 0) {
      addParticles(state, t.x, t.y, '#e74c3c', 14, 150);
      state.thugs = state.thugs.filter((q) => q !== t);
      state.cash += 25;
      addPopup(state, t.x, t.y - 20, '+$25', '#2ecc71');
    }
  }
}

function updateBullets(state, dt) {
  const p = state.player;
  for (const b of [...state.bullets]) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let hit = b.life <= 0 || state.city.solidAt(b.x, b.y, 2);
    if (!hit) {
      if (b.from === 'player') {
        for (const t of state.thugs) {
          if (dist2(b.x, b.y, t.x, t.y) < 16 * 16) {
            t.hp -= b.damage;
            hit = true;
            addParticles(state, b.x, b.y, '#e74c3c', 6, 100);
            break;
          }
        }
        if (!hit) {
          for (const ped of state.peds) {
            if (!ped.dead && dist2(b.x, b.y, ped.x, ped.y) < 14 * 14) {
              ped.dead = true;
              state.stats.pedsHit++;
              addWanted(state, 0.8);
              addParticles(state, b.x, b.y, '#e74c3c', 10, 120);
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const car of state.cars) {
            if (car.kind === 'player') continue;
            if (pointInCar(b.x, b.y, car)) {
              damageCar(state, car, b.damage);
              addParticles(state, b.x, b.y, '#f1c40f', 6, 100);
              if (car.kind === 'traffic') addWanted(state, 0.3);
              hit = true;
              break;
            }
          }
        }
      } else if (p.onFoot && dist2(b.x, b.y, p.x, p.y) < 15 * 15) {
        damagePlayer(state, b.damage, 'Shot down in the streets of Port Meridian.');
        hit = true;
      } else if (!p.onFoot && p.car && pointInCar(b.x, b.y, p.car)) {
        damageCar(state, p.car, b.damage * 0.5);
        hit = true;
      }
    }
    if (hit) {
      state.bullets = state.bullets.filter((q) => q !== b);
      addParticles(state, b.x, b.y, '#f1c40f', 3, 60);
    }
  }
}

function updatePickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    if (pk.respawn > 0) {
      pk.respawn -= dt;
      continue;
    }
    if (dist2(p.x, p.y, pk.x, pk.y) < 34 * 34) {
      if (pk.kind === 'health' && state.health < state.maxHealth) {
        state.health = Math.min(state.maxHealth, state.health + 50);
        state.audio.pickup();
        addPopup(state, pk.x, pk.y - 20, '+50 HP', '#2ecc71');
        pk.respawn = 45;
      } else if (pk.kind === 'ammo') {
        state.ammoReserve += 24;
        state.ammo = Math.min(12, state.ammo + 12);
        state.audio.pickup();
        addPopup(state, pk.x, pk.y - 20, '+Ammo', '#f1c40f');
        pk.respawn = 45;
      }
    }
  }
  // Reload from reserve with R.
  if (state._reloadRequested) {
    state._reloadRequested = false;
    if (state.ammo < 12 && state.ammoReserve > 0) {
      const need = 12 - state.ammo;
      const take = Math.min(need, state.ammoReserve);
      state.ammo += take;
      state.ammoReserve -= take;
      state.audio.pickup();
    }
  }
}
