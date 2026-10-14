const $ = (id) => document.getElementById(id);

let state = Store.load();
let galleryCat = "beauty";
let play = {
  image: null,
  grid: 4,
  stage: null,
  shape: "square",
  autoNext: false,
  startedAt: 0,
  timer: 0,
  peeks: 2,
  undos: 5,
  uploadUrl: "",
  localUrl: "",
};
let crop = { img: null, scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 };

const STAGES = [
  { i: 0, grid: 4, shape: "square", pieces: 16, name: "第一关", undos: 5, prelock: 0, nextLine: "换成咬合的，还是 16 块" },
  { i: 1, grid: 4, shape: "jigsaw", pieces: 16, name: "第二关", undos: 6, prelock: 1, nextLine: "再难一点，拼 36 块" },
  { i: 2, grid: 6, shape: "square", pieces: 36, name: "第三关", undos: 6, prelock: 0, nextLine: "换成咬合的，36 块" },
  { i: 3, grid: 6, shape: "jigsaw", pieces: 36, name: "第四关", undos: 8, prelock: 2, nextLine: "再碎一回，拼 64 块" },
  { i: 4, grid: 8, shape: "square", pieces: 64, name: "第五关", undos: 8, prelock: 0, nextLine: "最后一关，咬合 100 块" },
  { i: 5, grid: 10, shape: "jigsaw", pieces: 100, name: "第六关", undos: 12, prelock: 3, nextLine: null },
];

function migrateCleared(raw) {
  if (!raw) return 0;
  if (raw === 16) return 1;
  if (raw === 36) return 2;
  if (raw === 64) return 3;
  if (raw >= 1 && raw <= STAGES.length) return raw;
  return 0;
}

function clearedOf(img) {
  if (!img) return 0;
  return migrateCleared((state.stages && state.stages[img.id] && state.stages[img.id].cleared) || 0);
}

function nextStageOf(img) {
  const n = clearedOf(img);
  return STAGES[n >= STAGES.length ? 0 : n];
}

function recordClear(img, stageIndex) {
  if (!state.stages) state.stages = {};
  const prev = clearedOf(img);
  state.stages[img.id] = { cleared: Math.max(prev, stageIndex + 1) };
}

function startLabel(img) {
  const n = clearedOf(img);
  if (n >= STAGES.length) return "从第一关再来";
  if (n === 0) return "开始第一关";
  return `继续${STAGES[n].name}`;
}

function resolveStage(arg) {
  if (arg && typeof arg === "object" && Number.isInteger(arg.i)) return STAGES[arg.i] || STAGES[0];
  if (typeof arg === "number" && STAGES[arg]) return STAGES[arg];
  if (typeof arg === "number") {
    return STAGES.find((s) => s.pieces === arg && s.shape === "square") || STAGES[0];
  }
  return null;
}

function stageMeta(stage) {
  if (stage.shape === "jigsaw") return `${stage.name} · 咬合 ${stage.pieces} 块`;
  return `${stage.name} ${stage.pieces} 块`;
}

function cancelAutoNext() {
  play.autoNext = false;
  shatterIntoNext._busy = false;
  clearTimeout(finishPlay._t);
  clearTimeout(shatterIntoNext._t);
  const sheet = $("sheet-result");
  if (sheet) sheet.classList.remove("auto-next");
}

function peoplePool() {
  return IMAGES.filter((x) => !x.exclusive && ["beauty", "handsome", "anime"].includes(x.cat));
}

function nextImageAfter(img) {
  const pool = peoplePool();
  const i = pool.findIndex((x) => img && x.id === img.id);
  if (i < 0) return pool[0] || IMAGES[0];
  return pool[(i + 1) % pool.length];
}

function goGallery() {
  document.querySelector('[data-tab="gallery"]').click();
}

function goMe() {
  document.querySelector('[data-tab="me"]').click();
}

function paintSplash() {
  const photo = $("splash-photo");
  if (!photo) return;
  const img = dailyImage() || IMAGES.find((x) => x.cat === "beauty") || IMAGES[0];
  if (img) photo.src = img.src;
}

