// Screenshot and playtest helpers: deterministic scene presets driven by the
// ?shot= URL parameter. Used only to stage the four screenshots; normal play
// never passes a shot parameter.
import { startMission } from './missions.js';
import { spawnPoliceCar } from './state.js';
import { enterCar } from './update.js';

function stageCar(state, x, y, angle, speed) {
  const car = state.cars.find((c) => c.kind === 'parked');
  if (!car) return null;
  car.x = x;
  car.y = y;
  car.angle = angle;
  enterCar(state, car);
  car.speed = speed;
  state.cam.x = car.x;
  state.cam.y = car.y;
  return car;
}

export function applyShotScene(state, scene) {
  const p = state.player;
  if (scene === 'title') return;
  state.mode = 'playing';
  state.audio.unlock();

  if (scene === 'drive') {
    // Eastbound on the long road past the fixer office, traffic around.
    stageCar(state, 1150, 1950, 0, 300);
  } else if (scene === 'chase') {
    stageCar(state, 1150, 1950, 0, 300);
    state.wantedHeat = 3;
    state.wanted = 3;
    const c1 = spawnPoliceCar(state);
    const c2 = spawnPoliceCar(state);
    const c3 = spawnPoliceCar(state);
    // Stage the pursuit close enough to see: one alongside, two behind.
    c1.x = p.x + 140; c1.y = p.y - 130; c1.angle = 0;
    c2.x = p.x - 260; c2.y = p.y + 40; c2.angle = 0;
    c3.x = p.x - 320; c3.y = p.y - 60; c3.angle = 0;
  } else if (scene === 'mission') {
    startMission(state, 0);
    // Westbound on the road to the Old Pier, first job under way.
    stageCar(state, 1000, 3150, Math.PI, 240);
  } else if (scene === 'playtest') {
    // A quick end-to-end smoke run state: player near the fixer office.
    p.x = 1080;
    p.y = 1980;
    state.cam.x = p.x;
    state.cam.y = p.y;
  }
}
