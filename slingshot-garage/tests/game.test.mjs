import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Terrain, fuelGroupOf, ITEM_SLOT } from '../src/terrain.js';
import { Car, CHASSIS } from '../src/physics.js';
import { Run, STEP, fuelRefill } from '../src/run.js';
import { UPGRADES, computeStats, upgradeCost, stageIndex, STAGES, dnaForDistance, describeUpgrade } from '../src/progression.js';
import { defaultSave, exportSave, importSave } from '../src/save.js';
import { ensureMissions, applyRunToMissions, claimMission, checkAchievements, dailyReward } from '../src/meta.js';
import { BIOMES, biomeBlendAt, mixColor } from '../src/biomes.js';

test('terrain is deterministic per seed and differs between seeds', () => {
  const a = new Terrain(42), b = new Terrain(42), c = new Terrain(43);
  for (const x of [0, 55.5, 300, 1234.5, 9000]) assert.equal(a.height(x), b.height(x));
  let diff = 0;
  for (let x = 200; x < 2000; x += 50) diff += Math.abs(a.height(x) - c.height(x));
  assert.ok(diff > 10, 'different seeds should give different worlds');
});

test('launch pad is flat and there is a wall behind it', () => {
  const t = new Terrain(1);
  // The playable pad (garage spot, full slingshot pull, launch) must be perfectly flat.
  for (let x = -12; x <= 8; x += 0.5) assert.ok(Math.abs(t.height(x)) < 0.005, `pad not flat at ${x}`);
  assert.ok(t.height(-45) > 10);
});

test('terrain slope matches finite differences', () => {
  const t = new Terrain(5);
  for (const x of [123.4, 777.7, 2500.1, 6100.9]) {
    const fd = (t.height(x + 0.001) - t.height(x - 0.001)) / 0.002;
    assert.ok(Math.abs(fd - t.slope(x)) < 1e-3, `slope mismatch at ${x}`);
  }
});

test('every fuel group holds exactly one fuel can', () => {
  const t = new Terrain(9);
  const perGroup = new Map();
  for (let k = 2; k < 400; k++) {
    const g = fuelGroupOf(k).index;
    const n = t.slot(k).filter((it) => it.type === 'fuel').length;
    perGroup.set(g, (perGroup.get(g) || 0) + n);
  }
  // First group may start before slot 2; skip it.
  for (const [g, n] of perGroup) if (g > 0 && g < fuelGroupOf(399).index) assert.equal(n, 1, `group ${g} has ${n} cans`);
});

