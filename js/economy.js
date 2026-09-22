const Economy = {
  HINT_COST: 50,
  DAILY_COIN_HINT_CAP: 2,
  DAILY_AD_CAP: 8,
  DAILY_PUZZLE_COIN_CAP: 80,
  AD_SECONDS: 8,
  REWARD: { 16: 8, 36: 14, 64: 22 },
  REPEAT: { 16: 3, 36: 5, 64: 8 },
  JIGSAW_REWARD: { 36: 18, 64: 26, 100: 34 },
  JIGSAW_REPEAT: { 36: 6, 64: 10, 100: 12 },
  FIRST_BONUS: 8,
  SIGN: [
    { day: 1, coins: 12, hint: 0, double: false, exclusive: false, label: "12 金币" },
    { day: 2, coins: 15, hint: 0, double: false, exclusive: false, label: "15 金币" },
    { day: 3, coins: 0, hint: 1, double: false, exclusive: false, label: "1 次提示" },
    { day: 4, coins: 18, hint: 0, double: false, exclusive: false, label: "18 金币" },
    { day: 5, coins: 0, hint: 0, double: true, exclusive: false, label: "双倍金币卡" },
    { day: 6, coins: 22, hint: 0, double: false, exclusive: false, label: "22 金币" },
    { day: 7, coins: 30, hint: 1, double: false, exclusive: true, label: "30金+提示+专属图" },
  ],

  canBuyHint(state) {
    if (state.coins < this.HINT_COST) return "金币不够。看广告更快。";
    if (state.daily.coinHintsBought >= this.DAILY_COIN_HINT_CAP) {
      return `今日金币兑换已达 ${this.DAILY_COIN_HINT_CAP} 次，请看广告。`;
    }
    return "";
  },

  buyHint(state) {
    const err = this.canBuyHint(state);
    if (err) return { ok: false, message: err };
    state.coins -= this.HINT_COST;
    state.hints += 1;
    state.daily.coinHintsBought += 1;
    return { ok: true, message: `已兑换 1 次提示，今日还可兑 ${this.DAILY_COIN_HINT_CAP - state.daily.coinHintsBought} 次` };
  },

  canWatchAd(state) {
    if (state.daily.adsWatched >= this.DAILY_AD_CAP) return "今日广告次数用完了，明天再来。";
    return "";
  },

  grantAd(state) {
    const err = this.canWatchAd(state);
    if (err) return { ok: false, message: err };
    state.daily.adsWatched += 1;
    state.hints += 1;
    return {
      ok: true,
      message: `获得 1 次提示，今日还可看 ${this.DAILY_AD_CAP - state.daily.adsWatched} 次广告`,
    };
  },

  complete(state, { grid, imageId, shape }) {
    const pieces = grid * grid;
    const firstToday = !state.daily.completedIds.includes(imageId);
    const rewardTable = shape === "jigsaw" ? this.JIGSAW_REWARD : this.REWARD;
    const repeatTable = shape === "jigsaw" ? this.JIGSAW_REPEAT : this.REPEAT;
    let base = firstToday ? (rewardTable[pieces] || 8) : (repeatTable[pieces] || 3);
    let firstBonus = 0;
    if (!state.daily.firstCompleteBonus) {
      firstBonus = this.FIRST_BONUS;
      state.daily.firstCompleteBonus = true;
    }
    const beforeDouble = base + firstBonus;
    const doubled = state.doubleCoinNext;
    let gain = doubled ? beforeDouble * 2 : beforeDouble;
    if (doubled) state.doubleCoinNext = false;

    const room = Math.max(0, this.DAILY_PUZZLE_COIN_CAP - state.daily.puzzleCoins);
    const capped = gain > room;
    gain = Math.min(gain, room);
    state.coins += gain;
    state.daily.puzzleCoins += gain;
    if (firstToday) state.daily.completedIds.push(imageId);

    return {
      base,
      firstBonus,
      doubled,
      gain,
      capped,
      roomLeft: this.DAILY_PUZZLE_COIN_CAP - state.daily.puzzleCoins,
    };
  },

  signStatus(state) {
    const today = Store.today();
    if (state.lastSignDate === today) return { claimed: true, nextDay: ((state.signCycleDay - 1) % 7) + 1 };
    if (!state.lastSignDate) return { claimed: false, nextDay: 1, reset: false };
    const last = new Date(state.lastSignDate + "T00:00:00");
    const now = new Date(today + "T00:00:00");
    const diff = Math.round((now - last) / 86400000);
    if (diff === 1) return { claimed: false, nextDay: (state.signCycleDay % 7) + 1, reset: false };
    return { claimed: false, nextDay: 1, reset: true };
  },

  claimSign(state) {
    const status = this.signStatus(state);
    if (status.claimed) return { ok: false, message: "今天已经签过到了" };
    const day = status.nextDay;
    const pack = this.SIGN[day - 1];
    state.lastSignDate = Store.today();
    state.signCycleDay = day;
    state.streak = status.reset ? 1 : (state.streak || 0) + 1;
    if (pack.coins) state.coins += pack.coins;
    if (pack.hint) state.hints += pack.hint;
    if (pack.double) state.doubleCoinNext = true;
    if (pack.exclusive) {
      state.unlockedExclusive = true;
      if (!state.badges.includes("七日慢拼")) state.badges.push("七日慢拼");
    }
    if (state.streak >= 3 && !state.badges.includes("连续三天")) state.badges.push("连续三天");
    return { ok: true, pack, day, streak: state.streak };
  },

  consumeHint(state) {
    if (state.hints <= 0) return false;
    state.hints -= 1;
    return true;
  },
};