function dismissSplash() {
  const el = $("splash");
  if (!el || el.hidden) return;
  el.classList.add("out");
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove("out");
  }, 380);
}

function startSplash() {
  paintSplash();
}

function dailyImage() {
  const pool = IMAGES.filter((x) => !x.exclusive && x.cat === "beauty");
  const seed = Store.today().split("-").join("");
  return pool[Number(seed) % pool.length];
}

function toast(msg, kind) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("warn", kind === "warn");
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show", "warn"), kind === "warn" ? 1100 : 1600);
}

function toastOnce(key, msg, kind) {
  const now = Date.now();
  if (toastOnce.key === key && now - (toastOnce.at || 0) < 1400) return;
  toastOnce.key = key;
  toastOnce.at = now;
  toast(msg, kind);
}

function paintPlayPips(stage) {
  const box = $("play-pips");
  if (!box || !stage) return;
  box.innerHTML = STAGES.map((s) => {
    const on = s.i <= stage.i ? "on" : "";
    const jag = s.shape === "jigsaw" ? "jag" : "";
    const cls = [on, jag].filter(Boolean).join(" ");
    return `<i${cls ? ` class="${cls}"` : ""}></i>`;
  }).join("");
}

function paintPlayStatus(stage, p) {
  $("play-progress").textContent = `${p.locked}/${p.total}`;
}

function paintPlayMenu() {
  const meta = $("play-menu-meta");
  if (meta) {
    const stage = play.stage;
    meta.textContent = stage
      ? `${stage.name} · 提示 ${state.hints} · 撤销 ${play.undos}`
      : `提示 ${state.hints}`;
  }
  if ($("btn-peek")) $("btn-peek").textContent = `看清楚 ${play.peeks}`;
  if ($("btn-undo")) $("btn-undo").textContent = `撤销 ${play.undos}`;
  paintSoundBtn();
}

function renderWallet() {
  document.querySelectorAll("[data-coins]").forEach((n) => { n.textContent = state.coins; });
  document.querySelectorAll("[data-hints]").forEach((n) => { n.textContent = state.hints; });
}

function showScreen(name) {
  closeCatMore();
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
  const playMode = name === "play";
  const hideChrome = name === "play" || name === "crop";
  $("phone").classList.toggle("playing", playMode);
  $("tabbar").style.display = hideChrome ? "none" : "flex";
  if ($("wallet")) $("wallet").style.display = hideChrome ? "none" : "flex";
  $("btn-back").style.visibility = name === "crop" ? "visible" : "hidden";
  $("topbar").style.display = playMode ? "none" : "";
  $("nav-title").textContent = {
    home: "拼个帅哥美女",
    gallery: "图库",
    me: "我的",
    play: "拼图中",
    crop: "裁成方形",
  }[name];
  if (name === "home") renderHome();
  if (name === "gallery") renderGallery();
  if (name === "me") renderMe();
  if (name === "play") Sfx.startMusic();
  else Sfx.stopMusic();
}

function renderHome() {
  const img = dailyImage() || IMAGES[0];
  const cover = $("daily-img");
  if (!img || !cover) return;
  cover.onerror = () => {
    $("daily-name").textContent = "今日图片加载失败";
    $("daily-meta").textContent = "检查 assets 文件夹后刷新";
  };
  cover.src = img.src;
  $("daily-name").textContent = img.name;
  const cat = (CATS.find((c) => c.id === img.cat) || {}).name || "";
  const cleared = clearedOf(img);
  if (cleared >= STAGES.length) {
    $("daily-meta").textContent = `六关已通 · ${cat} · 连续 ${state.streak} 天`;
  } else {
    $("daily-meta").textContent = `${stageMeta(STAGES[cleared])} · ${cat} · 连续 ${state.streak} 天`;
  }
  $("home-start").textContent = startLabel(img);
  $("home-start").onclick = () => startPlay(img);
}

function allGalleryImages() {
  return IMAGES.concat(state.uploads || []);
}

