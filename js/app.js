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
};
let crop = { img: null, scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 };

const STAGES = [
  { i: 0, grid: 4, shape: "square", pieces: 16, name: "第一关", undos: 5, nextLine: "换成咬合的，还是 16 块" },
  { i: 1, grid: 4, shape: "jigsaw", pieces: 16, name: "第二关", undos: 6, nextLine: "再难一点，拼 36 块" },
  { i: 2, grid: 6, shape: "square", pieces: 36, name: "第三关", undos: 6, nextLine: "换成咬合的，36 块" },
  { i: 3, grid: 6, shape: "jigsaw", pieces: 36, name: "第四关", undos: 8, nextLine: "再碎一回，拼 64 块" },
  { i: 4, grid: 8, shape: "square", pieces: 64, name: "第五关", undos: 8, nextLine: "最后一关，咬合 100 块" },
  { i: 5, grid: 10, shape: "jigsaw", pieces: 100, name: "第六关", undos: 12, nextLine: null },
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

function paintSplash() {
  const box = $("splash-collage");
  if (!box) return;
  const people = IMAGES.filter((x) => x.cat === "beauty" || x.cat === "handsome");
  const near = [
    { top: "-8%", left: "-18%", w: 128, rot: -18, d: 0 },
    { top: "4%", left: "22%", w: 96, rot: 12, d: 0.4 },
    { top: "-6%", left: "58%", w: 118, rot: -8, d: 0.8 },
    { top: "8%", left: "86%", w: 108, rot: 16, d: 0.2 },
    { top: "28%", left: "-12%", w: 102, rot: 10, d: 1.1 },
    { top: "36%", left: "62%", w: 124, rot: 8, d: 1.4 },
    { top: "48%", left: "88%", w: 92, rot: -12, d: 0.3 },
    { top: "62%", left: "-16%", w: 116, rot: 14, d: 0.9 },
    { top: "68%", left: "18%", w: 90, rot: -10, d: 1.2 },
    { top: "70%", left: "72%", w: 110, rot: 11, d: 0.5 },
    { top: "78%", left: "86%", w: 130, rot: -16, d: 0.7 },
    { top: "38%", left: "-4%", w: 88, rot: -14, d: 0.6 },
  ];
  const guys = [
    { top: "20%", left: "16%", w: 108, rot: -11, d: 0.35, src: "assets/handsome-street.png" },
    { top: "29%", left: "40%", w: 100, rot: 13, d: 0.85, src: "assets/handsome-cafe.png" },
    { top: "51%", left: "26%", w: 106, rot: -8, d: 0.55, src: "assets/handsome-rooftop.png" },
  ];
  const nearHtml = near.map((p, i) => {
    const img = people[i % people.length];
    return `<img class="near" src="${img.src}" alt="" style="top:${p.top};left:${p.left};width:${p.w}px;height:${p.w}px;transform:rotate(${p.rot}deg);animation-delay:${p.d}s">`;
  }).join("");
  const guyHtml = guys.map((p) =>
    `<img class="near" src="${p.src}" alt="" style="top:${p.top};left:${p.left};width:${p.w}px;height:${p.w}px;transform:rotate(${p.rot}deg);animation-delay:${p.d}s">`
  ).join("");
  box.innerHTML = nearHtml + guyHtml;
}

function dismissSplash() {
  const el = $("splash");
  if (!el || el.hidden) return;
  clearTimeout(startSplash._t);
  el.classList.add("out");
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove("out");
  }, 380);
}

function startSplash() {
  paintSplash();
  const fill = $("splash-adfill");
  if (fill) {
    fill.style.width = "0%";
    fill.style.transition = "none";
    requestAnimationFrame(() => {
      fill.style.transition = "width 3000ms linear";
      fill.style.width = "100%";
    });
  }
  clearTimeout(startSplash._t);
  startSplash._t = setTimeout(dismissSplash, 3000);
}

