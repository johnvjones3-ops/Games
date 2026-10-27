// Missions (rotating short-term goals) and achievements (one-time trophies).

import { BIOMES } from './biomes.js';
import { STAGES, UPGRADES, stageIndex } from './progression.js';
import { mulberry32, hash32 } from './rng.js';

const nice = (v) => {
  if (v < 20) return Math.max(1, Math.round(v));
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
};

// Each template reads one number from the end-of-run summary.
export const MISSION_TEMPLATES = [
  { id: 'dist', text: (n) => `Travel ${n.toLocaleString()} m in one run`, stat: (s) => s.distance, target: (c) => nice(Math.max(150, c.best * 1.1 + 60)) },
  { id: 'flips', text: (n) => `Land ${n} flip${n > 1 ? 's' : ''} in one run`, stat: (s) => s.flips, target: (c) => Math.min(10, 1 + Math.floor(c.level / 3)) },
  { id: 'coins', text: (n) => `Grab ${n} coins in one run`, stat: (s) => s.coinsPicked, target: (c) => nice(Math.min(400, 10 + c.best / 25)) },
  { id: 'air', text: (n) => `Stay airborne ${n}s in a single jump`, stat: (s) => s.maxAir, target: (c) => Math.min(25, 2 + Math.floor(c.level / 2) + Math.floor(c.best / 2500)) },
  { id: 'speed', text: (n) => `Reach ${n} km/h`, stat: (s) => s.maxSpeedKmh, target: (c) => nice(Math.min(500, c.topSpeedKmh * 0.95 + 10)) },
  { id: 'perfect', text: (n) => `Land ${n} perfect landing${n > 1 ? 's' : ''} in one run`, stat: (s) => s.perfect, target: (c) => Math.min(12, 1 + Math.floor(c.level / 3)) },
  { id: 'crates', text: (n) => `Smash ${n} crates in one run`, stat: (s) => s.crates, target: (c) => Math.min(40, 2 + Math.floor(c.best / 300)) },
  { id: 'earn', text: (n) => `Earn ${n.toLocaleString()} coins in one run`, stat: (s) => s.total, target: (c) => nice(Math.max(200, c.avgEarn * 1.3)) },
  { id: 'alt', text: (n) => `Fly ${n} m above the launch pad`, stat: (s) => s.maxAlt, target: (c) => nice(Math.min(800, 12 + c.best / 40)) },
];

const TEMPLATE_BY_ID = Object.fromEntries(MISSION_TEMPLATES.map((t) => [t.id, t]));

export function missionText(m) {
  return TEMPLATE_BY_ID[m.tpl].text(m.target);
}

export function missionStat(m, summary) {
  return TEMPLATE_BY_ID[m.tpl].stat(summary);
}

function makeMission(save, ctx, avoid) {
  const rnd = mulberry32(hash32(save.missionSeq + 17, save.totals.missions + 3));
  const pool = MISSION_TEMPLATES.filter((t) => !avoid.includes(t.id));
  const tpl = pool[Math.floor(rnd() * pool.length)];
  const target = tpl.target(ctx);
  const reward = nice(Math.max(80, ctx.avgEarn * (0.7 + rnd() * 0.5)));
  save.missionSeq++;
  return { seq: save.missionSeq, tpl: tpl.id, target, reward, progress: 0, done: false };
}

export function missionContext(save, stats) {
  const recent = save.recentEarnings.length ? save.recentEarnings : [150];
  const avgEarn = recent.reduce((a, b) => a + b, 0) / recent.length;
  return { best: save.genBest, level: save.totals.missions, avgEarn, topSpeedKmh: Math.max(stats.topSpeed, stats.launchSpeed) * 3.6 };
}

/** Keep three missions active. */
export function ensureMissions(save, stats) {
  const ctx = missionContext(save, stats);
  save.missions = save.missions.filter((m) => TEMPLATE_BY_ID[m.tpl]);
  while (save.missions.length < 3) {
    save.missions.push(makeMission(save, ctx, save.missions.map((m) => m.tpl)));
  }
}

/** Updates mission progress from a run summary; returns newly completed missions. */
export function applyRunToMissions(save, summary) {
  const done = [];
  for (const m of save.missions) {
    if (m.done) continue;
    const v = missionStat(m, summary);
    m.progress = Math.max(m.progress, v);
    if (v >= m.target) { m.done = true; done.push(m); }
  }
  return done;
}

export function claimMission(save, seq, stats) {
  const i = save.missions.findIndex((m) => m.seq === seq && m.done);
  if (i < 0) return 0;
  const m = save.missions[i];
  save.coins += m.reward;
  save.totals.missions++;
  const ctx = missionContext(save, stats);
  save.missions.splice(i, 1, makeMission(save, ctx, save.missions.map((x) => x.tpl)));
  return m.reward;
}

/** Swap a mission for a new one (costs nothing, but only one per run). */
export function rerollMission(save, seq, stats) {
  const i = save.missions.findIndex((m) => m.seq === seq && !m.done);
  if (i < 0) return false;
  const ctx = missionContext(save, stats);
  save.missions.splice(i, 1, makeMission(save, ctx, save.missions.map((x) => x.tpl)));
  return true;
}