function closeCatMore() {
  const pop = $("cats-pop");
  const more = $("cats-more");
  const bar = document.querySelector(".cats-bar");
  if (pop) pop.hidden = true;
  if (more) {
    more.classList.remove("open");
    more.setAttribute("aria-expanded", "false");
  }
  if (bar) bar.classList.remove("open");
  const label = $("cats-more-label");
  if (label) label.textContent = "更多";
}

function renderGallery() {
  const cats = $("gallery-cats");
  cats.innerHTML = "";
  CAT_PINNED.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.name;
    b.className = galleryCat === c.id ? "on" : "";
    b.onclick = () => {
      galleryCat = c.id;
      closeCatMore();
      renderGallery();
    };
    cats.appendChild(b);
  });
  const more = $("cats-more");
  const pop = $("cats-pop");
  const bar = document.querySelector(".cats-bar");
  const moreActive = CAT_MORE.some((c) => c.id === galleryCat);
  const open = !pop.hidden;
  more.classList.toggle("on", moreActive && !open);
  more.classList.toggle("open", open);
  more.setAttribute("aria-expanded", open ? "true" : "false");
  $("cats-more-label").textContent = open ? "收起" : "更多";
  if (bar) bar.classList.toggle("open", open);
  pop.innerHTML = "";
  CAT_MORE.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.name;
    b.className = galleryCat === c.id ? "on" : "";
    b.onclick = () => {
      galleryCat = c.id;
      closeCatMore();
      renderGallery();
    };
    pop.appendChild(b);
  });
  const hint = $("gallery-hint");
  if (hint) hint.textContent = galleryCat === "local" ? "只在这台设备玩，不上传" : "点一张就开始拼";
  const box = $("gallery-grid");
  box.innerHTML = "";
  if (galleryCat === "local") {
    const pick = document.createElement("button");
    pick.className = "upload-tile";
    pick.innerHTML = "<strong>选一张本地图</strong><span>只在这台设备玩，不上传</span>";
    pick.onclick = () => $("file-local").click();
    box.appendChild(pick);
    return;
  }
  if (galleryCat === "all" || galleryCat === "mine") {
    const upload = document.createElement("button");
    upload.className = "upload-tile";
    upload.innerHTML = "<strong>上传自己的图</strong><span>最大 5MB，最短边 ≥ 480</span>";
    upload.onclick = () => $("file").click();
    box.appendChild(upload);
  }
  const list = allGalleryImages().filter((img) => {
    if (galleryCat === "all") return true;
    if (galleryCat === "mine") return img.cat === "mine";
    return img.cat === galleryCat;
  });
  if (!list.length && galleryCat === "mine") {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.style.gridColumn = "1 / -1";
    empty.innerHTML = "<strong>还没有自己的图</strong>上传一张，会出现在「我的」里";
    box.appendChild(empty);
    return;
  }
  list.forEach((img) => {
    const locked = img.exclusive && !state.unlockedExclusive;
    const cleared = clearedOf(img);
    const pips = STAGES.map((s) => {
      const cls = [cleared > s.i ? "on" : "", s.shape === "jigsaw" ? "jag" : ""].filter(Boolean).join(" ");
      return `<i${cls ? ` class="${cls}"` : ""}></i>`;
    }).join("");
    const btn = document.createElement("button");
    btn.className = "thumb";
    btn.innerHTML = `<img src="${img.src}" alt="${img.name}"><p>${img.name}${img.exclusive ? " · 签到第7天" : ""}</p><div class="stage-pips">${pips}</div>${locked ? '<div class="lock">连续签到解锁</div>' : ""}`;
    btn.onclick = () => {
      if (locked) {
        toast("签到满 7 天可解锁江南院");
        return;
      }
      startPlay(img);
    };
    box.appendChild(btn);
  });
}