function paintTopbarCollage() {
  const box = $("topbar-collage");
  if (!box || box.dataset.ready) return;
  const pool = IMAGES.filter((x) => x.cat === "beauty" || x.cat === "handsome");
  const layout = [
    { top: "-22%", left: "-10%", w: 74, rot: -18 },
    { top: "-16%", left: "18%", w: 58, rot: 14 },
    { top: "-26%", left: "42%", w: 70, rot: -8 },
    { top: "-12%", left: "66%", w: 62, rot: 16 },
    { top: "-20%", left: "88%", w: 56, rot: -14 },
    { top: "36%", left: "-14%", w: 68, rot: 12 },
    { top: "44%", left: "16%", w: 52, rot: -16 },
    { top: "32%", left: "40%", w: 64, rot: 9 },
    { top: "42%", left: "64%", w: 58, rot: -11 },
    { top: "28%", left: "86%", w: 72, rot: 18 },
  ];
  box.innerHTML = layout.map((p, i) => {
    const img = pool[i % pool.length];
    return `<img src="${img.src}" alt="" style="top:${p.top};left:${p.left};width:${p.w}px;height:${p.w}px;transform:rotate(${p.rot}deg)">`;
  }).join("");
  box.dataset.ready = "1";
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
  toast._t = setTimeout(() => el.classList.remove("show", "warn"), kind === "warn" ? 2000 : 1800);
}

function toastOnce(key, msg, kind) {
  const now = Date.now();
  if (toastOnce.key === key && now - (toastOnce.at || 0) < 1400) return;
  toastOnce.key = key;
  toastOnce.at = now;
  toast(msg, kind);
}

function paintPlayStatus(stage, p) {
  $("play-progress").textContent = `${stage.name} · 对了 ${p.locked}/${p.total}`;
  $("play-bar-fill").style.width = `${(p.locked / p.total) * 100}%`;
  const el = $("play-judge");
  if (!el) return;
  if (p.seated && p.tray === 0) {
    el.hidden = false;
    el.classList.add("show");
    el.textContent = `还没拼完，有 ${p.seated} 块放错了`;
  } else if (p.seated) {
    el.hidden = false;
    el.classList.add("show");
    el.textContent = `${p.seated} 块放错了，点撤销`;
  } else {
    el.hidden = true;
    el.classList.remove("show");
    el.textContent = "";
  }
}

function renderWallet() {
  document.querySelectorAll("[data-coins]").forEach((n) => { n.textContent = state.coins; });
  document.querySelectorAll("[data-hints]").forEach((n) => { n.textContent = state.hints; });
}

