// Inline SVG icons (24x24 viewBox, drawn with currentColor where possible).

const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  coin: svg('<circle cx="12" cy="12" r="10" fill="#e0a000"/><circle cx="12" cy="12" r="7.4" fill="#ffd23f"/><path d="M12 7.5v9M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" stroke="#b07a00" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  dna: svg('<path d="M7 3c0 6 10 6 10 12s-10 3-10 6M17 3c0 6-10 6-10 12s10 3 10 6" stroke="#7af7ff" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M8.5 6h7M8.5 18h7M10 9.5h4M10 14.5h4" stroke="#ff5cf0" stroke-width="1.6" stroke-linecap="round"/>'),
  gear: svg('<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3.9 2-3.4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>'),
  play: svg('<path d="M8 5l11 7-11 7Z" fill="currentColor"/>'),
  retry: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  home: svg('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4Z" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0Z" fill="currentColor"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 14v4M8 20h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  swap: svg('<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  gas: svg('<path d="M9 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  brake: svg('<path d="M15 5l-8 7 8 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  ccw: svg('<path d="M6 13a7 7 0 1 0 2-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  cw: svg('<path d="M18 13a7 7 0 1 1-2-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  rocket: svg('<path d="M12 2c4 3 5 8 3 13H9C7 10 8 5 12 2Z" fill="currentColor"/><circle cx="12" cy="9" r="1.8" fill="#1b1030"/><path d="M9 15l-3 3 1-5M15 15l3 3-1-5" fill="currentColor"/><path d="M10.5 17h3l-1.5 5Z" fill="#ff8a3a"/>'),
  paint: svg('<path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z" fill="currentColor"/><circle cx="7.5" cy="11" r="1.5" fill="#e8453c"/><circle cx="10" cy="7" r="1.5" fill="#ffd23f"/><circle cx="14.5" cy="7" r="1.5" fill="#2ec27e"/><circle cx="17" cy="11" r="1.5" fill="#1fb6ff"/>'),
  gift: svg('<rect x="4" y="9" width="16" height="11" rx="1.5" fill="currentColor"/><rect x="3" y="7" width="18" height="4" rx="1" fill="currentColor"/><path d="M12 7v13" stroke="#1b1030" stroke-width="2"/><path d="M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" fill="none" stroke="currentColor" stroke-width="2"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
};

export const UPGRADE_ICONS = {
  sling: svg('<path d="M12 21v-7M12 14L7 4M12 14l5-10" stroke="#c48a52" stroke-width="2.6" stroke-linecap="round"/><path d="M7 4c1 5 9 5 10 0" stroke="#e8453c" stroke-width="1.8" fill="none"/><circle cx="12" cy="8.5" r="2" fill="#9aa3ad"/>'),
  engine: svg('<rect x="4" y="8" width="14" height="10" rx="2" fill="#9aa3ad"/><rect x="7" y="5" width="8" height="3" rx="1" fill="#6b7280"/><path d="M18 11h3v4h-3M4 12H2" stroke="#6b7280" stroke-width="2"/><path d="M9 11l-1.5 3h3L9 17" stroke="#ffd23f" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="13" r="2" fill="#4b5563"/>'),
  fuel: svg('<rect x="5" y="5" width="12" height="16" rx="2" fill="#e8453c"/><path d="M8 5l2-2h4" stroke="#7a1a14" stroke-width="1.8" fill="none"/><path d="M17 9l3 2v7a1.5 1.5 0 0 1-3 0" stroke="#9aa3ad" stroke-width="1.8" fill="none"/><path d="M8 12h6" stroke="#ffd23f" stroke-width="2.2" stroke-linecap="round"/>'),
  tires: svg('<circle cx="12" cy="12" r="9.5" fill="#25252c"/><circle cx="12" cy="12" r="5" fill="#c9ced6"/><circle cx="12" cy="12" r="1.6" fill="#555"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke="#3b3b44" stroke-width="2"/>'),
  armor: svg('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5Z" fill="#7d8594"/><path d="M12 4.5l5.8 2.2V11c0 3.7-2.4 6.8-5.8 8.5Z" fill="#c9ced6"/><circle cx="8" cy="8" r="1" fill="#4b5563"/><circle cx="8" cy="13" r="1" fill="#4b5563"/>'),
  coins: svg('<ellipse cx="12" cy="17" rx="8" ry="3" fill="#b07a00"/><ellipse cx="12" cy="15" rx="8" ry="3" fill="#ffd23f"/><ellipse cx="12" cy="11" rx="8" ry="3" fill="#e0a000"/><ellipse cx="12" cy="9" rx="8" ry="3" fill="#ffe46b"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="#fff"/>'),
  suspension: svg('<path d="M12 2v3M12 19v3" stroke="#6b7280" stroke-width="2.4"/><path d="M8 5h8M8 19h8" stroke="#6b7280" stroke-width="2.4" stroke-linecap="round"/><path d="M8.5 7l7 2-7 2 7 2-7 2 7 2" stroke="#ffd23f" stroke-width="2" fill="none" stroke-linejoin="round"/>'),
  aero: svg('<path d="M3 15c4-6 12-8 18-6-6 1-10 3-12 7Z" fill="#1fb6ff"/><path d="M2 8h7M4 11h5M2 18h9" stroke="#bfe9ff" stroke-width="1.8" stroke-linecap="round"/>'),
  magnet: svg('<path d="M6 4v8a6 6 0 0 0 12 0V4" stroke="#e8453c" stroke-width="4" fill="none"/><path d="M4 4h4M16 4h4" stroke="#c9ced6" stroke-width="4"/><path d="M12 19v3M8 20l-1 2M16 20l1 2" stroke="#ffd23f" stroke-width="1.6" stroke-linecap="round"/>'),
  booster: svg('<path d="M3 9h11l4 3-4 3H3Z" fill="#c9ced6"/><rect x="6" y="9" width="2" height="6" fill="#e8453c"/><path d="M3 10L0 12l3 2" fill="#ff8a3a"/><path d="M18 12h5" stroke="#7af7ff" stroke-width="2" stroke-linecap="round"/>'),
  nitro: svg('<rect x="7" y="3" width="10" height="18" rx="5" fill="#1f8bff"/><path d="M13 6l-3 6h2.5L11 18l4.5-7H13Z" fill="#ffd23f"/>'),
  wings: svg('<path d="M12 10L2 16l9-2Z" fill="#e9ecf5"/><path d="M12 10l10 6-9-2Z" fill="#c4cbe0"/><rect x="10.5" y="6" width="3" height="10" rx="1.5" fill="#7d8594"/><circle cx="2.5" cy="16" r="1" fill="#e8453c"/><circle cx="21.5" cy="16" r="1" fill="#2ec27e"/>'),
};

export const PERK_ICONS = {
  golden: UPGRADE_ICONS.coins,
  elastic: UPGRADE_ICONS.sling,
  bargain: svg('<path d="M3 12l9-9h8v8l-9 9Z" fill="#2ec27e"/><circle cx="16" cy="8" r="1.8" fill="#0d3b22"/><path d="M8 13l3 3" stroke="#0d3b22" stroke-width="2"/>'),
  frugal: UPGRADE_ICONS.fuel,
  tough: UPGRADE_ICONS.armor,
  thrust: UPGRADE_ICONS.booster,
  lucky: svg('<path d="M12 12c-3-5-8-3-6 1 1 2 4 2 6-1Zm0 0c5-3 3-8-1-6-2 1-2 4 1 6Zm0 0c3 5 8 3 6-1-1-2-4-2-6 1Zm0 0c-5 3-3 8 1 6 2-1 2-4-1-6Z" fill="#2ec27e"/><path d="M12 12l4 9" stroke="#1e7a45" stroke-width="1.6"/>'),
  headstart: svg('<path d="M4 20V4M4 4h12l-2 3 2 3H4" stroke="#c9ced6" stroke-width="2" fill="#ff3b5c" stroke-linejoin="round"/><path d="M14 16h7M17 13l3 3-3 3" stroke="#ffd23f" stroke-width="2" fill="none" stroke-linecap="round"/>'),
};
