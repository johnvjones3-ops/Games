// Unified input: keyboard, on-screen touch buttons and gamepads all feed the
// same { throttle, brake, boost } state.

const GAS_KEYS = new Set(['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW']);
const BRAKE_KEYS = new Set(['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS']);
const BOOST_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { gas: false, brake: false, boost: false };
    this.pad = { gas: 0, brake: 0, boost: false, a: false, start: false };
    this.onKey = null;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (GAS_KEYS.has(e.code) || BRAKE_KEYS.has(e.code) || BOOST_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat && this.onKey) this.onKey(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.gas = this.touch.brake = this.touch.boost = false; });
  }

  /** Wire a DOM element as a hold button for one control. Supports multi-touch. */
  bindButton(el, control) {
    const pointers = new Set();
    const set = () => { this.touch[control] = pointers.size > 0; el.classList.toggle('held', pointers.size > 0); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointers.add(e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      set();
    });
    const up = (e) => { pointers.delete(e.pointerId); set(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find((x) => x && x.connected);
    if (!p) { this.pad.gas = this.pad.brake = 0; this.pad.boost = false; return; }
    const b = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
    const axis = p.axes[0] || 0;
    this.pad.gas = Math.max(b(7), axis > 0.3 ? axis : 0, b(15));
    this.pad.brake = Math.max(b(6), axis < -0.3 ? -axis : 0, b(14));
    const a = b(0) > 0.5;
    this.pad.boost = a || b(5) > 0.5;
    if (a && !this.pad.a && this.onKey) this.onKey('PadA');
    this.pad.a = a;
    const start = b(9) > 0.5;
    if (start && !this.pad.start && this.onKey) this.onKey('PadStart');
    this.pad.start = start;
  }

  state() {
    this.pollGamepad();
    let throttle = 0, brake = 0;
    for (const k of this.keys) { if (GAS_KEYS.has(k)) throttle = 1; if (BRAKE_KEYS.has(k)) brake = 1; }
    if (this.touch.gas) throttle = 1;
    if (this.touch.brake) brake = 1;
    throttle = Math.max(throttle, this.pad.gas);
    brake = Math.max(brake, this.pad.brake);
    let boost = this.touch.boost || this.pad.boost;
    for (const k of this.keys) if (BOOST_KEYS.has(k)) boost = true;
    return { throttle, brake, boost };
  }
}
