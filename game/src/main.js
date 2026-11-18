// Meridian Heat — entry point. Boots the canvas, runs the game loop, owns the
// screen state machine (title, playing, paused, busted, dead) and the save file.
import { buildCity } from './city.js';
import { createState, loadSave, applySave, saveGame } from './state.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { updatePlaying, busted } from './update.js';
import { render } from './render.js';
import { startMission, failMission } from './missions.js';
import { applyShotScene } from './debug.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

const city = buildCity(20261117);
const state = createState(city);
const audio = createAudio();
state.audio = audio;
state.saveExists = !!loadSave();
const input = createInput(canvas);

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const autoplay = params.get('autoplay') === '1';

window.__meridian = { state, input, audio };

let last = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function startGame(fromSave) {
  audio.unlock();
  if (fromSave) {
    const data = loadSave();
    if (data) applySave(state, data);
  }
  state.mode = 'playing';
  state.cam.x = state.player.x;
  state.cam.y = state.player.y;
  setStatus('playing');
}

function respawn() {
  // Back on the streets: half health, at the clinic, mission (if any) failed.
  if (state.mission) failMission(state, 'You went down mid-job.');
  state.health = 50;
  state.player.x = 2550;
  state.player.y = 2590;
  if (!state.player.onFoot) {
    state.player.car = null;
    state.player.onFoot = true;
  }
  state.player.invuln = 2;
  state.wanted = 0;
  state.wantedHeat = 0;
  state.police = [];
  state.cam.x = state.player.x;
  state.cam.y = state.player.y;
  state.mode = 'playing';
  saveGame(state);
  setStatus('playing');
}

function handleTitleInput() {
  // Click or Enter starts. Buttons are drawn regions on the canvas.
  const hasSave = state.saveExists;
  const click = input.mouse.clicked;
  const enter = input.wasPressed('confirm');
  const mx = input.mouse.x;
  const my = input.mouse.y;
  const scale = Math.min(canvas.clientWidth / 1280, canvas.clientHeight / 720);
  const ox = (canvas.clientWidth - 1280 * scale) / 2;
  const oy = (canvas.clientHeight - 720 * scale) / 2;
  const lx = (mx - ox) / scale;
  const ly = (my - oy) / scale;
  const newY = hasSave ? 400 : 420;
  const contY = hasSave ? 470 : 0;
  const inNew = lx > 510 && lx < 770 && ly > newY && ly < newY + 56;
  const inCont = hasSave && lx > 510 && lx < 770 && ly > contY && ly < contY + 56;
  if (enter || (click && inNew)) startGame(false);
  else if (click && inCont) startGame(true);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 1) {
    window.__meridian.fps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  // Mouse position in world coordinates, for aiming. Mouse coords are CSS
  // pixels, so the scale uses the canvas's CSS size, not its backing store.
  const scale = Math.min(canvas.clientWidth / 1280, canvas.clientHeight / 720);
  const ox = (canvas.clientWidth - 1280 * scale) / 2;
  const oy = (canvas.clientHeight - 720 * scale) / 2;
  const viewX = Math.max(0, Math.min(3600 - 1280, state.cam.x - 640));
  const viewY = Math.max(0, Math.min(3600 - 720, state.cam.y - 360));
  input.mouse.wx = viewX + (input.mouse.x - ox) / scale;
  input.mouse.wy = viewY + (input.mouse.y - oy) / scale;

  if (input.wasPressed('mute')) {
    const muted = audio.toggleMute();
    setStatus(muted ? 'muted' : 'playing');
  }

  if (state.mode === 'title') {
    handleTitleInput();
  } else if (state.mode === 'playing') {
    if (input.wasPressed('pause')) {
      state.mode = 'paused';
      saveGame(state);
      setStatus('paused');
    } else {
      if (input.wasPressed('reload')) state._reloadRequested = true;
      updatePlaying(state, input, dt);
    }
  } else if (state.mode === 'paused') {
    if (input.wasPressed('pause')) {
      state.mode = 'playing';
      setStatus('playing');
    }
  } else if (state.mode === 'busted' || state.mode === 'dead') {
    if (input.wasPressed('confirm')) respawn();
  }

  render(state, ctx, canvas);
  input.endFrame();
  requestAnimationFrame(frame);
}

// Expose a tiny hook the playtest script uses to drive the game.
window.__meridian.startGame = startGame;
window.__meridian.respawn = respawn;
window.__meridian.startMission = (i) => startMission(state, i);
window.__meridian.enterNearestCar = () => {
  const p = state.player;
  let best = null;
  let bestD = 1e12;
  for (const c of state.cars) {
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) {
    // enterCar is imported by update.js; do it through the state directly here.
    p.onFoot = false;
    p.car = best;
    best.parked = false;
    best.kind = 'player';
    best.driver = true;
    p.x = best.x;
    p.y = best.y;
  }
};

// Screenshot staging: ?shot=drive|chase|mission|title starts the scene directly.
if (shot && shot !== 'title') {
  applyShotScene(state, shot);
  setStatus(`shot:${shot}`);
} else if (shot === 'title') {
  setStatus('title');
} else if (autoplay) {
  startGame(false);
}

requestAnimationFrame(frame);