const biomeAch = BIOMES.slice(1).map((b, i) => ({
  id: `biome-${b.id}`, name: ['Dune Rider', 'Canyon Runner', 'Ice Breaker', 'Fire Walker', 'Neon Dreamer', 'Moonwalker', 'Rift Diver'][i],
  desc: `Reach ${b.name}`, test: (s) => s.best >= b.start, reward: { dna: i < 3 ? 1 : 2 },
}));

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Liftoff', desc: 'Finish your first run', test: (s) => s.totals.runs >= 1, reward: { coins: 50 } },
  { id: 'm500', name: 'Half Klick', desc: 'Travel 500 m in one run', test: (s) => s.best >= 500, reward: { coins: 200 } },
  { id: 'km1', name: 'Kilometer Club', desc: 'Travel 1,000 m in one run', test: (s) => s.best >= 1000, reward: { coins: 600 } },
  { id: 'km5', name: 'Road Warrior', desc: 'Travel 5,000 m in one run', test: (s) => s.best >= 5000, reward: { dna: 2 } },
  { id: 'km10', name: 'Long Hauler', desc: 'Travel 10,000 m in one run', test: (s) => s.best >= 10000, reward: { dna: 3 } },
  { id: 'km25', name: 'Escape Velocity', desc: 'Travel 25,000 m in one run', test: (s) => s.best >= 25000, reward: { dna: 5 } },
  ...biomeAch,
  { id: 'flip', name: 'Head Over Wheels', desc: 'Land a flip', test: (s, r) => r && r.flips >= 1, reward: { coins: 100 } },
  { id: 'flip3', name: 'Triple Threat', desc: 'Land 3 flips in a single jump', test: (s, r) => r && r.maxFlipCombo >= 3, reward: { dna: 1 } },
  { id: 'perfect25', name: 'Smooth Operator', desc: '25 perfect landings in total', test: (s) => s.totals.perfect >= 25, reward: { coins: 1500 } },
  { id: 'air10', name: 'Frequent Flyer', desc: 'Stay airborne for 10 s in one jump', test: (s, r) => r && r.maxAir >= 10, reward: { dna: 1 } },
  { id: 'speed200', name: 'Speed Demon', desc: 'Reach 200 km/h', test: (s, r) => r && r.maxSpeedKmh >= 200, reward: { coins: 2500 } },
  { id: 'speed400', name: 'Hyperdrive', desc: 'Reach 400 km/h', test: (s, r) => r && r.maxSpeedKmh >= 400, reward: { dna: 2 } },
  { id: 'crates100', name: 'Box Breaker', desc: 'Smash 100 crates in total', test: (s) => s.totals.crates >= 100, reward: { coins: 2000 } },
  { id: 'wreck', name: 'Scrap Metal', desc: 'Wreck your car', test: (s) => s.totals.wrecks >= 1, reward: { coins: 75 } },
  { id: 'stage5', name: 'Muscle Memory', desc: `Evolve into a ${STAGES[5].name}`, test: (s) => stageIndex(s.levels) >= 5, reward: { coins: 3000 } },
  { id: 'stageMax', name: 'Quantum Leap', desc: `Evolve into a ${STAGES[STAGES.length - 1].name}`, test: (s) => stageIndex(s.levels) >= STAGES.length - 1, reward: { dna: 5 } },
  { id: 'maxed', name: 'Maxed Out', desc: 'Max out any upgrade', test: (s) => UPGRADES.some((u) => (s.levels[u.id] || 0) >= u.max), reward: { coins: 5000 } },
  { id: 'gen2', name: 'New Generation', desc: 'Evolve to Generation 2', test: (s) => s.gen >= 2, reward: { dna: 1 } },
  { id: 'gen5', name: 'Bloodline', desc: 'Reach Generation 5', test: (s) => s.gen >= 5, reward: { dna: 5 } },
  { id: 'missions25', name: 'Contractor', desc: 'Complete 25 missions', test: (s) => s.totals.missions >= 25, reward: { dna: 2 } },
  { id: 'rich', name: 'Millionaire', desc: 'Earn 1,000,000 coins in total', test: (s) => s.totals.coins >= 1e6, reward: { dna: 3 } },
];

/** Grants any newly met achievements and returns them. */
export function checkAchievements(save, runSummary) {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (a.test(save, runSummary)) {
      save.achievements[a.id] = Date.now();
      if (a.reward.coins) save.coins += a.reward.coins;
      if (a.reward.dna) save.dna += a.reward.dna;
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function dailyReward(save, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (save.daily.last === today) return null;
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const streak = save.daily.last === yesterday ? Math.min(7, save.daily.streak + 1) : 1;
  const recent = save.recentEarnings.length ? Math.max(...save.recentEarnings) : 100;
  const coins = nice(Math.max(100, recent * 0.6) * (1 + (streak - 1) * 0.25));
  return { today, streak, coins };
}
