// Upgrade tables, car evolution stages, DNA perks and the stat model that
// turns levels into physics parameters. Pure data + math, shared by the game
// and the headless balance simulator.

export const UPGRADES = [
  { id: 'sling', name: 'Slingshot', max: 25, base: 30, growth: 1.42, unlock: 0, blurb: 'Launch speed' },
  { id: 'engine', name: 'Engine', max: 25, base: 40, growth: 1.42, unlock: 0, blurb: 'Power and top speed' },
  { id: 'fuel', name: 'Fuel Tank', max: 25, base: 35, growth: 1.42, unlock: 0, blurb: 'Driving time' },
  { id: 'tires', name: 'Tires', max: 20, base: 60, growth: 1.45, unlock: 0, blurb: 'Grip and climbing' },
  { id: 'armor', name: 'Armor', max: 20, base: 50, growth: 1.42, unlock: 0, blurb: 'Hit points' },
  { id: 'coins', name: 'Coin Value', max: 25, base: 80, growth: 1.5, unlock: 0, blurb: 'Earn more per run' },
  { id: 'suspension', name: 'Suspension', max: 20, base: 90, growth: 1.45, unlock: 120, blurb: 'Softer, safer landings' },
  { id: 'aero', name: 'Aerodynamics', max: 20, base: 150, growth: 1.45, unlock: 220, blurb: 'Less drag, better air control' },
  { id: 'magnet', name: 'Coin Magnet', max: 15, base: 200, growth: 1.5, unlock: 300, blurb: 'Pickup radius' },
  { id: 'booster', name: 'Rocket Booster', max: 20, base: 600, growth: 1.45, unlock: 450, blurb: 'Thrust on demand' },
  { id: 'nitro', name: 'Rocket Fuel', max: 20, base: 400, growth: 1.45, unlock: 450, blurb: 'Booster burn time', requires: 'booster' },
  { id: 'wings', name: 'Glider Wings', max: 20, base: 2500, growth: 1.48, unlock: 1300, blurb: 'Lift while airborne' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const PERKS = [
  { id: 'golden', name: 'Golden Genes', max: 15, blurb: '+30% coins from everything' },
  { id: 'elastic', name: 'Elastic Genes', max: 10, blurb: '+6% launch speed' },
  { id: 'bargain', name: 'Bargain Genes', max: 10, blurb: '-5% upgrade prices' },
  { id: 'frugal', name: 'Frugal Genes', max: 8, blurb: '-7% fuel burn' },
  { id: 'tough', name: 'Tough Genes', max: 8, blurb: '+20% hit points' },
  { id: 'thrust', name: 'Rocket Genes', max: 8, blurb: '+8% booster thrust and tank' },
  { id: 'lucky', name: 'Lucky Genes', max: 8, blurb: '+20% pickup and stunt coins' },
  { id: 'headstart', name: 'Head Start', max: 5, blurb: 'Each new generation starts with +1 level in Slingshot, Engine and Fuel' },
];

export const perkCost = (level) => 1 + level + Math.floor(level * level * 0.25);

export const STAGES = [
  { name: 'Soapbox', at: 0 },
  { name: 'Go-Kart', at: 6 },
  { name: 'Dune Buggy', at: 15 },
  { name: 'Hatchback', at: 27 },
  { name: 'Pickup', at: 42 },
  { name: 'Muscle Car', at: 60 },
  { name: 'Rally Car', at: 82 },
  { name: 'Sports Car', at: 108 },
  { name: 'Hypercar', at: 140 },
  { name: 'Jet Racer', at: 178 },
  { name: 'Quantum Hover', at: 222 },
];

export function totalLevels(levels) {
  let t = 0;
  for (const u of UPGRADES) t += levels[u.id] || 0;
  return t;
}

export function stageIndex(levels) {
  const t = totalLevels(levels);
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) if (t >= STAGES[i].at) idx = i;
  return idx;
}

function niceRound(v) {
  if (v < 100) return Math.round(v);
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

export function upgradeCost(id, level, perks = {}) {
  const u = UPGRADE_BY_ID[id];
  const discount = 1 - 0.05 * (perks.bargain || 0);
  return niceRound(u.base * Math.pow(u.growth, level) * discount);
}

/** Converts upgrade levels + DNA perks into physics/economy parameters. */
export function computeStats(levels = {}, perks = {}) {
  const L = (id) => levels[id] || 0;
  const P = (id) => perks[id] || 0;
  const stage = stageIndex(levels);

  const sling = L('sling'), eng = L('engine'), fuel = L('fuel'), tires = L('tires');
  const susp = L('suspension'), aero = L('aero'), armor = L('armor');
  const coins = L('coins'), magnet = L('magnet'), boost = L('booster'), nitro = L('nitro'), wings = L('wings');

  const suspTravel = 0.42 + 0.014 * susp;
  const suspK = 40 + 1.4 * susp;
  const suspC = 2 * Math.sqrt(suspK * 0.5) * (0.42 + 0.012 * susp);

  return {
    stage,
    launchSpeed: (16 + 1.5 * sling + 0.02 * sling * sling) * (1 + 0.06 * P('elastic')),
    engineForce: 6 + 0.4 * eng,
    topSpeed: 15 + 1.8 * eng,
    brakeForce: 14,
    fuelCap: 7 + 1.4 * fuel + 0.03 * fuel * fuel,
    fuelBurn: 1 - 0.07 * P('frugal'),
    grip: 0.78 + 0.03 * tires,
    wheelRadius: 0.42 + 0.009 * tires,
    rollResist: Math.max(0.012, 0.03 - 0.0009 * tires),
    suspTravel, suspK, suspC,
    suspAbsorb: Math.max(0.35, 1 - 0.032 * susp),
    damageThreshold: 8 + 0.45 * susp,
    dragK: 0.0042 * Math.pow(0.9, aero),
    airSpin: 2.1 + 0.11 * aero,
    airAccel: 6.5 + 0.45 * aero,
    maxHP: (100 + 22 * armor + 1.4 * armor * armor) * (1 + 0.2 * P('tough')),
    coinMult: Math.pow(1.1, coins) * (1 + 0.3 * P('golden')) * (1 + 0.03 * stage),
    bonusMult: 1 + 0.2 * P('lucky'),
    magnetRadius: magnet > 0 ? 2 + 0.55 * magnet : 1.15,
    boostThrust: boost > 0 ? (8 + 0.7 * boost) * (1 + 0.08 * P('thrust')) : 0,
    nitroCap: (2 + 0.3 * nitro) * (1 + 0.08 * P('thrust')),
    wingLift: wings > 0 ? 0.0024 + 0.00055 * wings : 0,
    wingStability: wings > 0 ? 2.5 + 0.15 * wings : 0,
    wingLevel: wings, boostLevel: boost, magnetLevel: magnet,
    tireLevel: tires, aeroLevel: aero, armorLevel: armor, engineLevel: eng, suspLevel: susp,
  };
}

/** One-line description of what the next level does, for the upgrade card. */
export function describeUpgrade(id, levels, perks) {
  const cur = computeStats(levels, perks);
  const next = computeStats({ ...levels, [id]: (levels[id] || 0) + 1 }, perks);
  const f1 = (v) => v.toFixed(1);
  const kmh = (v) => Math.round(v * 3.6);
  switch (id) {
    case 'sling': return [`${kmh(cur.launchSpeed)} km/h`, `${kmh(next.launchSpeed)} km/h`];
    case 'engine': return [`${kmh(cur.topSpeed)} km/h top`, `${kmh(next.topSpeed)} km/h top`];
    case 'fuel': return [`${f1(cur.fuelCap)} s`, `${f1(next.fuelCap)} s`];
    case 'tires': return [`grip ${cur.grip.toFixed(2)}`, `grip ${next.grip.toFixed(2)}`];
    case 'armor': return [`${Math.round(cur.maxHP)} HP`, `${Math.round(next.maxHP)} HP`];
    case 'coins': return [`x${cur.coinMult.toFixed(2)}`, `x${next.coinMult.toFixed(2)}`];
    case 'suspension': return [`${Math.round((1 - cur.suspAbsorb) * 100)}% absorb`, `${Math.round((1 - next.suspAbsorb) * 100)}% absorb`];
    case 'aero': return [`drag ${Math.round(cur.dragK / 0.0042 * 100)}%`, `drag ${Math.round(next.dragK / 0.0042 * 100)}%`];
    case 'magnet': return [`${f1(cur.magnetRadius)} m`, `${f1(next.magnetRadius)} m`];
    case 'booster': return [cur.boostThrust ? `${f1(cur.boostThrust / 12)} g` : 'none', `${f1(next.boostThrust / 12)} g`];
    case 'nitro': return [`${f1(cur.nitroCap)} s`, `${f1(next.nitroCap)} s`];
    case 'wings': return [cur.wingLift ? `lift ${Math.round(cur.wingLift * 10000)}` : 'none', `lift ${Math.round(next.wingLift * 10000)}`];
    default: return ['', ''];
  }
}

/** DNA awarded for starting a new generation. */
export function dnaForDistance(best) {
  if (best < 2000) return 0;
  return Math.floor(Math.pow(best / 1000, 1.3));
}

export const EVOLVE_MIN_DISTANCE = 2000;