function renderMe() {
  renderWallet();
  paintSoundBtn();
  paintMusicBtn();
  const adLeft = Economy.DAILY_AD_CAP - state.daily.adsWatched;
  const buyLeft = Economy.DAILY_COIN_HINT_CAP - state.daily.coinHintsBought;
  $("me-ad-sub").textContent = `看完即得 1 次提示，今日还剩 ${adLeft} 次`;
  $("me-buy-sub").textContent = `${Economy.HINT_COST} 金币 / 次，今日还剩 ${buyLeft} 次`;
  $("me-sign-sub").textContent = Economy.signStatus(state).claimed ? "今天已签到" : "今日未签到";
  $("me-cap").textContent = `今日拼图金币 ${state.daily.puzzleCoins}/${Economy.DAILY_PUZZLE_COIN_CAP}`;
  $("badge-list").textContent = state.badges.length ? state.badges.join(" · ") : "还没有徽章";
  const col = $("collection");
  if (!state.collection.length) {
    col.innerHTML = `<div class="empty" style="grid-column:1/-1"><strong>画廊是空的</strong>拼完一张就会收进来</div>`;
  } else {
    col.innerHTML = state.collection
      .slice()
      .reverse()
      .map((c) => `<img src="${c.src}" alt="${c.name}" title="${c.name}">`)
      .join("");
  }
}

function sfxEnabled() {
  return state.sfxOn !== false && state.soundOn !== false;
}

function paintSoundBtn() {
  const on = sfxEnabled();
  const btn = $("btn-sound");
  if (btn) {
    btn.textContent = on ? "音效 开" : "音效 关";
    btn.classList.toggle("off", !on);
    btn.setAttribute("aria-label", on ? "关闭音效" : "打开音效");
  }
  const me = $("me-sfx");
  if (me) {
    me.textContent = on ? "音效 开" : "音效 关";
    me.classList.toggle("off", !on);
  }
}

function paintMusicBtn() {
  const me = $("me-music");
  if (!me) return;
  me.textContent = state.musicOn ? "音乐 开" : "音乐 关";
  me.classList.toggle("off", !state.musicOn);
}

function toggleSound() {
  const next = !sfxEnabled();
  state.sfxOn = next;
  state.soundOn = next;
  Sfx.setEnabled(next);
  Store.save(state);
  paintSoundBtn();
  Sfx.unlock();
  if (next) Sfx.play("lock");
}

function toggleMusic() {
  state.musicOn = !state.musicOn;
  Sfx.setMusicEnabled(state.musicOn);
  Store.save(state);
  paintMusicBtn();
  Sfx.unlock();
  if (state.musicOn && $("screen-play").classList.contains("active")) Sfx.startMusic();
  else Sfx.stopMusic();
}
function startPlay(image, stageArg) {
  cancelAutoNext();
  const stage = resolveStage(stageArg) || nextStageOf(image);
  play.image = image;
  play.stage = stage;
  play.grid = stage.grid;
  play.shape = stage.shape;
  play.startedAt = Date.now();
  play.peeks = 2;
  play.undos = stage.undos;
  showScreen("play");
  paintPlayPips(stage);
  paintPlayMenu();
  $("play-progress").textContent = `0/${stage.pieces}`;
  $("board").classList.remove("shattering");
  requestAnimationFrame(() => {
    Puzzle.create({
      board: $("board"),
      tray: $("tray"),
      ghost: $("ghost"),
      imageUrl: image.src,
      grid: play.grid,
      shape: stage.shape,
      seed: image.id || image.src,
      prelock: stage.prelock || 0,
      onSfx: (name) => Sfx.play(name),
      onChange: (p) => paintPlayStatus(stage, p),
      onJudge: (kind, p) => {
        if (kind === "wrong") toast("没咬住", "warn");
        if (kind === "board-full") toast(`还有 ${p.seated} 块没对`, "warn");
        if (kind === "frozen") toastOnce("frozen", "放下就不能再挪");
        if (kind === "fixed") toastOnce("fixed", "这块已经放对了");
      },
      onComplete: finishPlay,
    });
    tick();
  });
}

