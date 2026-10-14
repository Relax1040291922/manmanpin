const Sfx = (() => {
  const FILES = {
    pick: "assets/sfx/pick.wav",
    lock: "assets/sfx/lock.wav",
    combo: "assets/sfx/combo.wav",
    back: "assets/sfx/back.wav",
    seat: "assets/sfx/back.wav",
    undo: "assets/sfx/undo.wav",
    peek: "assets/sfx/peek.wav",
    hint: "assets/sfx/hint.wav",
    deal: "assets/sfx/deal.wav",
    scatter: "assets/sfx/scatter.wav",
    win: "assets/sfx/win.wav",
  };
  const ROOM = "assets/sfx/room.wav";

  let ctx = null;
  let bus = null;
  let sfxOn = true;
  let musicOn = false;
  const buffers = {};
  let roomBuf = null;
  let musicGain = null;
  let musicSrc = null;
  let loading = false;

  function setEnabled(on) {
    sfxOn = !!on;
  }

  function isEnabled() {
    return sfxOn;
  }

  function setMusicEnabled(on) {
    musicOn = !!on;
    if (!musicOn) stopMusic();
  }

  function ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      bus = null;
      musicGain = null;
    }
    return ctx;
  }

  function out() {
    const c = ac();
    if (!c) return null;
    if (!bus) {
      bus = c.createGain();
      bus.gain.value = 0.9;
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

  function musicOut() {
    const c = ac();
    if (!c) return null;
    if (!musicGain) {
      musicGain = c.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(c.destination);
    }
    return musicGain;
  }

  function unlock() {
    const c = ac();
    if (!c) return Promise.resolve();
    if (c.state === "suspended") return c.resume().catch(() => {});
    return Promise.resolve();
  }

  function decode(url) {
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("sfx missing");
        return r.arrayBuffer();
      })
      .then((ab) => ac().decodeAudioData(ab.slice(0)));
  }

  function load() {
    if (loading) return;
    loading = true;
    if (!ac()) return;
    Object.keys(FILES).forEach((name) => {
      decode(FILES[name]).then((buf) => { buffers[name] = buf; }).catch(() => {});
    });
    decode(ROOM).then((buf) => { roomBuf = buf; }).catch(() => {});
  }

  function play(name) {
    if (!sfxOn) return;
    const run = () => {
      const buf = buffers[name];
      const dest = out();
      if (!buf || !dest) return;
      try {
        const src = ac().createBufferSource();
        src.buffer = buf;
        src.connect(dest);
        src.start();
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

  function startMusic() {
    if (!musicOn) return;
    const c = ac();
    const g = musicOut();
    if (!c || !g) return;
    if (!roomBuf) {
      decode(ROOM).then((buf) => { roomBuf = buf; startMusic(); }).catch(() => {});
      return;
    }
    stopMusic(true);
    try {
      musicSrc = c.createBufferSource();
      musicSrc.buffer = roomBuf;
      musicSrc.loop = true;
      musicSrc.connect(g);
      const now = c.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value || 0.0001, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.6);
      musicSrc.start();
    } catch (_) {
      musicSrc = null;
    }
  }

  function stopMusic(immediate) {
    const c = ctx;
    const g = musicGain;
    const src = musicSrc;
    musicSrc = null;
    if (!c || !g) return;
    try {
      const now = c.currentTime;
      g.gain.cancelScheduledValues(now);
      if (immediate) {
        g.gain.setValueAtTime(0, now);
        if (src) src.stop();
      } else {
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value || 0.0001), now);
        g.gain.linearRampToValueAtTime(0.0001, now + 0.45);
        if (src) setTimeout(() => { try { src.stop(); } catch (_) {} }, 480);
      }
    } catch (_) {}
  }

  return {
    play, load, unlock,
    setEnabled, isEnabled,
    setMusicEnabled, startMusic, stopMusic,
  };
})();
