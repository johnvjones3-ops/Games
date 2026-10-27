// Headless balance simulator: an autopilot plays runs and a greedy "player"
// spends coins between runs. Prints the progression curve so economy changes
// can be judged with numbers instead of guesses.
//
//   node tools/balance-sim.mjs [runs=120] [seed=1] [--evolve]

import { Terrain } from '../src/terrain.js';
import { Run } from '../src/run.js';
import { computeStats, UPGRADES, upgradeCost, stageIndex, STAGES, dnaForDistance, PERKS, perkCost, EVOLVE_MIN_DISTANCE } from '../src/progression.js';
import { wrapAngle } from '../src/physics.js';
import { BIOMES, biomeIndexAt } from '../src/biomes.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RUNS = Number(args[0] || 120);
const SEED = Number(args[1] || 1);
const EVOLVE = process.argv.includes('--evolve');

// Rough real-time overhead per run (aiming, results screen, shopping).
const OVERHEAD_S = 12;

export function autopilot(run) {
  const car = run.car;
  const t = run.terrain;
  const slope = Math.atan(t.slope(car.x));
  const rel = wrapAngle(car.a - slope);
  const input = { throttle: 0, brake: 0, boost: false };
  if (car.grounded) {
    input.throttle = rel > 0.55 ? 0 : 1;
    if (rel > 0.85) input.brake = 1;
  } else {
    // Keep the nose near the flight path so landings are clean.
    const path = Math.atan2(car.vy, car.vx);
    const target = car.y - t.height(car.x) < 8 ? slope : Math.max(-0.4, Math.min(0.5, path));
    const err = wrapAngle(target - car.a);
    if (err > 0.25) input.throttle = 1;
    else if (err < -0.25) input.brake = 1;
  }
  const heading = wrapAngle(car.a);
  if (run.nitro > 0 && heading > -0.3 && heading < 0.9) input.boost = true;
  return input;
}

export function playRun(terrain, stats, best) {
  const run = new Run({ terrain, stats, best, assist: true });
  // Humans don't aim identically every time.
  const ang = 0.55 + Math.random() * 0.35;
  const pow = 0.85 + Math.random() * 0.15;
  run.aim(-Math.cos(ang) * 4.2 * pow, -Math.sin(ang) * 4.2 * pow);
  run.launch();
  let guard = 0;
  while (run.state !== 'ended' && guard++ < 60 * 900) run.update(1 / 60, autopilot(run));
  return run.summary();
}

const WEIGHT = { coins: 1.6, sling: 1.35, engine: 1.25, fuel: 1.25, tires: 1, armor: 0.9, suspension: 0.9, aero: 1.1, magnet: 0.7, booster: 1.2, nitro: 1.0, wings: 1.3 };

function shop(state) {
  for (let guard = 0; guard < 200; guard++) {
    let pick = null;
    let bestScore = Infinity;
    for (const u of UPGRADES) {
      const lvl = state.levels[u.id] || 0;
      if (lvl >= u.max || state.best < u.unlock) continue;
      if (u.requires && !(state.levels[u.requires] > 0)) continue;
      const cost = upgradeCost(u.id, lvl, state.perks);
      const score = cost / WEIGHT[u.id];
      if (cost <= state.coins && score < bestScore) { bestScore = score; pick = u; }
    }
    if (!pick) return;
    state.coins -= upgradeCost(pick.id, state.levels[pick.id] || 0, state.perks);
    state.levels[pick.id] = (state.levels[pick.id] || 0) + 1;
  }
}

function spendDna(state) {
  const order = ['golden', 'elastic', 'headstart', 'bargain', 'thrust', 'tough', 'frugal', 'lucky'];
  for (let guard = 0; guard < 100; guard++) {
    let bought = false;
    for (const id of order) {
      const p = PERKS.find((x) => x.id === id);
      const lvl = state.perks[id] || 0;
      if (lvl < p.max && perkCost(lvl) <= state.dna) { state.dna -= perkCost(lvl); state.perks[id] = lvl + 1; bought = true; }
    }
    if (!bought) return;
  }
}

function main() {
  const state = { coins: 0, levels: {}, perks: {}, best: 0, genBest: 0, dna: 0, gen: 1, seed: SEED, stall: 0 };
  let terrain = new Terrain(state.seed);
  let clock = 0;
  const milestones = new Map();
  console.log('run  gen  min  dist(m)  earned  coins  stage           biome            levels');
  for (let i = 1; i <= RUNS; i++) {
    const stats = computeStats(state.levels, state.perks);
    const s = playRun(terrain, stats, state.genBest);
    clock += s.time + OVERHEAD_S;
    state.coins += s.total;
    if (s.distance > state.genBest) { state.genBest = s.distance; state.stall = 0; } else state.stall++;
    if (s.distance > state.best) state.best = s.distance;
    for (const b of BIOMES) if (s.distance >= b.start && !milestones.has(b.name)) milestones.set(b.name, { run: i, min: clock / 60 });
    shop(state);
    const lv = UPGRADES.map((u) => `${u.id.slice(0, 3)}${state.levels[u.id] || 0}`).join(' ');
    console.log(`${String(i).padStart(3)}  ${String(state.gen).padStart(3)}  ${(clock / 60).toFixed(0).padStart(3)}  ${String(s.distance).padStart(7)}  ${String(s.total).padStart(6)}  ${String(Math.round(state.coins)).padStart(5)}  ${STAGES[stageIndex(state.levels)].name.padEnd(14)}  ${BIOMES[biomeIndexAt(s.distance)].name.padEnd(16)} ${s.reason.padEnd(11)} ${lv}`);
    if (EVOLVE && state.genBest >= EVOLVE_MIN_DISTANCE && state.stall >= 6) {
      const gained = dnaForDistance(state.genBest);
      state.dna += gained;
      spendDna(state);
      state.gen++;
      state.seed++;
      terrain = new Terrain(state.seed);
      state.coins = 0;
      const hs = state.perks.headstart || 0;
      state.levels = hs ? { sling: hs, engine: hs, fuel: hs } : {};
      state.genBest = 0;
      state.stall = 0;
      console.log(`---- EVOLVE: +${gained} DNA, perks ${JSON.stringify(state.perks)}`);
    }
  }
  console.log('\nFirst reached:');
  for (const [name, m] of milestones) console.log(`  ${name.padEnd(16)} run ${String(m.run).padStart(3)}  ~${m.min.toFixed(0)} min`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