function tick() {
  clearInterval(play.timer);
  const paint = () => {
    const s = Math.floor((Date.now() - play.startedAt) / 1000);
    $("play-time").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  paint();
  play.timer = setInterval(paint, 400);
}

function finishPlay() {
  clearInterval(play.timer);
  const stage = play.stage || STAGES[0];
  const next = STAGES[stage.i + 1];
  const reward = Economy.complete(state, {
    grid: play.grid,
    imageId: play.image.id,
    shape: stage.shape,
  });
  recordClear(play.image, stage.i);
  if (!play.image.ephemeral && !state.collection.some((c) => c.id === play.image.id && c.src === play.image.src)) {
    state.collection.push({
      id: play.image.id,
      name: play.image.name,
      src: play.image.src,
      at: Date.now(),
    });
  }
  Store.save(state);
  renderWallet();
  const lines = [
    `基础 ${reward.base} 金币`,
    reward.firstBonus ? `今日首张 +${reward.firstBonus}` : "今日首张奖励已领过",
    reward.doubled ? "双倍金币卡已生效" : "",
    reward.capped ? "已触达今日拼图金币上限" : `今日拼图金币还剩 ${reward.roomLeft}`,
  ].filter(Boolean);
  $("result-photo").style.backgroundImage = play.image.src ? `url("${play.image.src}")` : "";
  const grand = !next;
  $("sheet-result").classList.toggle("grand", grand);
  paintClearBurst(grand);
  const nextImg = nextImageAfter(play.image);
  $("result-more").textContent = `拼下一张 · ${nextImg.name}`;
  $("result-more").className = "btn btn-ghost";
  $("result-more").style.marginTop = "8px";
  $("result-home").textContent = "去图库";
  $("result-next").style.display = "none";
  $("result-auto").hidden = true;
  $("sheet-result").classList.remove("auto-next");
  $("result-nextbar-wrap").hidden = true;
  if (next) {
    play.autoNext = true;
    $("result-kicker").textContent = `${stage.name} 过了`;
    $("result-title").textContent = "漂亮";
    $("result-desc").textContent = stage.nextLine;
    $("result-reward").innerHTML = `<em>+${reward.gain}</em><span>金币</span>`;
    $("result-again").textContent = "再拼本关";
    $("result-auto").hidden = false;
    $("result-auto").textContent = "下一关马上开始";
    $("result-nextbar-wrap").hidden = false;
    const bar = $("result-nextbar");
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
    $("sheet-result").classList.add("auto-next");
    openSheet("result", true);
    clearTimeout(finishPlay._t);
    finishPlay._t = setTimeout(() => shatterIntoNext(), 2000);
  } else {
    play.autoNext = false;
    $("result-kicker").textContent = "六关全通";
    $("result-title").textContent = "成了";
    $("result-desc").textContent = `${play.image.name} · 从 16 块拼到 100 块 · ${$("play-time").textContent}`;
    $("result-reward").innerHTML = `<em>+${reward.gain}</em><span>金币</span><small style="display:block;font-weight:400;margin-top:4px">${lines[0] || ""}</small>`;
    $("result-more").className = "btn btn-primary";
    $("result-more").style.marginTop = "0";
    $("result-again").textContent = "从第一关再来";
    $("result-home").className = "btn btn-ghost";
    openSheet("result", true);
  }
}

function paintClearBurst(grand) {
  const box = $("result-burst");
  if (!box) return;
  const colors = ["#D4A017", "#C45C26", "#F4EFE6", "#3F6B4E"];
  const n = grand ? 22 : 12;
  box.innerHTML = Array.from({ length: n }, (_, i) => {
    const r = Math.round((360 / n) * i + (i % 2 ? 8 : -6));
    return `<i style="--i:${i};--r:${r}deg;--dot:${colors[i % colors.length]}"></i>`;
  }).join("");
}

function shatterIntoNext() {
  if (shatterIntoNext._busy) return;
  const next = play.stage ? STAGES[play.stage.i + 1] : null;
  if (!next || !play.image) return;
  shatterIntoNext._busy = true;
  play.autoNext = false;
  clearTimeout(finishPlay._t);
  $("sheet-result").classList.remove("auto-next");
  closeSheet();
  const board = $("board");
  board.querySelectorAll(".piece").forEach((el) => {
    el.style.setProperty("--sx", Math.round(Math.random() * 90 - 45) + "px");
    el.style.setProperty("--sy", Math.round(Math.random() * 80 + 8) + "px");
    el.style.setProperty("--sr", Math.round(Math.random() * 48 - 24) + "deg");
  });
  board.classList.add("shattering");
  Sfx.play("scatter");
  clearTimeout(shatterIntoNext._t);
  shatterIntoNext._t = setTimeout(() => {
    board.classList.remove("shattering");
    startPlay(play.image, next);
  }, 680);
}

function openSheet(name, center) {
  $("overlay").classList.add("show");
  $("overlay").dataset.sheet = name;
  document.querySelectorAll(".sheet").forEach((s) => { s.style.display = "none"; });
  const sheet = $("sheet-" + name);
  sheet.style.display = "block";
  sheet.classList.toggle("center", !!center);
}

function closeSheet() {
  $("overlay").classList.remove("show");
}

function useHint() {
  if (state.hints <= 0) {
    openSheet("need-hint", true);
    return;
  }
  Economy.consumeHint(state);
  Store.save(state);
  renderWallet();
  Puzzle.hint();
  if ($("overlay").dataset.sheet === "play") closeSheet();
  paintPlayMenu();
}

function useUndo() {
  if (play.undos <= 0) return toast("这局撤销用完了");
  if (!Puzzle.undo()) return toast("没有可撤销的步骤");
  play.undos -= 1;
  if ($("overlay").dataset.sheet === "play") closeSheet();
  paintPlayMenu();
}

function usePeek() {
  if (play.peeks <= 0) return toast("这局免费看图用完了，请用提示");
  play.peeks -= 1;
  Sfx.play("peek");
  Puzzle.peek(1400);
  if ($("overlay").dataset.sheet === "play") closeSheet();
  paintPlayMenu();
}

function startAd() {
  const err = Economy.canWatchAd(state);
  if (err) return toast(err);
  openSheet("ad", true);
  let left = Economy.AD_SECONDS;
  $("ad-count").textContent = left;
  $("ad-bar").style.width = "0%";
  clearInterval(startAd._t);
  startAd._t = setInterval(() => {
    left -= 1;
    $("ad-count").textContent = Math.max(0, left);
    $("ad-bar").style.width = `${((Economy.AD_SECONDS - left) / Economy.AD_SECONDS) * 100}%`;
    if (left <= 0) {
      clearInterval(startAd._t);
      if (Math.random() < 0.1) {
        $("ad-status").textContent = "广告没播完，点重试再看一次";
        $("ad-retry").style.display = "block";
        $("ad-done").style.display = "none";
        return;
      }
      const r = Economy.grantAd(state);
      Store.save(state);
      renderWallet();
      $("ad-status").textContent = r.message;
      $("ad-retry").style.display = "none";
      $("ad-done").style.display = "block";
    }
  }, 1000);
}

function renderSign() {
  const status = Economy.signStatus(state);
  const gotDays = status.claimed ? state.signCycleDay : Math.max(0, status.nextDay - 1);
  $("signin-grid").innerHTML = Economy.SIGN.map((p) => {
    const isToday = (!status.claimed && status.nextDay === p.day) || (status.claimed && p.day === state.signCycleDay);
    return `<div class="day ${p.day <= gotDays ? "got" : ""} ${isToday ? "today" : ""}"><b>第${p.day}天</b>${p.label}</div>`;
  }).join("");
  $("signin-action").disabled = status.claimed;
  $("signin-action").textContent = status.claimed ? "今日已领取" : `领取第 ${status.nextDay} 天`;
}

function playLocalFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|jpg)/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    toast("只支持 jpg / png / webp");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast("图片超过 8MB，换一张小一点的");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const side = Math.min(img.width, img.height);
    if (side < 320) {
      toast("图片太小，换一张更清楚的");
      URL.revokeObjectURL(url);
      return;
    }
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const cvs = document.createElement("canvas");
    cvs.width = 1024;
    cvs.height = 1024;
    cvs.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, 1024, 1024);
    URL.revokeObjectURL(url);
    const go = (src) => {
      startPlay({
        id: "local-" + Date.now(),
        name: (file.name || "本地图").replace(/\.[^.]+$/, "") || "本地图",
        src,
        cat: "local",
        ephemeral: true,
      });
    };
    if (cvs.toBlob) {
      cvs.toBlob((blob) => {
        if (!blob) return go(cvs.toDataURL("image/jpeg", 0.86));
        if (play.localUrl) URL.revokeObjectURL(play.localUrl);
        play.localUrl = URL.createObjectURL(blob);
        go(play.localUrl);
      }, "image/jpeg", 0.86);
    } else {
      go(cvs.toDataURL("image/jpeg", 0.86));
    }
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast("图片读失败，换一张试试");
  };
  img.src = url;
}

function onFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|jpg)/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    toast("只支持 jpg / png / webp");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast("图片超过 5MB，请压缩后再传");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (Math.min(img.width, img.height) < 480) {
      toast("最短边不足 480 像素，换一张更清晰的");
      URL.revokeObjectURL(url);
      return;
    }
    crop.img = img;
    crop.scale = Math.max(340 / img.width, 340 / img.height);
    crop.x = (340 - img.width * crop.scale) / 2;
    crop.y = (340 - img.height * crop.scale) / 2;
    showScreen("crop");
    drawCrop();
  };
  img.onerror = () => toast("图片读失败，换一张试试");
  img.src = url;
}

function drawCrop() {
  const cvs = $("crop-cvs");
  const ctx = cvs.getContext("2d");
  cvs.width = 340;
  cvs.height = 340;
  ctx.fillStyle = "#1c1814";
  ctx.fillRect(0, 0, 340, 340);
  if (!crop.img) return;
  ctx.drawImage(crop.img, crop.x, crop.y, crop.img.width * crop.scale, crop.img.height * crop.scale);
}

function exportCrop() {
  const src = document.createElement("canvas");
  src.width = 1024;
  src.height = 1024;
  const ctx = src.getContext("2d");
  const k = 1024 / 340;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.drawImage(
    crop.img,
    crop.x * k,
    crop.y * k,
    crop.img.width * crop.scale * k,
    crop.img.height * crop.scale * k
  );
  if (play.uploadUrl) URL.revokeObjectURL(play.uploadUrl);
  play.uploadUrl = src.toDataURL("image/jpeg", 0.82);
  const mine = {
    id: "upload-" + Date.now(),
    name: "我的照片",
    src: play.uploadUrl,
    cat: "mine",
  };
  state.uploads = [mine].concat(state.uploads || []).slice(0, 6);
  try {
    Store.save(state);
  } catch {
    toast("本地空间不够，这张只用于这一局");
  }
  startPlay(mine);
}

