# Meridian Heat

![gta6-01](https://make.fun/badge/gta6-01.svg)
![Rank](https://make.fun/badge/gta6-01/shawnwin777/meridian-heat/rank.svg)
![Reward](https://make.fun/badge/gta6-01/shawnwin777/meridian-heat/reward.svg)

**Meridian Heat** is a 2D top-down open-world crime game set in the sun-soaked
fictional city of **Port Meridian**. You are Rex Dalton, a wheelman new in town,
taking jobs from Marla Vane, a fixer who runs work out of a walk-up office.
Drive the grid streets, steal cars, dodge the Port Meridian police, and finish
all five story jobs — or just cruise the beach, hunt golden packages, and see
how long you can stay out of trouble.

Everything is original: the city, characters, vehicles, names, story, art drawn
in code, and music synthesized live with WebAudio. No real places, people, cars
or brands.

## How to run

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. No build step, no network
requests, no external assets — the game is plain static files under `game/`.

## Controls

| Input | Action |
| --- | --- |
| WASD / Arrow keys | Walk / drive (W accelerate, S brake & reverse, A/D steer) |
| Shift | Run on foot |
| Space | Handbrake / drift |
| E | Enter or exit a car (steal parked and traffic cars) |
| F or mouse click | Shoot the pistol (aim with the mouse) |
| R | Reload |
| M | Mute |
| Esc / P | Pause |
| Enter | Confirm / get back on the streets after being busted |

## Features

- **Open city** — a seeded road grid with varied buildings, a beach and
  boardwalk, a park with a pond, and a port with docks and containers.
- **On foot and by car** — walk, run, steal and drive, with arcade handling,
  drifting, car damage and smoke, and a garage that repairs for $50.
- **Traffic and pedestrians** — AI cars drive the lanes and turn at
  intersections; pedestrians stroll the sidewalks and flee gunfire and
  speeding cars.
- **Wanted system** — 0–5 stars for stealing cars, hitting pedestrians and
  shooting. Police cars and foot cops chase you; the heat fades when you stay
  out of sight. Getting busted or taken down costs cash and drops you at the
  clinic.
- **Missions and story** — five jobs for Marla: a timed delivery, a taxi
  shift with three fares, a getaway chase, four cash drops guarded by thugs,
  and a final bank heist escape. Each has intro text, waypoint markers,
  timers, success/fail states and cash rewards.
- **Combat** — pistol with ammo and reloads, ammo and health pickups, thugs
  who shoot back, and a wanted level that answers back.
- **HUD and minimap** — health, cash, wanted stars, ammo, mission objective
  and timer, game clock, speedometer while driving, and a live minimap with
  roads, police blips and the mission waypoint.
- **Save** — auto-saves after every mission and on pause; Continue from the
  title screen picks up where you left off.
- **Polish** — camera smoothing, particles, screen shake, day tint, and a
  synthesized soundtrack (engine hum, sirens, gunshots, jingles, music loop).

## Files

- `game/index.html` — the page; `game/src/` holds the game in one module per
  job: `main.js` (loop and screens), `city.js` (the city), `state.js` (the
  world state and save), `update.js` (simulation), `render.js` (drawing, HUD
  and minimap), `missions.js` (story jobs), `audio.js` (synthesized sound),
  `input.js`, `rng.js` and `debug.js` (screenshot staging).
- `main.ts` — the entry program; it copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.
- `screenshots/` — four screenshots of the game running in a browser.

Built for the make.fun GTA 6 bounty: https://make.fun/?ref=vzf6m5kx
