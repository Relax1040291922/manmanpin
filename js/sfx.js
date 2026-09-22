const Sfx = (() => {
  let ctx = null;
  let enabled = true;

  function setEnabled(on) {
    enabled = !!on;
  }

  function isEnabled() {
    return enabled;
  }

  function unlock() {
    const c = ac();
    if (c && c.state === "suspended") c.resume();
  }

  function ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  }

  function env(c, gain, peak, dur, t) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(c.destination);
    return g;
  }

  function osc(c, type, freq, dur, peak, delay) {
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(env(c, 0, peak, dur, t));
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(c, dur, peak, hp, delay) {
    const t = c.currentTime + (delay || 0);
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = hp;
    f.Q.value = 0.8;
    src.connect(f);
    f.connect(env(c, 0, peak, dur, t));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const cues = {
    pick() {
      const c = ac();
      if (!c) return;
      noise(c, 0.05, 0.06, 1800);
      osc(c, "triangle", 240, 0.07, 0.04);
    },
    lock() {
      const c = ac();
      if (!c) return;
      noise(c, 0.04, 0.05, 900);
      osc(c, "triangle", 392, 0.09, 0.07);
      osc(c, "sine", 588, 0.12, 0.05, 0.02);
    },
    seat() {
      const c = ac();
      if (!c) return;
      noise(c, 0.09, 0.07, 380);
      osc(c, "sawtooth", 220, 0.12, 0.06);
      osc(c, "triangle", 146, 0.16, 0.05, 0.04);
    },
    back() {
      const c = ac();
      if (!c) return;
      osc(c, "sine", 220, 0.08, 0.03);
    },
    undo() {
      const c = ac();
      if (!c) return;
      osc(c, "sine", 330, 0.08, 0.04);
      osc(c, "sine", 247, 0.1, 0.035, 0.04);
    },
    peek() {
      const c = ac();
      if (!c) return;
      osc(c, "sine", 880, 0.06, 0.035);
      osc(c, "sine", 1320, 0.07, 0.03, 0.03);
    },
    hint() {
      const c = ac();
      if (!c) return;
      osc(c, "sine", 523, 0.1, 0.05);
      osc(c, "sine", 659, 0.12, 0.045, 0.05);
      osc(c, "triangle", 784, 0.14, 0.04, 0.1);
    },
    win() {
      const c = ac();
      if (!c) return;
      osc(c, "sine", 523.25, 0.16, 0.06);
      osc(c, "sine", 659.25, 0.18, 0.055, 0.08);
      osc(c, "sine", 783.99, 0.22, 0.06, 0.16);
      osc(c, "triangle", 1046.5, 0.28, 0.04, 0.24);
    },
  };

  function play(name) {
    if (!enabled) return;
    const fn = cues[name];
    if (!fn) return;
    try {
      unlock();
      fn();
    } catch (_) {}
  }

  return { play, setEnabled, isEnabled, unlock };
})();