function bind() {
  document.querySelectorAll(".tabbar button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tabbar button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      showScreen(b.dataset.tab);
    };
  });
  $("btn-back").onclick = () => {
    cancelAutoNext();
    Puzzle.destroy();
    clearInterval(play.timer);
    showScreen("home");
  };
  $("file").onchange = (e) => onFile(e.target.files[0]);
  $("file-local").onchange = (e) => {
    playLocalFile(e.target.files[0]);
    e.target.value = "";
  };
  $("splash-go").onclick = dismissSplash;
  $("home-gallery").onclick = goGallery;
  $("home-me").onclick = goMe;
  $("me-sfx").onclick = toggleSound;
  $("me-music").onclick = toggleMusic;
  $("btn-play-menu").onclick = () => {
    paintPlayMenu();
    openSheet("play");
  };
  $("play-menu-close").onclick = closeSheet;
  $("btn-quit").onclick = () => {
    closeSheet();
    cancelAutoNext();
    Puzzle.destroy();
    clearInterval(play.timer);
    showScreen("home");
  };
  $("btn-hint").onclick = useHint;
  $("btn-undo").onclick = useUndo;
  $("btn-peek").onclick = usePeek;
  $("btn-sound").onclick = toggleSound;
  $("cats-more").onclick = (e) => {
    e.stopPropagation();
    const pop = $("cats-pop");
    pop.hidden = !pop.hidden;
    renderGallery();
  };
  document.addEventListener("click", (e) => {
    const bar = document.querySelector(".cats-bar");
    if (bar && !bar.contains(e.target)) closeCatMore();
  });
  $("btn-restart").onclick = () => {
    if (!play.image) return;
    if (!confirm("这局进度会清空，确定重来？")) return;
    closeSheet();
    startPlay(play.image, play.stage);
  };
  $("me-ad").onclick = startAd;
  $("me-buy").onclick = () => {
    const r = Economy.buyHint(state);
    if (!r.ok) {
      toast(r.message);
      openSheet("need-hint", true);
      return;
    }
    Store.save(state);
    renderMe();
    toast(r.message);
  };
  $("me-sign").onclick = () => {
    renderSign();
    openSheet("sign");
  };
  $("me-rules").onclick = () => openSheet("rules");
  $("signin-action").onclick = () => {
    const r = Economy.claimSign(state);
    if (!r.ok) return toast(r.message);
    Store.save(state);
    renderSign();
    renderMe();
    toast(`第${r.day}天：${r.pack.label}`);
  };
  $("overlay").addEventListener("click", (e) => {
    if (play.autoNext) {
      shatterIntoNext();
      return;
    }
    if (e.target === $("overlay")) {
      clearInterval(startAd._t);
      closeSheet();
    }
  });
  $("result-next").onclick = shatterIntoNext;
  $("result-more").onclick = () => {
    cancelAutoNext();
    closeSheet();
    startPlay(nextImageAfter(play.image));
  };
  $("result-again").onclick = () => {
    cancelAutoNext();
    closeSheet();
    const restart = $("result-again").textContent.includes("第一关") ? STAGES[0] : play.stage;
    startPlay(play.image, restart);
  };
  $("result-home").onclick = () => {
    cancelAutoNext();
    closeSheet();
    Puzzle.destroy();
    goGallery();
  };
  $("need-ad").onclick = () => {
    closeSheet();
    startAd();
  };
  $("ad-done").onclick = () => {
    closeSheet();
    paintPlayMenu();
    renderMe();
  };
  $("ad-retry").onclick = () => startAd();
  $("crop-ok").onclick = exportCrop;
  $("crop-in").onclick = () => { crop.scale *= 1.12; drawCrop(); };
  $("crop-out").onclick = () => { crop.scale *= 0.9; drawCrop(); };
  const cvs = $("crop-cvs");
  cvs.addEventListener("pointerdown", (e) => {
    crop.dragging = true;
    crop.lastX = e.clientX;
    crop.lastY = e.clientY;
    cvs.setPointerCapture(e.pointerId);
  });
  cvs.addEventListener("pointermove", (e) => {
    if (!crop.dragging) return;
    crop.x += e.clientX - crop.lastX;
    crop.y += e.clientY - crop.lastY;
    crop.lastX = e.clientX;
    crop.lastY = e.clientY;
    drawCrop();
  });
  cvs.addEventListener("pointerup", () => { crop.dragging = false; });
  $("reset-data").onclick = () => {
    if (!confirm("清空本地进度？")) return;
    state = Store.reset();
    Sfx.setEnabled(sfxEnabled());
    Sfx.setMusicEnabled(false);
    Sfx.stopMusic();
    renderWallet();
    showScreen("me");
    toast("已重置");
  };
  document.addEventListener("keydown", (e) => {
    if (!$("screen-play").classList.contains("active")) return;
    if (e.key === "h" || e.key === "H") useHint();
    if (e.key === "z" || e.key === "Z") useUndo();
    if (e.key === " ") { e.preventDefault(); usePeek(); }
  });
}

function boot() {
  bind();
  startSplash();
  Sfx.load();
  Sfx.setEnabled(sfxEnabled());
  Sfx.setMusicEnabled(!!state.musicOn);
  document.addEventListener("pointerdown", () => Sfx.unlock());
  renderWallet();
  showScreen("home");
}

boot();
