// Missions and the story of Meridian Heat: a small-time driver in Port Meridian
// working for Marla Vane, a fixer who runs jobs out of a walk-up office. Five jobs,
// each a chain of steps with a waypoint, a timer where it matters, and a cash reward.
import { PLACES } from './city.js';
import { dist2, clamp } from './rng.js';
import { addWanted, addPopup, addParticles, spawnPoliceCar, saveGame } from './state.js';

export const MISSION_DEFS = [
  {
    id: 'first-run',
    title: 'First Run',
    fixer: 'Marla Vane',
    intro: "Marla: 'New driver? Good. Pick up the package at the Old Pier and bring it to my office. Fast, quiet, no cops.'",
    reward: 300,
    timer: 150,
    steps: [
      { type: 'goto', x: PLACES.pier.x, y: PLACES.pier.y, label: 'Pick up the package at the Old Pier' },
      { type: 'goto', x: PLACES.fixer.x, y: PLACES.fixer.y, label: 'Deliver the package to Marla\'s office' },
    ],
  },
  {
    id: 'taxi-shift',
    title: 'Taxi Shift',
    fixer: 'Marla Vane',
    intro: "Marla: 'A cab company owes me. Cover their shift — three fares, all tips yours. Keep the meter running.'",
    reward: 450,
    timer: 240,
    steps: [
      { type: 'pickup', x: 780, y: 780, label: 'Pick up fare 1 near the market' },
      { type: 'goto', x: 3150, y: 1350, label: 'Drop fare 1 at the beach hotels' },
      { type: 'pickup', x: 2550, y: 1950, label: 'Pick up fare 2 downtown' },
      { type: 'goto', x: 480, y: 3150, label: 'Drop fare 2 at the docks' },
      { type: 'pickup', x: 1350, y: 2850, label: 'Pick up fare 3 by the park' },
      { type: 'goto', x: 2250, y: 750, label: 'Drop fare 3 at the Night Market' },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    fixer: 'Marla Vane',
    intro: "Marla: 'A client wants a fast car, no questions. Take any car you like — the cops will notice. Lose them and bring it to the safehouse.'",
    reward: 600,
    timer: 200,
    wantedAtStart: 3,
    steps: [
      { type: 'goto', x: PLACES.hideout.x, y: PLACES.hideout.y, label: 'Escape the police — reach the safehouse' },
    ],
  },
  {
    id: 'cash-drops',
    title: 'Cash Drops',
    fixer: 'Marla Vane',
    intro: "Marla: 'Four stashes hidden around town. Grab them all. Word is the Drift Kings crew is watching the last two — bring a gun.'",
    reward: 800,
    timer: 300,
    steps: [
      {
        type: 'collect', label: 'Collect the cash drops (0/4)',
        spots: [
          { x: 780, y: 1650 }, { x: 2850, y: 750 },
          { x: 1650, y: 2550 }, { x: 3150, y: 2850 },
        ],
      },
    ],
  },
  {
    id: 'meridian-job',
    title: 'The Meridian Job',
    fixer: 'Marla Vane',
    intro: "Marla: 'The big one. Meridian Trust Bank, midday. Crack the vault, grab the cash, and run. Every cop in Port Meridian will be on you. Make it count.'",
    reward: 2500,
    timer: 300,
    steps: [
      { type: 'goto', x: PLACES.bank.x, y: PLACES.bank.y, label: 'Get to Meridian Trust Bank' },
      { type: 'wait', x: PLACES.bank.x, y: PLACES.bank.y, seconds: 8, label: 'Crack the vault — stay at the bank' },
      { type: 'escape', x: PLACES.pier.x, y: PLACES.pier.y, label: 'Escape to the Old Pier — lose the heat' },
    ],
  },
];

export function startMission(state, index) {
  const def = MISSION_DEFS[index];
  if (!def) return false;
  const mission = {
    def, index,
    step: 0,
    timeLeft: def.timer ?? 0,
    collect: null,
    waitLeft: 0,
    banner: null,
    fare: null,
  };
  state.mission = mission;
  state.missionIndex = index;
  state.missionMessage = `${def.title} — ${def.fixer}`;
  state.missionMessageTimer = 6;
  state.banner = { text: def.title, sub: def.intro, timer: 5, kind: 'intro' };
  if (def.wantedAtStart) {
    state.wantedHeat = def.wantedAtStart;
    state.wanted = def.wantedAtStart;
    spawnPoliceCar(state);
    spawnPoliceCar(state);
  }
  setStep(state);
  return true;
}

function setStep(state) {
  const m = state.mission;
  const step = m.def.steps[m.step];
  if (!step) { completeMission(state); return; }
  if (step.type === 'collect') {
    m.collect = { spots: step.spots.map((s) => ({ ...s, taken: false })), count: 0, total: step.spots.length };
  } else {
    m.collect = null;
  }
  if (step.type === 'wait') m.waitLeft = step.seconds;
  // Thugs guard the last two cash drops and the bank vault.
  if (m.def.id === 'cash-drops' && step.type === 'collect') {
    spawnThug(state, 1650, 2550);
    spawnThug(state, 3150, 2850);
  }
  if (m.def.id === 'meridian-job' && step.type === 'wait') {
    spawnThug(state, PLACES.bank.x - 60, PLACES.bank.y + 40);
    spawnThug(state, PLACES.bank.x + 60, PLACES.bank.y - 40);
    state.wantedHeat = 4;
    state.wanted = 4;
    spawnPoliceCar(state);
    spawnPoliceCar(state);
  }
  if (step.type === 'escape') {
    state.wantedHeat = Math.max(state.wantedHeat, 4);
    state.wanted = Math.max(state.wanted, 4);
    spawnPoliceCar(state);
  }
}

export function spawnThug(state, x, y) {
  const thug = {
    id: Math.floor(Math.random() * 1e9), kind: 'thug',
    x, y, angle: 0, speed: 95, hp: 50,
    shootCooldown: state.rng.range(0.8, 1.6),
  };
  state.thugs.push(thug);
  return thug;
}

export function currentWaypoint(state) {
  const m = state.mission;
  if (!m) return null;
  const step = m.def.steps[m.step];
  if (!step) return null;
  if (step.type === 'collect' && m.collect) {
    const next = m.collect.spots.find((s) => !s.taken);
    if (!next) return null;
    return { x: next.x, y: next.y, label: step.label };
  }
  return { x: step.x, y: step.y, label: step.label };
}

export function missionObjectiveText(state) {
  const m = state.mission;
  if (!m) {
    if (state.missionIndex >= MISSION_DEFS.length) return 'Story complete — free roam. Find the golden packages (10).';
    return `Head to Marla's office to start "${MISSION_DEFS[state.missionIndex].title}" — press E at the marker.`;
  }
  const step = m.def.steps[m.step];
  if (!step) return '';
  if (step.type === 'collect' && m.collect) {
    return `Collect the cash drops (${m.collect.count}/${m.collect.total})`;
  }
  if (step.type === 'wait') {
    return `${step.label} (${Math.ceil(m.waitLeft)}s)`;
  }
  return step.label;
}

function advanceStep(state) {
  const m = state.mission;
  m.step++;
  if (m.step >= m.def.steps.length) completeMission(state);
  else setStep(state);
}

export function completeMission(state) {
  const m = state.mission;
  if (!m) return;
  const reward = m.def.reward;
  state.cash += reward;
  state.stats.missionsDone++;
  state.mission = null;
  state.missionIndex = m.index + 1;
  state.banner = {
    text: 'MISSION PASSED',
    sub: `${m.def.title} complete — $${reward} earned.`,
    timer: 4, kind: 'win',
  };
  state.audio.missionWin();
  saveGame(state);
}

export function failMission(state, reason) {
  const m = state.mission;
  if (!m) return;
  state.mission = null;
  state.thugs = state.thugs.filter((t) => t.kind !== 'thug');
  state.banner = { text: 'MISSION FAILED', sub: reason, timer: 4, kind: 'fail' };
  state.audio.fail();
}

export function updateMission(state, dt) {
  const m = state.mission;
  if (!m) return;
  if (m.timeLeft > 0) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) {
      failMission(state, 'Out of time.');
      return;
    }
  }
  const p = state.player;
  const step = m.def.steps[m.step];
  if (!step) return;
  const px = p.x;
  const py = p.y;

  if (step.type === 'goto' || step.type === 'pickup' || step.type === 'escape') {
    const r = step.type === 'pickup' ? 70 : 60;
    if (dist2(px, py, step.x, step.y) < r * r) {
      if (step.type === 'pickup') {
        state.audio.pickup();
        addPopup(state, px, py - 30, 'Fare aboard!', '#f1c40f');
        state.cash += 40;
      }
      advanceStep(state);
    }
    return;
  }
  if (step.type === 'collect' && m.collect) {
    for (const s of m.collect.spots) {
      if (s.taken) continue;
      if (dist2(px, py, s.x, s.y) < 55 * 55) {
        s.taken = true;
        m.collect.count++;
        state.cash += 100;
        state.audio.cash();
        addPopup(state, s.x, s.y - 20, '+$100', '#2ecc71');
        addParticles(state, s.x, s.y, '#f1c40f', 14, 140);
        if (m.collect.count >= m.collect.total) advanceStep(state);
      }
    }
    return;
  }
  if (step.type === 'wait') {
    if (dist2(px, py, step.x, step.y) < 90 * 90) {
      m.waitLeft -= dt;
      if (Math.random() < dt * 6) addParticles(state, step.x + (Math.random() - 0.5) * 40, step.y + (Math.random() - 0.5) * 40, '#f1c40f', 2, 60);
      if (m.waitLeft <= 0) {
        state.cash += 500;
        addPopup(state, px, py - 30, 'Vault cracked! +$500', '#2ecc71');
        advanceStep(state);
      }
    } else {
      m.waitLeft = step.seconds;
    }
  }
}

// Can the player start the next mission here? At Marla's office marker.
export function nearMissionStart(state) {
  if (state.mission) return false;
  if (state.missionIndex >= MISSION_DEFS.length) return false;
  return dist2(state.player.x, state.player.y, PLACES.fixer.x, PLACES.fixer.y) < 90 * 90;
}
