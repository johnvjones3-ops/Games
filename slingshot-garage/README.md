# Slingshot Garage

**Launch it. Drive it. Upgrade it. Evolve it.**

A physics distance game for phones and desktop browsers. You fire your car from a giant slingshot,
drive it as far as the fuel allows, and spend what you earn on parts. As the parts pile up, the car
visibly evolves from a wooden soapbox into a quantum hover-racer.

It's a ground-up remake of the "launch and upgrade" loop popularized by mobile games like *Car Evolve*:
all original code and art, no ads, no purchases, and a lot more depth.

## Play

- **Easiest:** open `dist/slingshot-garage.html` in any browser. It's a single self-contained file
  that works offline, even from `file://`.
- **Dev server:** `npm start`, then visit <http://localhost:8080>. On a phone served over HTTPS
  you can "Add to Home Screen" and it runs full-screen and offline (PWA).

### Controls

| | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Aim and launch | Drag back anywhere, release | ↑/↓ angle, ←/→ power, Space | A |
| Gas / lean back (in air) | Right button | → or D | Right trigger |
| Brake, reverse / lean forward (in air) | Left button | ← or A | Left trigger |
| Rocket booster | Rocket button | Space | A |
| Pause | ⏸ | Esc or P | Start |

## What's in it

**Physics**
- Rigid-body chassis with two ray-cast spring/damper suspension wheels, traction limited by tire grip,
  rolling resistance, quadratic drag, and impulse-based collisions for the body and roof.
- Wheelies, flips, nose-dives and crash damage all come out of the simulation, stepped at a fixed 240 Hz.
- Air control targets an angular *velocity* instead of applying raw torque, plus an optional landing
  assist. A button you were already holding when you left the ground won't tilt the car until you
  press it again, so cresting a hill at full gas doesn't flip you.

**World**
- Procedural, seeded terrain built from fractal noise and Catmull-Rom splines, with ramps, mesa
  terraces and craters. Every device generates the same world for a given seed.
- 8 regions with their own look *and* physics: Green Meadows, Sunset Dunes (slippery sand),
  Red Rock Canyon, Frozen Peaks (ice), Ember Wastes, Neon Skyway (grippy asphalt),
  Lunar Highlands (low gravity) and the Cosmic Rift.
- Pickups: coins (value rises with distance), star coins, fuel cans, rocket fuel, breakable crates and
  boost pads. Fuel cans get further apart the deeper you go.

**Progression**
- 12 upgrades: Slingshot, Engine, Fuel Tank, Tires, Armor, Coin Value, Suspension, Aerodynamics,
  Coin Magnet, Rocket Booster, Rocket Fuel and Glider Wings. The later ones unlock by distance.
- 11 evolution stages driven by your total upgrade level, each with its own vector art. Upgrades also
  show up on the car: rocket nozzle, wings, spoiler, exhausts, armor plating, magnet antenna,
  supercharger, bigger tires and colored springs.
- Stunts pay out: flips, perfect landings, hang time and big air.
- **Generations (prestige):** past 2 km you can evolve into a new world for DNA, which buys permanent
  perks such as coin bonuses, launch power, discounts, a head start and more.
- 3 rotating missions with free swaps, 28 trophies, a daily streak bonus, a ghost car of your best
  run, lifetime stats, paint jobs, and export/import save codes.

**Presentation**
- Three parallax layers per region plus clouds and stars, day/night skies, sun, moon, Earth and a ringed planet, weather
  (snow, dust, embers, sparkles), particles, screen shake and speed lines.
- Synthesized audio (engine note that follows RPM, wind, rocket roar, SFX) plus a generative
  music loop. There are no audio files.
- Responsive UI for portrait phones, landscape and desktop, safe-area aware for notched phones.
  Haptics on Android, respects the system reduced-motion preference, and has graphics quality levels.

### Compared with the original

Player reviews of the original mostly complained about twitchy steering, constant ads, repetitive
maps and hills that hard-block progress. This version addresses each of those: smoothed air control,
the held-button rule and landing assist; no ads at all; 8 distinct regions and a new world every
generation; and terrain tuned with the balance simulator so there are no unclimbable walls.

## Development

```
npm test                         # unit tests (node:test, no dependencies)
npm run sim -- 150 1 --evolve    # balance simulator: an autopilot plays and shops
npm run smoke                    # headless-browser smoke test + screenshots (needs Playwright)
node tools/build-single.mjs      # rebuild dist/slingshot-garage.html
node tools/make-icons.mjs        # rasterize icons/icon.svg into PNGs
```

The balance simulator plays real runs through the same physics with an autopilot, buys upgrades
greedily, and prints when each region is first reached. Across seeds 1–3 the current tuning reaches
the desert in 4–6 minutes, the canyon in 12–18, snow in 27–46 and the Ember Wastes in 70–85, and it
lands on the Moon after roughly 3–4 hours spread over several generations. That's an autopilot
with a fixed per-run overhead; real players will vary.

### Layout

```
index.html, styles.css      app shell and UI
src/physics.js              chassis, suspension, collisions
src/run.js                  one launch: resources, pickups, stunts, end conditions
src/terrain.js, biomes.js   world generation and regions
src/progression.js          upgrades, stages, perks, stat formulas
src/meta.js, save.js        missions, trophies, daily bonus, persistence
src/render.js, carArt.js    canvas renderer and per-stage car art
src/particles.js, audio.js, input.js, icons.js
src/main.js                 game controller and UI
tools/                      simulator, smoke test, bundler, icon builder
```
