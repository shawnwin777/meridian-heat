// Everything drawn: the city, cars, people, particles, the HUD with its live
// minimap, and the title, pause, busted and dead screens.
import { clamp, lerp } from './rng.js';
import { WORLD_W, WORLD_H, ROAD_W, ROAD_LINES, PLACES } from './city.js';
import { MISSION_DEFS, currentWaypoint, missionObjectiveText, nearMissionStart } from './missions.js';

const VIEW_W = 1280;
const VIEW_H = 720;

function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 4, car.len, car.wid);
  // body
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 7);
  ctx.fill();
  // cabin
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -8, -car.wid / 2 + 4, 16, car.wid - 8, 4);
  ctx.fill();
  // headlights / taillights
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(car.len / 2 - 2, -car.wid / 2 + 2, 3, 5);
  ctx.fillRect(car.len / 2 - 2, car.wid / 2 - 7, 3, 5);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(-car.len / 2, -car.wid / 2 + 2, 3, 5);
  ctx.fillRect(-car.len / 2, car.wid / 2 - 7, 3, 5);
  if (car.kind === 'police') {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    const blink = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = blink ? '#ff2d2d' : '#2d6bff';
    ctx.beginPath();
    ctx.arc(-4, -car.wid / 2 + 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = blink ? '#2d6bff' : '#ff2d2d';
    ctx.beginPath();
    ctx.arc(4, -car.wid / 2 + 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // smoke when damaged
  if (car.smoke > 0.25 && Math.random() < car.smoke * 0.5) {
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, 6 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPerson(ctx, x, y, angle, color, isCop) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = color;
  roundRect(ctx, -7, -6, 14, 12, 5);
  ctx.fill();
  ctx.fillStyle = '#f2c89b';
  ctx.beginPath();
  ctx.arc(8, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  if (isCop) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-9, -6, 4, 12);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(-2, -6, 2, 12);
  }
  ctx.restore();
}

export function render(state, ctx, canvas) {
  const cam = state.cam;
  const vw = canvas.width;
  const vh = canvas.height;
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  const ox = (vw - VIEW_W * scale) / 2;
  const oy = (vh - VIEW_H * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, vw, vh);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.save();
  if (state.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }

  if (state.mode === 'title') {
    drawTitle(state, ctx);
    ctx.restore();
    return;
  }

  // Camera: keep the view inside the world.
  const viewX = clamp(cam.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const viewY = clamp(cam.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  ctx.translate(-viewX, -viewY);

  drawWorld(state, ctx, viewX, viewY);
  drawEntities(state, ctx);
  drawWaypoint(state, ctx);
  ctx.restore();

  // Day tint: evening and night get warmer/darker.
  const hour = Math.floor(state.clock / 60);
  if (hour >= 18 || hour < 6) {
    ctx.fillStyle = hour >= 20 || hour < 5 ? 'rgba(10,10,40,0.28)' : 'rgba(255,120,40,0.10)';
    ctx.fillRect(0, 0, vw, vh);
  }
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(231,76,60,${state.flash * 0.5})`;
    ctx.fillRect(0, 0, vw, vh);
  }

  drawHud(state, ctx, vw, vh);
  drawMinimap(state, ctx, vw, vh);
  if (state.banner) drawBanner(state, ctx, vw, vh);
  if (state.mode === 'paused') drawPaused(state, ctx, vw, vh);
  if (state.mode === 'busted' || state.mode === 'dead') drawEndScreen(state, ctx, vw, vh);
}

function drawWorld(state, ctx, viewX, viewY) {
  const city = state.city;
  const x0 = Math.max(0, viewX - 100);
  const y0 = Math.max(0, viewY - 100);
  const x1 = Math.min(WORLD_W, viewX + VIEW_W + 100);
  const y1 = Math.min(WORLD_H, viewY + VIEW_H + 100);

  // Ground: grass base.
  ctx.fillStyle = '#4d7a45';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Park.
  ctx.fillStyle = '#5d9b52';
  ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
  // Pond.
  ctx.fillStyle = '#3d8fc4';
  ctx.fillRect(city.pond.x, city.pond.y, city.pond.w, city.pond.h);

  // Beach sand and sea.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(city.beach.x, city.beach.y, city.beach.w, city.beach.h);
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(3520, 0, 80, WORLD_H);
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(city.portWater.x, city.portWater.y, city.portWater.w, city.portWater.h);
  // Port concrete.
  ctx.fillStyle = '#7a7d84';
  ctx.fillRect(0, 2700, 900, 450);

  // Roads: asphalt with sidewalks.
  for (const line of ROAD_LINES) {
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0, line - ROAD_W / 2, WORLD_W, ROAD_W);
    ctx.fillRect(line - ROAD_W / 2, 0, ROAD_W, WORLD_H);
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(0, line - ROAD_W / 2 - 8, WORLD_W, 8);
    ctx.fillRect(0, line + ROAD_W / 2, WORLD_W, 8);
    ctx.fillRect(line - ROAD_W / 2 - 8, 0, 8, WORLD_H);
    ctx.fillRect(line + ROAD_W / 2, 0, 8, WORLD_H);
    // Centre dashes.
    ctx.fillStyle = '#e8c33a';
    for (let d = 0; d < WORLD_W; d += 60) {
      if (d > x0 - 60 && d < x1) ctx.fillRect(d, line - 2, 30, 4);
      if (d > y0 - 60 && d < y1) ctx.fillRect(line - 2, d, 4, 30);
    }
  }

  // Named places: markers and labels.
  drawPlace(ctx, PLACES.bank, '#f1c40f', '$');
  drawPlace(ctx, PLACES.garage, '#e67e22', 'G');
  drawPlace(ctx, PLACES.clinic, '#e74c3c', '+');
  drawPlace(ctx, PLACES.hideout, '#2ecc71', 'H');
  drawPlace(ctx, PLACES.fixer, '#9b59b6', 'M');
  drawPlace(ctx, PLACES.pier, '#3498db', 'P');
  drawPlace(ctx, PLACES.market, '#f39c12', 'N');

  // Buildings.
  for (const b of city.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Windows.
    ctx.fillStyle = 'rgba(255,240,180,0.85)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i + j) % 2 === 0) ctx.fillRect(b.x + 8 + i * 24, b.y + 8 + j * 24, 10, 12);
      }
    }
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 10);
    }
  }

  // Port crates.
  for (const pr of city.props) {
    if (pr.kind !== 'crate') continue;
    if (pr.x > x1 || pr.x + pr.w < x0 || pr.y > y1 || pr.y + pr.h < y0) continue;
    ctx.fillStyle = pr.color;
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
  }

  // Trees and palms.
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
    ctx.fillStyle = t.palm ? '#2f9e5f' : '#2e7d32';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(t.x - 4, t.y - 8, t.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Street lamps.
  ctx.fillStyle = '#2c3e50';
  for (const l of city.lamps) {
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }
  // Hydrants and bins.
  for (const pr of city.props) {
    if (pr.kind === 'crate') continue;
    if (pr.x < x0 || pr.x > x1 || pr.y < y0 || pr.y > y1) continue;
    ctx.fillStyle = pr.kind === 'hydrant' ? '#e74c3c' : '#5d6d7e';
    ctx.fillRect(pr.x - 4, pr.y - 4, 8, 8);
  }
}

function drawPlace(ctx, place, color, glyph) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(place.x, place.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, place.x, place.y + 1);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(place.name, place.x, place.y + 30);
  ctx.textBaseline = 'alphabetic';
}

function drawEntities(state, ctx) {
  // Cash drops and packages.
  const m = state.mission;
  if (m && m.def.steps[m.step]?.type === 'collect' && m.collect) {
    for (const s of m.collect.spots) {
      if (s.taken) continue;
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', s.x, s.y + 4);
    }
  }
  for (const s of state.packageSpots) {
    if (s.taken) continue;
    const pulse = 1 + Math.sin(state.time * 4 + s.x) * 0.2;
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(s.x - 8 * pulse, s.y - 8 * pulse, 16 * pulse, 16 * pulse);
    ctx.strokeStyle = '#b7950b';
    ctx.strokeRect(s.x - 8 * pulse, s.y - 8 * pulse, 16 * pulse, 16 * pulse);
  }
  // Pickups.
  for (const pk of state.pickups) {
    if (pk.respawn > 0) continue;
    ctx.fillStyle = pk.kind === 'health' ? '#e74c3c' : '#f1c40f';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + 5);
  }
  // Cars.
  for (const car of state.cars) drawCar(ctx, car, state.time);
  // Pedestrians.
  for (const ped of state.peds) {
    if (ped.dead) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color, false);
  }
  // Thugs and foot cops.
  for (const t of state.thugs) {
    drawPerson(ctx, t.x, t.y, t.angle, t.kind === 'cop' ? '#1a1a2e' : '#7b2d26', t.kind === 'cop');
    if (t.kind === 'thug') {
      ctx.fillStyle = '#111';
      ctx.fillRect(t.x - 8, t.y - 16, 16, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(t.x - 8, t.y - 16, 16 * (t.hp / 50), 4);
    }
  }
  // Player.
  const p = state.player;
  if (p.onFoot) {
    drawPerson(ctx, p.x, p.y, p.aimAngle ?? p.angle, '#e67e22', false);
    // Pistol in hand when aiming.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aimAngle ?? p.angle);
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -2, 12, 4);
    ctx.restore();
  }
  // Bullets.
  ctx.fillStyle = '#ffe66d';
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Particles.
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  // Popups.
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  for (const pp of state.popups) {
    ctx.globalAlpha = Math.min(1, pp.life);
    ctx.fillStyle = pp.color;
    ctx.fillText(pp.text, pp.x, pp.y - (1.2 - pp.life) * 30);
  }
  ctx.globalAlpha = 1;
}

function drawWaypoint(state, ctx) {
  const wp = currentWaypoint(state);
  const p = state.player;
  // Mission start marker at Marla's office when no mission is active.
  if (!wp && nearMissionStart(state)) {
    drawMarker(ctx, PLACES.fixer.x, PLACES.fixer.y, '#9b59b6', state.time);
    return;
  }
  if (!wp) return;
  drawMarker(ctx, wp.x, wp.y, '#f1c40f', state.time);
  // Edge arrow pointing to an off-screen waypoint.
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 320) {
    const a = Math.atan2(dy, dx);
    const ax = p.x + Math.cos(a) * 150;
    const ay = p.y + Math.sin(a) * 150;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(d)}m`, ax, ay - 18);
  }
}

function drawMarker(ctx, x, y, color, time) {
  const pulse = 1 + Math.sin(time * 5) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, 26 * pulse);
  ctx.lineTo(14 * pulse, 0);
  ctx.lineTo(0, -26 * pulse);
  ctx.lineTo(-14 * pulse, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 30, 22 * pulse, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHud(state, ctx, vw, vh) {
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  const ox = (vw - VIEW_W * scale) / 2;
  const oy = (vh - VIEW_H * scale) / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);

  // Top-left: health, cash, wanted.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 14, 12, 250, 92, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${state.cash}`, 26, 36);
  // Health bar.
  ctx.fillStyle = '#333';
  ctx.fillRect(26, 46, 180, 12);
  ctx.fillStyle = state.health > 50 ? '#2ecc71' : state.health > 25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(26, 46, 180 * (state.health / state.maxHealth), 12);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`HP ${Math.ceil(state.health)}`, 212, 56);
  // Wanted stars.
  ctx.font = '20px sans-serif';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
  ctx.fillStyle = state.wanted > 0 ? '#ffd700' : 'rgba(255,255,255,0.4)';
  ctx.fillText(stars, 26, 92);
  if (state.wanted > 0) {
    ctx.fillStyle = '#ff5b5b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('WANTED', 150, 90);
  }

  // Top-centre: mission objective.
  const objective = missionObjectiveText(state);
  ctx.font = 'bold 15px sans-serif';
  const ow = ctx.measureText(objective).width + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, (VIEW_W - ow) / 2, 12, ow, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd700';
  ctx.textAlign = 'center';
  ctx.fillText(objective, VIEW_W / 2, 34);

  // Mission timer.
  if (state.mission && state.mission.timeLeft > 0) {
    const t = Math.ceil(state.mission.timeLeft);
    ctx.fillStyle = t < 30 ? '#ff5b5b' : '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, VIEW_W / 2, 70);
  }

  // Top-right: clock, day, packages.
  const hour = Math.floor(state.clock / 60);
  const min = Math.floor(state.clock % 60);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, VIEW_W - 190, 12, 176, 62, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}  Day ${state.day}`, VIEW_W - 26, 36);
  ctx.font = '13px sans-serif';
  ctx.fillText(`Packages ${state.packages}/10`, VIEW_W - 26, 58);

  // Bottom-left: ammo / controls hint.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 14, VIEW_H - 64, 250, 50, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  if (state.player.onFoot) {
    ctx.fillText(`Ammo ${state.ammo} / ${state.ammoReserve}`, 26, VIEW_H - 42);
    ctx.font = '12px sans-serif';
    ctx.fillText('E: enter car   F / click: shoot   R: reload', 26, VIEW_H - 24);
  } else {
    ctx.fillText(`Car HP ${Math.ceil(state.player.car ? state.player.car.hp : 0)}`, 26, VIEW_H - 42);
    ctx.font = '12px sans-serif';
    ctx.fillText('E: exit car   Space: handbrake', 26, VIEW_H - 24);
  }

  // Speedometer when driving.
  if (!state.player.onFoot && state.player.car) {
    const kmh = Math.round(Math.abs(state.player.car.speed) * 0.55);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, VIEW_W - 190, VIEW_H - 64, 176, 50, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh}`, VIEW_W - 70, VIEW_H - 28);
    ctx.font = '13px sans-serif';
    ctx.fillText('km/h', VIEW_W - 26, VIEW_H - 28);
  }

  // Mission start prompt.
  if (nearMissionStart(state)) {
    ctx.fillStyle = 'rgba(155,89,182,0.9)';
    roundRect(ctx, VIEW_W / 2 - 190, VIEW_H - 130, 380, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Press E to start "${MISSION_DEFS[state.missionIndex].title}"`, VIEW_W / 2, VIEW_H - 108);
  }

  // Mission intro message.
  if (state.missionMessageTimer > 0 && state.mission) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const text = state.mission.def.intro;
    ctx.font = '14px sans-serif';
    const w = Math.min(760, ctx.measureText(text).width + 32);
    roundRect(ctx, (VIEW_W - w) / 2, 90, w, 44, 8);
    ctx.fill();
    ctx.fillStyle = '#e8c9f5';
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 117);
  }

  ctx.restore();
}

function drawMinimap(state, ctx, vw, vh) {
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  const ox = (vw - VIEW_W * scale) / 2;
  const oy = (vh - VIEW_H * scale) / 2;
  const SIZE = 190;
  const mx = VIEW_W - SIZE - 14;
  const my = VIEW_H - SIZE - 14;
  const k = SIZE / WORLD_W;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, mx - 6, my - 6, SIZE + 12, SIZE + 12, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, SIZE, SIZE);
  ctx.clip();
  // Base.
  ctx.fillStyle = '#2f5d33';
  ctx.fillRect(mx, my, SIZE, SIZE);
  // Sea and harbour.
  ctx.fillStyle = '#2f7fc4';
  ctx.fillRect(mx + 3520 * k, my, 80 * k, SIZE);
  ctx.fillRect(mx, my + 3150 * k, 620 * k, 450 * k);
  // Park.
  ctx.fillStyle = '#5d9b52';
  ctx.fillRect(mx + state.city.park.x * k, my + state.city.park.y * k, state.city.park.w * k, state.city.park.h * k);
  // Beach.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(mx + 3300 * k, my, 220 * k, SIZE);
  // Roads.
  ctx.strokeStyle = '#8a8f98';
  ctx.lineWidth = 3;
  for (const line of ROAD_LINES) {
    ctx.beginPath();
    ctx.moveTo(mx, my + line * k);
    ctx.lineTo(mx + SIZE, my + line * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx + line * k, my);
    ctx.lineTo(mx + line * k, my + SIZE);
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = 'rgba(20,20,30,0.7)';
  for (const b of state.city.buildings) {
    ctx.fillRect(mx + b.x * k, my + b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k));
  }
  // Waypoint.
  const wp = currentWaypoint(state);
  if (wp) {
    const pulse = 1 + Math.sin(state.time * 6) * 0.3;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(mx + wp.x * k, my + wp.y * k, 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
  } else if (nearMissionStart(state)) {
    ctx.fillStyle = '#9b59b6';
    ctx.beginPath();
    ctx.arc(mx + PLACES.fixer.x * k, my + PLACES.fixer.y * k, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#ff2d2d';
  for (const car of state.police) {
    ctx.beginPath();
    ctx.arc(mx + car.x * k, my + car.y * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = mx + state.player.x * k;
  const py = my + state.player.y * k;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

function drawBanner(state, ctx, vw, vh) {
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  const ox = (vw - VIEW_W * scale) / 2;
  const oy = (vh - VIEW_H * scale) / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  const b = state.banner;
  const color = b.kind === 'win' ? '#2ecc71' : b.kind === 'fail' ? '#e74c3c' : '#9b59b6';
  ctx.globalAlpha = Math.min(1, b.timer > 0.5 ? 1 : b.timer * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, VIEW_H / 2 - 70, VIEW_W, 140);
  ctx.fillStyle = color;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(b.text, VIEW_W / 2, VIEW_H / 2 - 6);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText(b.sub, VIEW_W / 2, VIEW_H / 2 + 30);
  ctx.restore();
}

function drawTitle(state, ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#ff7e2e');
  g.addColorStop(0.55, '#c0392b');
  g.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sun.
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(1020, 180, 90, 0, Math.PI * 2);
  ctx.fill();
  // Skyline silhouette.
  ctx.fillStyle = 'rgba(20,16,40,0.85)';
  const skyline = [120, 200, 150, 260, 180, 230, 140, 300, 170, 210, 250, 160, 190, 220, 130];
  let x = 0;
  for (const h of skyline) {
    ctx.fillRect(x, VIEW_H - 180 - h, 90, 180 + h);
    x += 90;
  }
  // Road with a car.
  ctx.fillStyle = '#22242c';
  ctx.fillRect(0, VIEW_H - 90, VIEW_W, 90);
  ctx.fillStyle = '#e8c33a';
  for (let d = 0; d < VIEW_W; d += 70) ctx.fillRect(d, VIEW_H - 48, 36, 5);
  ctx.save();
  ctx.translate(300, VIEW_H - 62);
  ctx.fillStyle = '#e74c3c';
  roundRect(ctx, -34, -12, 68, 24, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -12, -8, 24, 16, 4);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.fillText('MERIDIAN HEAT', VIEW_W / 2, 170);
  ctx.shadowBlur = 0;
  ctx.font = 'italic 22px sans-serif';
  ctx.fillStyle = '#ffe9c9';
  ctx.fillText('A Port Meridian crime story — drive, steal, run, survive.', VIEW_W / 2, 210);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('You are Rex Dalton, a wheelman new in town. Marla Vane, the fixer, has work for you.', VIEW_W / 2, 300);
  ctx.fillText('Five jobs. One city. Every cop in Port Meridian between you and the money.', VIEW_W / 2, 326);

  const hasSave = state.saveExists;
  const btnY = hasSave ? 400 : 420;
  drawButton(ctx, VIEW_W / 2 - 130, btnY, 260, 56, '#e74c3c', 'START NEW GAME');
  if (hasSave) drawButton(ctx, VIEW_W / 2 - 130, btnY + 70, 260, 56, '#2ecc71', 'CONTINUE');
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('WASD / Arrows — move & drive    E — enter / exit car    F / Click — shoot', VIEW_W / 2, 600);
  ctx.fillText('Shift — run    Space — handbrake    R — reload    M — mute    Esc — pause', VIEW_W / 2, 626);
  ctx.fillText('Steal cars, dodge the police, finish all five jobs for Marla.', VIEW_W / 2, 652);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('An original game. No real places, people, cars or brands.', VIEW_W / 2, 690);
}

function drawButton(ctx, x, y, w, h, color, label) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 7);
}

function drawPaused(state, ctx, vw, vh) {
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  const ox = (vw - VIEW_W * scale) / 2;
  const oy = (vh - VIEW_H * scale) / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 40);
  ctx.font = '17px sans-serif';
  ctx.fillText('Esc / P — resume      M — mute', VIEW_W / 2, VIEW_H / 2 + 10);
  ctx.fillText(`Cash $${state.cash}    Missions done ${state.stats.missionsDone}/5    Packages ${state.packages}/10`, VIEW_W / 2, VIEW_H / 2 + 44);
  ctx.fillText('Your progress auto-saves after every mission.', VIEW_W / 2, VIEW_H / 2 + 78);
  ctx.restore();
}

function drawEndScreen(state, ctx, vw, vh) {
  const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
  const ox = (vw - VIEW_W * scale) / 2;
  const oy = (vh - VIEW_H * scale) / 2;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.fillStyle = 'rgba(10,10,20,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = state.mode === 'busted' ? '#3498db' : '#e74c3c';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(state.mode === 'busted' ? 'BUSTED' : 'WASTED', VIEW_W / 2, VIEW_H / 2 - 50);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(state.bustedReason, VIEW_W / 2, VIEW_H / 2 + 4);
  ctx.fillText(`Cash $${state.cash}    Missions done ${state.stats.missionsDone}/5`, VIEW_W / 2, VIEW_H / 2 + 40);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Press Enter to get back on the streets', VIEW_W / 2, VIEW_H / 2 + 100);
  ctx.restore();
}
