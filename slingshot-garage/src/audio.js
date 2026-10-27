// All sound is synthesized with WebAudio, so the game ships with no audio files.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.engine = null;
    this.musicTimer = null;
    this.step = 0;
    this.mood = 'garage';
  }

  /** Must be called from a user gesture (browsers block audio before one). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.22 : 0; this.musicBus.connect(this.master);
    this.noise = this.makeNoise();
    this.buildLoops();
    this.startMusic();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2);
  }

  makeNoise() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  buildLoops() {
    const c = this.ctx;
    // Engine: two detuned oscillators through a lowpass
    const g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 4;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 25;
    const g2 = c.createGain(); g2.gain.value = 0.5;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.sfxBus);
    o1.start(); o2.start();
    this.engine = { g, lp, o1, o2 };

    // Wind
    const wn = c.createBufferSource(); wn.buffer = this.noise; wn.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0;
    wn.connect(bp); bp.connect(wg); wg.connect(this.sfxBus); wn.start();
    this.wind = { g: wg, bp };

    // Rocket roar
    const rn = c.createBufferSource(); rn.buffer = this.noise; rn.loop = true;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 900;
    const rg = c.createGain(); rg.gain.value = 0;
    rn.connect(rl); rl.connect(rg); rg.connect(this.sfxBus); rn.start();
    this.rocket = { g: rg, lp: rl };

    // Slingshot stretch creak
    const so = c.createOscillator(); so.type = 'triangle'; so.frequency.value = 120;
    const sg = c.createGain(); sg.gain.value = 0;
    so.connect(sg); sg.connect(this.sfxBus); so.start();
    this.stretch = { g: sg, o: so };
  }

  /** Called every frame while driving. */
  updateDrive({ speed = 0, throttle = 0, grounded = false, boosting = false, running = false, pull = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    const rpm = running ? Math.min(1, speed / 60) * 0.7 + throttle * 0.3 : 0;
    e.o1.frequency.setTargetAtTime(45 + rpm * 160 + (grounded ? 0 : throttle * 40), t, 0.06);
    e.o2.frequency.setTargetAtTime(22 + rpm * 80, t, 0.06);
    e.lp.frequency.setTargetAtTime(300 + rpm * 1600 + throttle * 600, t, 0.08);
    e.g.gain.setTargetAtTime(running ? 0.05 + throttle * 0.09 : 0, t, 0.08);
    this.wind.g.gain.setTargetAtTime(running ? Math.min(0.25, (speed / 80) ** 2 * 0.3) : 0, t, 0.15);
    this.wind.bp.frequency.setTargetAtTime(500 + speed * 18, t, 0.2);
    this.rocket.g.gain.setTargetAtTime(boosting ? 0.32 : 0, t, 0.05);
    this.rocket.lp.frequency.setTargetAtTime(boosting ? 700 + Math.random() * 400 : 400, t, 0.05);
    this.stretch.g.gain.setTargetAtTime(pull > 0.05 ? 0.03 + pull * 0.05 : 0, t, 0.05);
    this.stretch.o.frequency.setTargetAtTime(90 + pull * 260, t, 0.05);
  }

  silenceLoops() { this.updateDrive({}); }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noiseHit(dur, { freq = 1200, vol = 0.3, type = 'lowpass', delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  play(name, arg = 0) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'coin': {
        const f = 880 * Math.pow(2, Math.min(arg, 12) / 24);
        this.tone(f, 0.08, { type: 'square', vol: 0.06 });
        this.tone(f * 1.5, 0.12, { type: 'square', vol: 0.05, delay: 0.05 });
        break;
      }
      case 'star': [0, 4, 7, 12].forEach((n, i) => this.tone(660 * Math.pow(2, n / 12), 0.15, { type: 'triangle', vol: 0.12, delay: i * 0.05 })); break;
      case 'fuel': for (let i = 0; i < 3; i++) this.tone(300 - i * 40, 0.08, { type: 'sine', vol: 0.2, delay: i * 0.06, slide: -60 }); this.tone(520, 0.2, { type: 'triangle', vol: 0.1, delay: 0.2 }); break;
      case 'nitro': this.tone(300, 0.35, { type: 'sawtooth', vol: 0.08, slide: 900 }); break;
      case 'crate': this.noiseHit(0.18, { freq: 900, vol: 0.4 }); this.tone(140, 0.1, { type: 'square', vol: 0.08 }); break;
      case 'pad': this.tone(400, 0.3, { type: 'sawtooth', vol: 0.08, slide: 600 }); break;
      case 'thud': this.noiseHit(0.12, { freq: 300, vol: Math.min(0.35, 0.08 + arg * 0.02) }); break;
      case 'impact': this.noiseHit(0.35, { freq: 500, vol: 0.5 }); this.tone(70, 0.3, { type: 'sine', vol: 0.4, slide: -30 }); break;
      case 'scrape': this.noiseHit(0.1, { freq: 3000, vol: 0.08, type: 'highpass' }); break;
      case 'launch': this.tone(220, 0.35, { type: 'triangle', vol: 0.25, slide: 500 }); this.noiseHit(0.25, { freq: 2500, vol: 0.2, type: 'bandpass' }); break;
      case 'land': this.noiseHit(0.08, { freq: 400, vol: 0.12 }); break;
      case 'stunt': [0, 4, 7].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.12, { type: 'square', vol: 0.07, delay: i * 0.06 })); break;
      case 'perfect': [0, 7, 12, 16].forEach((n, i) => this.tone(587 * Math.pow(2, n / 12), 0.14, { type: 'triangle', vol: 0.12, delay: i * 0.05 })); break;
      case 'record': [0, 4, 7, 12, 7, 12].forEach((n, i) => this.tone(440 * Math.pow(2, n / 12), 0.18, { type: 'square', vol: 0.08, delay: i * 0.09 })); break;
      case 'biome': [0, 5, 9, 12].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.5, { type: 'triangle', vol: 0.1, delay: i * 0.12, attack: 0.05 })); break;
      case 'wreck': this.noiseHit(1.2, { freq: 700, vol: 0.7 }); this.tone(60, 0.9, { type: 'sawtooth', vol: 0.3, slide: -40 }); break;
      case 'buy': [0, 4, 7, 12].forEach((n, i) => this.tone(523 * Math.pow(2, (n + arg) / 12), 0.1, { type: 'square', vol: 0.06, delay: i * 0.035 })); break;
      case 'deny': this.tone(180, 0.15, { type: 'square', vol: 0.08, slide: -60 }); break;
      case 'click': this.tone(1200, 0.03, { type: 'square', vol: 0.04 }); break;
      case 'evolve': for (let i = 0; i < 10; i++) this.tone(300 * Math.pow(2, i / 5), 0.4, { type: 'triangle', vol: 0.08, delay: i * 0.07, attack: 0.03 }); break;
      case 'end': this.tone(392, 0.2, { type: 'triangle', vol: 0.12 }); this.tone(330, 0.3, { type: 'triangle', vol: 0.12, delay: 0.15 }); break;
      case 'mission': [0, 7, 12].forEach((n, i) => this.tone(659 * Math.pow(2, n / 12), 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.08 })); break;
    }
  }

  setMood(mood) { this.mood = mood; }

  // Tiny generative loop: bass + arpeggio + hats. Pentatonic so it never clashes.
  startMusic() {
    if (this.musicTimer) return;
    const c = this.ctx;
    const bpm = 112;
    const sixteenth = 60 / bpm / 4;
    let next = c.currentTime + 0.1;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const progression = [0, -4, -7, -2];
    const tick = () => {
      while (next < c.currentTime + 0.2) {
        const s = this.step++;
        const bar = Math.floor(s / 16) % 4;
        const root = 110 * Math.pow(2, progression[bar] / 12);
        const pos = s % 16;
        const driving = this.mood === 'run';
        if (pos % 4 === 0) this.musicNote(root / 2, sixteenth * 3, 'triangle', 0.35, next);
        if (driving && pos % 4 === 2) this.musicNote(root / 2, sixteenth, 'triangle', 0.2, next);
        if (pos % 2 === 0 || driving) {
          const n = scale[(s * 7 + bar * 3) % scale.length];
          if ((s * 13) % 5 !== 0) this.musicNote(root * 2 * Math.pow(2, n / 12), sixteenth * 0.9, 'square', driving ? 0.07 : 0.05, next);
        }
        if (driving && pos % 2 === 1) this.musicHat(next);
        next += sixteenth;
      }
    };
    this.musicTimer = setInterval(tick, 50);
  }

  musicNote(freq, dur, type, vol, t) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.02);
  }

  musicHat(t) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = c.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f); f.connect(g); g.connect(this.musicBus); s.start(t, Math.random()); s.stop(t + 0.06);
  }
}
