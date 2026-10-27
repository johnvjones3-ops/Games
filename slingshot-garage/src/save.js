// Persistence. Everything lives in one JSON blob in localStorage; reads and
// writes are guarded because storage can be unavailable (private mode, quotas).

const KEY = 'slingshot-garage/save/v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    dna: 0,
    gen: 1,
    seed: 1,
    levels: {},
    perks: {},
    best: 0,
    genBest: 0,
    lastDistance: 0,
    recentEarnings: [],
    totals: { runs: 0, distance: 0, coins: 0, flips: 0, perfect: 0, crates: 0, airTime: 0, wrecks: 0, evolves: 0, missions: 0 },
    missions: [],
    missionSeq: 0,
    achievements: {},
    settings: { sound: true, music: true, assist: true, quality: 'high', haptics: true, ghost: true, buyAmount: 1 },
    flags: { tutorialAim: false, tutorialDrive: false },
    stageSeen: 0,
    ghost: null,
    daily: { last: null, streak: 0 },
    created: Date.now(),
  };
}

function merge(base, data) {
  for (const k of Object.keys(data || {})) {
    const v = data[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], v);
    else base[k] = v;
  }
  return base;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return merge(defaultSave(), JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    // Ghost data is the bulkiest part; drop it and retry once.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, ghost: null }));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function exportSave(state) {
  const json = JSON.stringify({ ...state, ghost: null });
  return btoa(unescape(encodeURIComponent(json)));
}

export function importSave(text) {
  const json = decodeURIComponent(escape(atob(text.trim())));
  const data = JSON.parse(json);
  if (typeof data !== 'object' || data === null || typeof data.coins !== 'number') throw new Error('Not a save code');
  return merge(defaultSave(), data);
}