function showScreen(name) {
  closeCatMore();
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
  const playMode = name === "play" || name === "crop";
  $("tabbar").style.display = playMode ? "none" : "flex";
  $("wallet").style.display = playMode ? "none" : "flex";
  $("btn-back").style.visibility = playMode ? "visible" : "hidden";
  document.querySelector(".topbar").classList.toggle("plain", playMode);
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
  const peek = $("peek-row");
  if (!peek) return;
  peek.innerHTML = "";
  const peeks = IMAGES.filter((x) => !x.exclusive && x.id !== img.id);
  const order = ["beauty", "handsome", "anime", "landmark", "car", "scenery", "star", "pet"];
  peeks.sort((a, b) => {
    const ia = order.indexOf(a.cat);
    const ib = order.indexOf(b.cat);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const seen = new Set();
  const mixed = [];
  peeks.forEach((item) => {
    if (seen.has(item.cat) || mixed.length >= 4) return;
    seen.add(item.cat);
    mixed.push(item);
  });
  mixed.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "peek";
    btn.innerHTML = `<img src="${item.src}" alt="${item.name}"><span>${item.name}</span>`;
    btn.onclick = () => startPlay(item);
    peek.appendChild(btn);
  });
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
  const box = $("gallery-grid");
  box.innerHTML = "";
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
  const adLeft = Economy.DAILY_AD_CAP - state.daily.adsWatched;
  const buyLeft = Economy.DAILY_COIN_HINT_CAP - state.daily.coinHintsBought;
  $("me-ad-sub").textContent = `看完即得 1 次提示，今日还剩 ${adLeft} 次`;
  $("me-buy-sub").textContent = `${Economy.HINT_COST} 金币 / 次，今日还剩 ${buyLeft} 次`;
  $("me-sign-sub").textContent = Economy.signStatus(state).claimed ? "今天已签到" : "今日未签到";
  $("me-cap").textContent = `今日拼图金币 ${state.daily.puzzleCoins}/${Economy.DAILY_PUZZLE_COIN_CAP}`;
  $("badge-list").textContent = state.badges.length ? state.badges.join(" · ") : "还没有徽章，先去签到";
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

function paintSoundBtn() {
  const btn = $("btn-sound");
  if (!btn) return;
  btn.textContent = "♪";
  btn.classList.toggle("off", !state.soundOn);
  btn.setAttribute("aria-label", state.soundOn ? "关闭音效" : "打开音效");
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  Sfx.setEnabled(state.soundOn);
  Store.save(state);
  paintSoundBtn();
  if (state.soundOn) {
    Sfx.unlock();
    Sfx.play("peek");
  }
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
  $("nav-title").textContent = stage.name;
  paintSoundBtn();
  $("play-hints").textContent = `提示 ${state.hints}`;
  $("btn-peek").textContent = `看清楚 ${play.peeks}`;
  $("btn-undo").textContent = `撤销 ${play.undos}`;
  $("play-progress").textContent = `${stage.name} · 对了 0/${stage.pieces}`;
  $("play-bar-fill").style.width = "0%";
  $("play-judge").hidden = true;
  $("play-judge").classList.remove("show");
  $("play-judge").textContent = "";
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
      onSfx: (name) => Sfx.play(name),
      onChange: (p) => paintPlayStatus(stage, p),
      onJudge: (kind, p) => {
        if (kind === "wrong") toast("放错了，点撤销", "warn");
        if (kind === "board-full") toast(`还没拼完，有 ${p.seated} 块放错了`, "warn");
        if (kind === "frozen") toastOnce("frozen", "放下就不能再挪，点撤销", "warn");
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
  if (!state.collection.some((c) => c.id === play.image.id && c.src === play.image.src)) {
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
  $("result-reward").innerHTML = `获得 <em>${reward.gain}</em> 金币<br>${lines.join("<br>")}`;
  const nextImg = nextImageAfter(play.image);
  $("result-more").textContent = `拼下一张 · ${nextImg.name}`;
  $("result-more").className = "btn btn-ghost";
  $("result-more").style.marginTop = "8px";
  $("result-home").textContent = "去图库";
  $("result-next").style.display = "none";
  $("result-auto").hidden = true;
  $("sheet-result").classList.remove("auto-next");
  if (next) {
    play.autoNext = true;
    $("result-title").textContent = "拼好了";
    $("result-desc").textContent = stage.nextLine;
    $("result-again").textContent = "再拼本关";
    $("result-auto").hidden = false;
    $("result-auto").textContent = "马上打散…";
    $("sheet-result").classList.add("auto-next");
    openSheet("result", true);
    clearTimeout(finishPlay._t);
    finishPlay._t = setTimeout(() => shatterIntoNext(), 1600);
  } else {
    play.autoNext = false;
    $("result-title").textContent = "这张图通关了";
    $("result-desc").textContent = `${play.image.name} · 六关 · ${$("play-time").textContent}`;
    $("result-more").className = "btn btn-primary";
    $("result-more").style.marginTop = "0";
    $("result-again").textContent = "从第一关再来";
    openSheet("result");
  }
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
  Sfx.play("hint");
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
  $("play-hints").textContent = `提示 ${state.hints}`;
}

function useUndo() {
  if (play.undos <= 0) return toast("这局撤销用完了");
  if (!Puzzle.undo()) return toast("没有可撤销的步骤");
  play.undos -= 1;
  $("btn-undo").textContent = `撤销 ${play.undos}`;
}

function usePeek() {
  if (play.peeks <= 0) return toast("这局免费看图用完了，请用提示");
  play.peeks -= 1;
  Sfx.play("peek");
  Puzzle.peek(1400);
  $("btn-peek").textContent = `看清楚 ${play.peeks}`;
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
  $("clock").textContent = new Date().toTimeString().slice(0, 5);
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
  $("home-gallery").onclick = goGallery;
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
    startPlay(play.image, play.stage);
  };
  $("play-hints").parentElement;
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
    $("play-hints").textContent = `提示 ${state.hints}`;
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
  paintTopbarCollage();
  Sfx.setEnabled(state.soundOn);
  document.addEventListener("pointerdown", () => Sfx.unlock(), { once: true });
  renderWallet();
  showScreen("home");
  $("play-hints").textContent = `提示 ${state.hints}`;
}

boot();
