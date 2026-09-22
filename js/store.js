const Store = (() => {
  const KEY = "manmanpin_v1";

  const defaultState = () => ({
    version: 1,
    coins: 20,
    hints: 3,
    streak: 0,
    lastSignDate: "",
    signCycleDay: 0,
    doubleCoinNext: false,
    unlockedExclusive: false,
    badges: [],
    daily: emptyDaily(today()),
    collection: [],
    uploads: [],
    stages: {},
    soundOn: true,
  });

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function emptyDaily(date) {
    return {
      date,
      puzzleCoins: 0,
      coinHintsBought: 0,
      adsWatched: 0,
      completedIds: [],
      firstCompleteBonus: false,
    };
  }

  function load() {
    let state;
    try {
      state = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      state = null;
    }
    if (!state || state.version !== 1) state = defaultState();
    if (!Array.isArray(state.uploads)) state.uploads = [];
    if (typeof state.soundOn !== "boolean") state.soundOn = true;
    if (!state.stages || typeof state.stages !== "object") state.stages = {};
    if (state.daily.date !== today()) {
      state.daily = emptyDaily(today());
    }
    return state;
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function reset() {
    const state = defaultState();
    save(state);
    return state;
  }

  return { load, save, reset, today };
})();
