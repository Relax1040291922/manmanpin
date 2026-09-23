const Sfx = (() => {
  let ctx = null;
  let bus = null;
  let enabled = true;

  function setEnabled(on) {
    enabled = !!on;
  }

  function isEnabled() {
    return enabled;
  }

  function ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      bus = null;
    }
    return ctx;
  }

  function out() {
    const c = ac();
    if (!c) return null;
    if (!bus) {
      bus = c.createGain();
      bus.gain.value = 0.85;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
      bus.connect(comp);
      comp.connect(c.destination);
    }
    return bus;
  }

  function unlock() {
    const c = ac();
    if (!c) return Promise.resolve();
    if (c.state === "suspended") return c.resume().catch(() => {});
    return Promise.resolve();
  }

  function env(peak, dur, t) {
    const c = ac();
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(out());
    return g;
  }

  function osc(type, freq, dur, peak, delay, slide) {
    const c = ac();
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    o.connect(env(peak, dur, t));
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  function noise(dur, peak, freq, delay, type) {
    const c = ac();
    const t = c.currentTime + (delay || 0);
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type || "bandpass";
    f.frequency.value = freq;
    f.Q.value = type === "lowpass" ? 0.6 : 1.1;
    src.connect(f);
    f.connect(env(peak, dur, t));
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  function buzz(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  const cues = {
    pick() {
      noise(0.045, 0.22, 1400, 0, "highpass");
      osc("triangle", 420, 0.07, 0.18);
      osc("sine", 210, 0.05, 0.1);
    },
    lock() {
      noise(0.05, 0.2, 700, 0, "lowpass");
      osc("triangle", 392, 0.1, 0.28);
      osc("sine", 784, 0.14, 0.2, 0.03);
      buzz(12);
    },
    combo() {
      noise(0.04, 0.16, 1200);
      osc("triangle", 523, 0.08, 0.24);
      osc("sine", 784, 0.12, 0.22, 0.04);
      osc("sine", 1046, 0.16, 0.18, 0.08);
      buzz(16);
    },
    seat() {
      noise(0.1, 0.28, 240, 0, "lowpass");
      osc("sawtooth", 140, 0.12, 0.16, 0, 90);
      osc("triangle", 110, 0.14, 0.12);
      buzz(24);
    },
    back() {
      osc("sine", 180, 0.08, 0.12);
      osc("triangle", 140, 0.1, 0.08, 0.02);
    },
    undo() {
      osc("sine", 330, 0.09, 0.16);
      osc("sine", 247, 0.11, 0.14, 0.05);
    },
    peek() {
      osc("sine", 880, 0.08, 0.16);
      osc("sine", 1320, 0.1, 0.14, 0.04);
      osc("triangle", 1760, 0.08, 0.08, 0.08);
    },
    hint() {
      osc("sine", 523, 0.11, 0.2);
      osc("sine", 659, 0.13, 0.18, 0.05);
      osc("triangle", 784, 0.16, 0.16, 0.1);
    },
    deal() {
      noise(0.08, 0.14, 900);
      osc("triangle", 262, 0.1, 0.14);
      osc("triangle", 330, 0.1, 0.12, 0.06);
      osc("triangle", 392, 0.12, 0.12, 0.12);
    },
    scatter() {
      noise(0.16, 0.24, 480, 0, "highpass");
      osc("sawtooth", 220, 0.12, 0.12, 0, 80);
      osc("triangle", 160, 0.14, 0.1, 0.03);
    },
    win() {
      osc("sine", 523.25, 0.18, 0.24);
      osc("sine", 659.25, 0.2, 0.22, 0.08);
      osc("sine", 783.99, 0.24, 0.24, 0.16);
      osc("triangle", 1046.5, 0.32, 0.2, 0.24);
      osc("sine", 1318.5, 0.28, 0.12, 0.34);
      buzz([12, 40, 18]);
    },
  };

  function play(name) {
    if (!enabled) return;
    const fn = cues[name];
    if (!fn) return;
    const run = () => {
      try {
        if (!out()) return;
        fn();
      } catch (_) {}
    };
    const c = ac();
    if (!c) return;
    if (c.state === "suspended") {
      c.resume().then(run).catch(() => {});
      return;
    }
    run();
  }

  return { play, setEnabled, isEnabled, unlock };
})();