test('fuel cans get further apart with distance', () => {
  const t = new Terrain(3);
  const cans = [];
  for (let k = 1; k < 300; k++) for (const it of t.slot(k)) if (it.type === 'fuel') cans.push(it.x);
  const gap = (from, to) => {
    const xs = cans.filter((x) => x >= from && x < to);
    return (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
  };
  assert.ok(gap(0, 1000) < gap(7000, 15000));
  assert.ok(ITEM_SLOT > 0);
});

test('car settles on flat ground with compressed suspension', () => {
  const t = new Terrain(1);
  const stats = computeStats({}, {});
  const car = new Car(stats);
  car.x = -5; car.y = 2;
  for (let i = 0; i < 240 * 3; i++) car.step(STEP, { throttle: 0, brake: 0, lean: 0, boost: false, nitro: 0, assist: false }, t);
  assert.equal(car.wheelsDown, 2);
  assert.ok(car.speed < 0.05, `still moving: ${car.speed}`);
  assert.ok(Math.abs(car.a) < 0.05);
  for (const wh of car.wheels) assert.ok(wh.L > 0 && wh.L < stats.suspTravel, 'suspension should be partly compressed');
  assert.ok(CHASSIS.hull.length >= 6);
});

test('engine accelerates the car on flat ground and respects top speed', () => {
  const t = new Terrain(1);
  const stats = computeStats({ engine: 3 }, {});
  const car = new Car(stats);
  car.x = -15; car.y = 1.5;
  for (let i = 0; i < 240; i++) car.step(STEP, { throttle: 0, brake: 0, lean: 0, boost: false, nitro: 0 }, t);
  for (let i = 0; i < 240 * 2; i++) car.step(STEP, { throttle: 1, brake: 0, lean: 0, boost: false, nitro: 0 }, t);
  assert.ok(car.vx > 5, `expected acceleration, got ${car.vx}`);
  assert.ok(car.speed <= stats.topSpeed + 1);
});

function autoRun(levels, seed = 1) {
  const terrain = new Terrain(seed);
  const run = new Run({ terrain, stats: computeStats(levels, {}), best: 0 });
  run.aim(-Math.cos(0.7) * 4.2, -Math.sin(0.7) * 4.2);
  assert.ok(run.launch());
  let guard = 0;
  while (run.state !== 'ended' && guard++ < 60 * 600) {
    const car = run.car;
    const input = { throttle: car.grounded ? 1 : 0, brake: 0, boost: true };
    run.update(1 / 60, input);
  }
  return run.summary();
}

test('a run ends and pays coins proportional to distance', () => {
  const s = autoRun({});
  assert.ok(s.distance > 40, `distance ${s.distance}`);
  assert.ok(['out of fuel', 'stopped', 'stuck', 'flipped', 'wrecked'].includes(s.reason));
  assert.ok(s.total >= s.distance);
  assert.equal(s.total, Math.round((s.distance + (s.pickCoins + s.stuntCoins) / s.mult) * s.mult));
});

test('upgrades make the car go further', () => {
  const base = autoRun({});
  const upgraded = autoRun({ sling: 8, engine: 8, fuel: 8, tires: 5 });
  assert.ok(upgraded.distance > base.distance * 1.5, `${upgraded.distance} vs ${base.distance}`);
});

test('weak launches are rejected', () => {
  const run = new Run({ terrain: new Terrain(1), stats: computeStats({}, {}) });
  run.aim(-0.2, 0);
  assert.equal(run.launch(), false);
  assert.equal(run.state, 'aim');
});

test('upgrade costs rise and stats never get worse with a level', () => {
  for (const u of UPGRADES) {
    for (let l = 0; l < u.max; l++) assert.ok(upgradeCost(u.id, l + 1) > upgradeCost(u.id, l), `${u.id} cost not rising at ${l}`);
    const [cur, next] = describeUpgrade(u.id, {}, {});
    assert.ok(cur !== undefined && next !== undefined);
  }
  const keys = ['launchSpeed', 'topSpeed', 'fuelCap', 'grip', 'maxHP', 'coinMult', 'magnetRadius', 'boostThrust', 'nitroCap', 'wingLift'];
  for (const u of UPGRADES) {
    const a = computeStats({ [u.id]: 3 }, {}), b = computeStats({ [u.id]: 4 }, {});
    for (const k of keys) assert.ok(b[k] >= a[k] - 1e-9, `${u.id} lowered ${k}`);
  }
  assert.ok(computeStats({ aero: 5 }).dragK < computeStats({}).dragK);
  assert.ok(upgradeCost('engine', 5, { bargain: 4 }) < upgradeCost('engine', 5, {}));
});

test('fuel refills are flat-ish so fuel never becomes infinite', () => {
  const small = computeStats({}, {}), big = computeStats({ fuel: 25 }, {});
  assert.ok(fuelRefill(big) / big.fuelCap < fuelRefill(small) / small.fuelCap);
});

test('evolution stages follow total upgrade levels', () => {
  assert.equal(stageIndex({}), 0);
  assert.equal(stageIndex({ sling: STAGES[1].at }), 1);
  const all = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  assert.equal(stageIndex(all), STAGES.length - 1);
});

test('DNA is only granted past the evolve threshold and grows with distance', () => {
  assert.equal(dnaForDistance(1999), 0);
  assert.ok(dnaForDistance(2000) >= 2);
  assert.ok(dnaForDistance(10000) > dnaForDistance(5000));
});

test('save codes round-trip', () => {
  const s = defaultSave();
  s.coins = 1234; s.levels.engine = 7; s.perks.golden = 2; s.settings.music = false;
  const back = importSave(exportSave(s));
  assert.equal(back.coins, 1234);
  assert.equal(back.levels.engine, 7);
  assert.equal(back.perks.golden, 2);
  assert.equal(back.settings.music, false);
  assert.ok(back.settings.sound, 'defaults are filled in');
  assert.throws(() => importSave('not base64 at all!!'));
});

test('missions: three active, completion, claim and replacement', () => {
  const s = defaultSave();
  const stats = computeStats({}, {});
  ensureMissions(s, stats);
  assert.equal(s.missions.length, 3);
  assert.equal(new Set(s.missions.map((m) => m.tpl)).size, 3);
  const huge = { distance: 1e6, flips: 99, coinsPicked: 999, maxAir: 99, maxSpeedKmh: 999, perfect: 99, crates: 99, total: 1e9, maxAlt: 9999 };
  const done = applyRunToMissions(s, huge);
  assert.equal(done.length, 3);
  const before = s.coins;
  const reward = claimMission(s, s.missions[0].seq, stats);
  assert.ok(reward > 0);
  assert.equal(s.coins, before + reward);
  assert.equal(s.missions.length, 3);
  assert.equal(s.totals.missions, 1);
});

test('achievements are granted once with their reward', () => {
  const s = defaultSave();
  s.totals.runs = 1;
  const first = checkAchievements(s, null);
  assert.ok(first.some((a) => a.id === 'first'));
  const coins = s.coins;
  assert.equal(checkAchievements(s, null).length, 0);
  assert.equal(s.coins, coins);
});

test('daily reward streak resets after a missed day', () => {
  const s = defaultSave();
  const d1 = dailyReward(s, new Date('2026-03-01T12:00:00Z'));
  s.daily = { last: d1.today, streak: d1.streak };
  assert.equal(dailyReward(s, new Date('2026-03-01T18:00:00Z')), null);
  assert.equal(dailyReward(s, new Date('2026-03-02T12:00:00Z')).streak, 2);
  assert.equal(dailyReward(s, new Date('2026-03-05T12:00:00Z')).streak, 1);
});

test('biomes are ordered and blend smoothly', () => {
  for (let i = 1; i < BIOMES.length; i++) assert.ok(BIOMES[i].start > BIOMES[i - 1].start);
  const edge = BIOMES[1].start;
  assert.equal(biomeBlendAt(edge - 1000).t, 0);
  assert.ok(biomeBlendAt(edge - 10).t > 0.5);
  assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080');
});
