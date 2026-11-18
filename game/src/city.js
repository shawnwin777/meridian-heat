// Port Meridian: the city itself. A seeded road grid with blocks of buildings, a
// beach and boardwalk on the east edge, a park, a port and docks in the south-west,
// plus the named places missions use (bank, garage, clinic, hideout, fixer office).
import { makeRng, clamp } from './rng.js';

export const WORLD_W = 3600;
export const WORLD_H = 3600;
export const GRID = 300; // distance between road centre lines
export const ROAD_W = 76;

export const ROAD_LINES = [];
for (let i = 0; i < 12; i++) ROAD_LINES.push(150 + i * GRID);

// Named places, all invented.
export const PLACES = {
  bank: { x: 1830, y: 1650, name: 'Meridian Trust Bank' },
  garage: { x: 480, y: 480, name: "Rook's Garage" },
  clinic: { x: 2550, y: 2550, name: 'Sunset Clinic' },
  hideout: { x: 3150, y: 3150, name: 'Safehouse' },
  fixer: { x: 1050, y: 1950, name: "Marla's Office" },
  pier: { x: 450, y: 3150, name: 'Old Pier' },
  market: { x: 2250, y: 750, name: 'Night Market' },
};

const CAR_COLORS = [
  '#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#e67e22',
  '#8e44ad', '#16a085', '#7f8c8d', '#d35400', '#27ae60', '#bdc3c7',
];
const ROOF_COLORS = [
  '#b06a4a', '#7a8a99', '#5d6d7e', '#a1887f', '#6d7a8c', '#8d6e63',
  '#546e7a', '#9c7b54', '#74828f',
];

export function buildCity(seed = 20261117) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const props = [];

  const park = { x: 1386, y: 1386, w: 528, h: 528 }; // 2x2 blocks, centre of town
  const beach = { x: 3300, y: 0, w: 300, h: WORLD_H }; // sand strip, east edge
  const water = { x: 3520, y: 0, w: 80, h: WORLD_H }; // the sea
  const portWater = { x: 0, y: 3150, w: 620, h: 450 }; // harbour basin, south-west
  const port = { x: 0, y: 2700, w: 900, h: 900 };

  const inRect = (x, y, w, h, r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;

  // Buildings, one block at a time. A block sits between four road lines.
  for (let bx = 0; bx < 11; bx++) {
    for (let by = 0; by < 11; by++) {
      const x0 = ROAD_LINES[bx] + ROAD_W / 2 + 8;
      const y0 = ROAD_LINES[by] + ROAD_W / 2 + 8;
      const x1 = ROAD_LINES[bx + 1] - ROAD_W / 2 - 8;
      const y1 = ROAD_LINES[by + 1] - ROAD_W / 2 - 8;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (inRect(x0, y0, bw, bh, park) || inRect(x0, y0, bw, bh, beach) || inRect(x0, y0, bw, bh, port)) continue;
      // Skip blocks holding a named place so the place stays reachable.
      let named = false;
      for (const p of Object.values(PLACES)) {
        if (p.x > x0 - 60 && p.x < x1 + 60 && p.y > y0 - 60 && p.y < y1 + 60) named = true;
      }
      if (named) continue;
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const w = rng.range(70, 150);
        const h = rng.range(70, 150);
        const x = rng.range(x0, x1 - w);
        const y = rng.range(y0, y1 - h);
        const tall = rng.chance(0.22);
        buildings.push({
          x, y, w, h,
          roof: rng.pick(ROOF_COLORS),
          wall: tall ? '#5a6b7d' : '#8d99a6',
          tall,
          windows: rng.int(2, 5),
        });
      }
      // A few trees on the block corners.
      if (rng.chance(0.6)) {
        trees.push({ x: x0 + rng.range(0, 30), y: y0 + rng.range(0, 30), r: rng.range(10, 16) });
      }
    }
  }

  // Park trees and pond.
  for (let i = 0; i < 46; i++) {
    trees.push({
      x: rng.range(park.x + 20, park.x + park.w - 20),
      y: rng.range(park.y + 20, park.y + park.h - 20),
      r: rng.range(11, 19),
    });
  }
  const pond = { x: park.x + 180, y: park.y + 180, w: 150, h: 130 };

  // Beach palms along the boardwalk.
  for (let y = 120; y < WORLD_H; y += 170) {
    trees.push({ x: 3345 + rng.range(-8, 8), y, r: 14, palm: true });
  }
  // Port crates and containers.
  for (let i = 0; i < 14; i++) {
    props.push({
      kind: 'crate',
      x: rng.range(80, 820),
      y: rng.range(2760, 3100),
      w: rng.range(40, 90),
      h: rng.range(30, 60),
      color: rng.pick(['#c0392b', '#2980b9', '#e67e22', '#27ae60', '#7f8c8d']),
    });
  }
  // Street lamps along every road, every other block.
  for (const line of ROAD_LINES) {
    for (let k = 0; k < 12; k++) {
      const p = 150 + k * GRID;
      if (rng.chance(0.5)) lamps.push({ x: line + ROAD_W / 2 + 6, y: p });
      if (rng.chance(0.5)) lamps.push({ x: p, y: line + ROAD_W / 2 + 6 });
    }
  }
  // Hydrants and bins as small props.
  for (let i = 0; i < 40; i++) {
    props.push({
      kind: rng.chance(0.5) ? 'hydrant' : 'bin',
      x: rng.range(100, WORLD_W - 100),
      y: rng.range(100, WORLD_H - 100),
    });
  }

  const waterRects = [water, portWater];

  function solidAt(x, y, r) {
    if (x < r + 8 || y < r + 8 || x > WORLD_W - r - 8 || y > WORLD_H - r - 8) return true;
    for (const w of waterRects) {
      if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) return true;
    }
    if (x + r > pond.x && x - r < pond.x + pond.w && y + r > pond.y && y - r < pond.y + pond.h) return true;
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    for (const p of props) {
      if (p.kind !== 'crate') continue;
      if (x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h) return true;
    }
    return false;
  }

  function nearestRoadPoint(x, y) {
    let bx = ROAD_LINES[0];
    let by = ROAD_LINES[0];
    for (const l of ROAD_LINES) {
      if (Math.abs(l - x) < Math.abs(bx - x)) bx = l;
      if (Math.abs(l - y) < Math.abs(by - y)) by = l;
    }
    return { bx, by };
  }

  function randomRoadPoint(rngFn) {
    const horizontal = rngFn.chance(0.5);
    const line = ROAD_LINES[rngFn.int(0, ROAD_LINES.length - 1)];
    const along = rngFn.range(100, WORLD_W - 100);
    return horizontal ? { x: along, y: line } : { x: line, y: along };
  }

  return {
    buildings, trees, lamps, props, park, pond, beach, waterRects, port, portWater,
    carColors: CAR_COLORS,
    solidAt, nearestRoadPoint, randomRoadPoint,
    clampToWorld: (x, y, r) => ({ x: clamp(x, r + 8, WORLD_W - r - 8), y: clamp(y, r + 8, WORLD_H - r - 8) }),
  };
}
