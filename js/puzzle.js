const Puzzle = (() => {
  const TAB = 0.24;
  let boardEl;
  let trayEl;
  let ghostEl;
  let imageUrl = "";
  let grid = 4;
  let shape = "square";
  let jigsawEdges = null;
  let pieces = [];
  let slotSize = 0;
  let onChange = () => {};
  let onComplete = () => {};
  let onSfx = () => {};
  let onJudge = () => {};
  let history = [];
  let peekTimer = 0;
  let completed = false;
  let drag = null;
  let combo = 0;

  function tabPad() {
    return shape === "jigsaw" ? slotSize * TAB : 0;
  }

  function pieceSize() {
    return slotSize + tabPad() * 2;
  }

  function create(opts) {
    destroy();
    boardEl = opts.board;
    trayEl = opts.tray;
    ghostEl = opts.ghost;
    imageUrl = opts.imageUrl;
    grid = opts.grid;
    shape = opts.shape === "jigsaw" ? "jigsaw" : "square";
    onChange = opts.onChange || (() => {});
    onComplete = opts.onComplete || (() => {});
    onSfx = opts.onSfx || (() => {});
    onJudge = opts.onJudge || (() => {});
    history = [];
    completed = false;
    combo = 0;
    slotSize = boardEl.clientWidth / grid;
    jigsawEdges = shape === "jigsaw" ? buildJigsaw(grid, opts.seed || imageUrl) : null;
    ghostEl.style.backgroundImage = `url("${imageUrl}")`;
    ghostEl.style.display = "block";
    ghostEl.classList.add("reveal");
    boardEl.classList.toggle("jigsaw", shape === "jigsaw");
    boardEl.style.setProperty("--n", grid);
    boardEl.querySelector(".board-grid").style.gridTemplateColumns = `repeat(${grid}, 1fr)`;
    boardEl.querySelector(".board-grid").innerHTML = Array.from({ length: grid * grid }, () => '<i class="slot"></i>').join("");

    const order = shuffle([...Array(grid * grid).keys()]);
    pieces = order.map((id) => {
      const row = Math.floor(id / grid);
      const col = id % grid;
      const el = document.createElement("div");
      el.className = "piece";
      el.dataset.id = String(id);
      applyPieceStyle(el, row, col);
      bindPiece(el);
      return { id, row, col, el, state: "tray" };
    });
    trayEl.innerHTML = '<div class="tray-empty">先看清整张图，马上打散…</div>';
    attachTrayNav();
    syncTrayArrows();
    onChange(progress());
    clearTimeout(create._intro);
    const prelock = shape === "jigsaw" ? Math.max(0, opts.prelock || 0) : 0;
    create._intro = setTimeout(() => {
      ghostEl.classList.remove("reveal");
      lockGivenPieces(prelock);
      renderTray();
      trayEl.classList.add("deal-in");
      onChange(progress());
      onSfx("deal");
    }, 720);
  }

  function lockGivenPieces(n) {
    if (!n) return;
    const picks = [
      pieces.find((p) => p.row === 0 && p.col === 0),
      pieces.find((p) => p.row === grid - 1 && p.col === grid - 1),
      pieces.find((p) => p.row === 0 && p.col === grid - 1),
    ].filter((p) => p && p.state !== "locked");
    picks.slice(0, n).forEach((p) => {
      p.given = true;
      lockPiece(p, true);
      p.el.classList.add("given");
    });
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildJigsaw(n, seed) {
    const rand = mulberry32(hash32(String(seed) + ":" + n));
    const right = [];
    const bottom = [];
    for (let r = 0; r < n; r++) {
      right[r] = [];
      bottom[r] = [];
      for (let c = 0; c < n; c++) {
        right[r][c] = c < n - 1 ? (rand() < 0.5 ? 1 : -1) : 0;
        bottom[r][c] = r < n - 1 ? (rand() < 0.5 ? 1 : -1) : 0;
      }
    }
    return { right, bottom };
  }

  function sidesOf(row, col) {
    return {
      t: row === 0 ? 0 : -jigsawEdges.bottom[row - 1][col],
      r: jigsawEdges.right[row][col],
      b: jigsawEdges.bottom[row][col],
      l: col === 0 ? 0 : -jigsawEdges.right[row][col - 1],
    };
  }

  function pt(x, y) {
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  function edgeSeg(x0, y0, x1, y1, sign, tab) {
    if (!sign) return `L ${pt(x1, y1)}`;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (dy / len) * sign * tab;
    const oy = (-dx / len) * sign * tab;
    const p = (t, k = 0) => [x0 + dx * t + ox * k, y0 + dy * t + oy * k];
    const a = p(0.32);
    const b = p(0.4, 0.12);
    const c = p(0.34, 0.88);
    const m = p(0.5, 1.02);
    const d = p(0.66, 0.88);
    const e = p(0.6, 0.12);
    const f = p(0.68);
    return `L ${pt(a[0], a[1])} C ${pt(b[0], b[1])}, ${pt(c[0], c[1])}, ${pt(m[0], m[1])} C ${pt(d[0], d[1])}, ${pt(e[0], e[1])}, ${pt(f[0], f[1])} L ${pt(x1, y1)}`;
  }

  function jigsawPath(sides, pad, core) {
    const x0 = pad;
    const y0 = pad;
    const x1 = pad + core;
    const y1 = pad + core;
    const tab = pad * 0.94;
    return `M ${pt(x0, y0)} ${edgeSeg(x0, y0, x1, y0, sides.t, tab)} ${edgeSeg(x1, y0, x1, y1, sides.r, tab)} ${edgeSeg(x1, y1, x0, y1, sides.b, tab)} ${edgeSeg(x0, y1, x0, y0, sides.l, tab)} Z`;
  }

  function applyPieceStyle(el, row, col) {
    const size = pieceSize();
    const pad = tabPad();
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.backgroundImage = `url("${imageUrl}")`;
    el.style.clipPath = "";
    el.style.webkitClipPath = "";
    el.classList.toggle("jigsaw", shape === "jigsaw");
    if (shape === "jigsaw") {
      el.style.backgroundSize = `${grid * slotSize}px ${grid * slotSize}px`;
      el.style.backgroundPosition = `${pad - col * slotSize}px ${pad - row * slotSize}px`;
      const d = jigsawPath(sidesOf(row, col), pad, slotSize);
      el.style.clipPath = `path('${d}')`;
      el.style.webkitClipPath = `path('${d}')`;
    } else {
      el.style.backgroundSize = `${grid * 100}% ${grid * 100}%`;
      const x = grid === 1 ? 0 : (col / (grid - 1)) * 100;
      const y = grid === 1 ? 0 : (row / (grid - 1)) * 100;
      el.style.backgroundPosition = `${x}% ${y}%`;
    }
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (arr.every((v, i) => v === i) && arr.length > 1) return shuffle(arr);
    return arr;
  }

  function renderTray() {
    trayEl.innerHTML = "";
    const waiting = pieces.filter((p) => p.state === "tray");
    if (!waiting.length) {
      const wrong = pieces.filter((p) => p.state === "seated").length;
      trayEl.innerHTML = wrong
        ? `<div class="tray-empty">还没拼完，有 ${wrong} 块放错了</div>`
        : '<div class="tray-empty">都放对了</div>';
      requestAnimationFrame(() => requestAnimationFrame(syncTrayArrows));
      return;
    }
    const dealing = trayEl.classList.contains("deal-in");
    waiting.forEach((p, i) => {
      p.el.style.position = "relative";
      p.el.style.left = "auto";
      p.el.style.top = "auto";
      p.el.style.transform = "none";
      p.el.style.willChange = "auto";
      p.el.style.animationDelay = dealing ? `${Math.min(i, 24) * 0.04}s` : "";
      trayEl.appendChild(p.el);
    });
    if (dealing) {
      clearTimeout(renderTray._deal);
      renderTray._deal = setTimeout(() => trayEl.classList.remove("deal-in"), 380 + Math.min(waiting.length, 24) * 40);
    }
    requestAnimationFrame(() => requestAnimationFrame(syncTrayArrows));
  }

  function trayViewport() {
    return document.getElementById("tray-viewport") || trayEl;
  }

  function attachTrayNav() {
    const prev = document.getElementById("tray-prev");
    const next = document.getElementById("tray-next");
    const vp = trayViewport();
    if (!prev || !next || !vp) return;
    const step = () => Math.max(140, Math.floor(vp.clientWidth * 0.72));
    prev.onclick = () => {
      vp.scrollLeft -= step();
      syncTrayArrows();
    };
    next.onclick = () => {
      vp.scrollLeft += step();
      syncTrayArrows();
    };
    vp.onscroll = syncTrayArrows;
    if (typeof ResizeObserver !== "undefined") {
      if (attachTrayNav._ro) attachTrayNav._ro.disconnect();
      attachTrayNav._ro = new ResizeObserver(syncTrayArrows);
      attachTrayNav._ro.observe(vp);
      if (trayEl) attachTrayNav._ro.observe(trayEl);
    }
    requestAnimationFrame(() => requestAnimationFrame(syncTrayArrows));
  }

  function syncTrayArrows() {
    const prev = document.getElementById("tray-prev");
    const next = document.getElementById("tray-next");
    const vp = trayViewport();
    if (!prev || !next || !vp) return;
    const max = vp.scrollWidth - vp.clientWidth;
    const overflow = max > 8;
    prev.classList.toggle("is-off", !overflow || vp.scrollLeft <= 4);
    next.classList.toggle("is-off", !overflow || vp.scrollLeft >= max - 4);
  }

  function bindPiece(el) {
    el.addEventListener("pointerdown", onDown);
  }

  function onDown(e) {
    const piece = pieces.find((p) => p.el === e.currentTarget);
    if (!piece || completed) return;
    if (piece.state === "seated" || piece.state === "locked") {
      e.preventDefault();
      piece.el.classList.remove("nudge");
      void piece.el.offsetWidth;
      piece.el.classList.add("nudge");
      onSfx("back");
      onJudge(piece.state === "locked" ? "fixed" : "frozen", progress());
      return;
    }
    if (piece.state !== "tray") return;
    e.preventDefault();
    const rect = piece.el.getBoundingClientRect();
    drag = {
      piece,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      from: piece.state,
      fromRow: piece.slotRow,
      fromCol: piece.slotCol,
    };
    piece.state = "dragging";
    onSfx("pick");
    clearMagnet();
    piece.el.classList.remove("reject");
    piece.el.classList.add("dragging");
    document.body.appendChild(piece.el);
    piece.el.style.position = "fixed";
    piece.el.style.left = "0px";
    piece.el.style.top = "0px";
    piece.el.style.width = pieceSize() + "px";
    piece.el.style.height = pieceSize() + "px";
    piece.el.style.willChange = "transform";
    if (grid >= 8) piece.el.style.filter = "none";
    moveFloating(e.clientX, e.clientY);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  function dragTransform(x, y) {
    drag.piece.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.04)`;
  }

  function moveFloating(cx, cy) {
    dragTransform(cx - drag.dx, cy - drag.dy);
  }

  function pieceCenter(e) {
    const pad = tabPad();
    return {
      x: e.clientX - drag.dx + pad + slotSize / 2,
      y: e.clientY - drag.dy + pad + slotSize / 2,
    };
  }

  function onMove(e) {
    if (!drag) return;
    const piece = drag.piece;
    const c = pieceCenter(e);
    const target = targetSlot(c.x, c.y);
    const ok = target && target.row === piece.row && target.col === piece.col;
    paintMagnet(ok ? target : null);
    if (ok) {
      const br = boardEl.getBoundingClientRect();
      const pad = tabPad();
      const destX = br.left + target.col * slotSize - pad;
      const destY = br.top + target.row * slotSize - pad;
      const pull = 0.38;
      dragTransform(
        (1 - pull) * (e.clientX - drag.dx) + pull * destX,
        (1 - pull) * (e.clientY - drag.dy) + pull * destY
      );
    } else {
      moveFloating(e.clientX, e.clientY);
    }
  }

  function onUp(e) {
    if (!drag) return;
    const piece = drag.piece;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    piece.el.classList.remove("dragging");
    piece.el.style.willChange = "auto";
    piece.el.style.filter = "";
    const floating = piece.el.getBoundingClientRect();
    const c = pieceCenter(e);
    const target = targetSlot(c.x, c.y);
    const ok = target && target.row === piece.row && target.col === piece.col;
    clearMagnet();

    const from = { from: drag.from, fromRow: drag.fromRow, fromCol: drag.fromCol };
    drag = null;
    if (ok) {
      lockPiece(piece, false, floating);
      pushMove({
        id: piece.id,
        ...from,
        to: "lock",
        toRow: piece.row,
        toCol: piece.col,
      });
      onJudge("right", progress());
      syncTrayArrows();
    } else {
      piece.state = "tray";
      piece.slotRow = undefined;
      piece.slotCol = undefined;
      piece.el.classList.remove("locked", "seated", "just-wrong");
      onSfx("back");
      if (overBoard(c.x, c.y)) onJudge("wrong", progress());
      renderTray();
      piece.el.classList.remove("reject");
      void piece.el.offsetWidth;
      piece.el.classList.add("reject");
    }
    onChange(progress());
    checkComplete();
  }

  function occupiedKeys(except) {
    const set = new Set();
    pieces.forEach((p) => {
      if (p === except) return;
      if (p.state === "locked") set.add(p.row + "," + p.col);
      if (p.state === "seated") set.add(p.slotRow + "," + p.slotCol);
    });
    return set;
  }

  function overBoard(cx, cy, pad = 28) {
    const r = boardEl.getBoundingClientRect();
    return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
  }

  function targetSlot(cx, cy) {
    if (!overBoard(cx, cy)) return null;
    const rect = boardEl.getBoundingClientRect();
    const px = cx - rect.left;
    const py = cy - rect.top;
    const occ = occupiedKeys(drag && drag.piece);
    let best = null;
    let bestD = Infinity;
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        if (occ.has(row + "," + col)) continue;
        const dx = px - (col + 0.5) * slotSize;
        const dy = py - (row + 0.5) * slotSize;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { row, col };
        }
      }
    }
    const snap = slotSize * 0.42;
    if (!best || bestD > snap * snap) return null;
    return best;
  }

  function paintMagnet(target) {
    const slots = boardEl.querySelectorAll(".slot");
    slots.forEach((el, i) => {
      const row = Math.floor(i / grid);
      const col = i % grid;
      el.classList.toggle("magnet", !!(target && target.row === row && target.col === col));
    });
  }

  function clearMagnet() {
    boardEl.querySelectorAll(".slot.magnet").forEach((el) => el.classList.remove("magnet"));
  }

  function pushMove(move) {
    if (move.from === move.to && move.fromRow === move.toRow && move.fromCol === move.toCol) return;
    history.push(move);
  }

  function lockPiece(piece, quiet, fromScreen) {
    piece.state = "locked";
    piece.slotRow = piece.row;
    piece.slotCol = piece.col;
    piece.el.classList.add("locked");
    piece.el.classList.remove("seated", "just-wrong", "dragging");
    const pad = tabPad();
    const destL = piece.col * slotSize - pad;
    const destT = piece.row * slotSize - pad;
    boardEl.appendChild(piece.el);
    piece.el.style.position = "absolute";
    piece.el.style.width = pieceSize() + "px";
    piece.el.style.height = pieceSize() + "px";
    if (fromScreen && boardEl.getBoundingClientRect) {
      const br = boardEl.getBoundingClientRect();
      piece.el.style.left = fromScreen.left - br.left + "px";
      piece.el.style.top = fromScreen.top - br.top + "px";
      piece.el.style.transform = "none";
      piece.el.classList.add("settling");
      requestAnimationFrame(() => {
        piece.el.style.left = destL + "px";
        piece.el.style.top = destT + "px";
      });
      clearTimeout(piece._settle);
      piece._settle = setTimeout(() => piece.el.classList.remove("settling"), 140);
    } else {
      piece.el.style.left = destL + "px";
      piece.el.style.top = destT + "px";
      piece.el.style.transform = "none";
    }
    if (!fromScreen) {
      piece.el.classList.remove("just-in");
      void piece.el.offsetWidth;
      piece.el.classList.add("just-in");
    }
    if (!quiet) {
      combo += 1;
      onSfx(combo >= 3 ? "combo" : "lock");
      sparkAt(piece);
    }
  }

  function sparkAt(piece) {
    if (!boardEl) return;
    if (grid >= 10) return;
    const have = boardEl.querySelectorAll(".spark").length;
    const n = Math.max(0, Math.min(6, 8 - have));
    const cx = piece.col * slotSize + slotSize / 2;
    const cy = piece.row * slotSize + slotSize / 2;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.className = "spark";
      const a = (Math.PI * 2 * i) / Math.max(n, 1) + Math.random() * 0.5;
      const d = 10 + Math.random() * 16;
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      s.style.setProperty("--sx", Math.cos(a) * d + "px");
      s.style.setProperty("--sy", Math.sin(a) * d + "px");
      boardEl.appendChild(s);
      setTimeout(() => s.remove(), 420);
    }
    if (combo >= 3) {
      boardEl.classList.remove("combo-hit");
      void boardEl.offsetWidth;
      boardEl.classList.add("combo-hit");
    }
  }

  function seatPiece(piece, row, col, quiet) {
    piece.state = "seated";
    piece.slotRow = row;
    piece.slotCol = col;
    piece.el.classList.remove("locked");
    piece.el.classList.add("seated");
    placeOnBoard(piece, row, col);
    piece.el.classList.remove("just-wrong");
    void piece.el.offsetWidth;
    piece.el.classList.add("just-wrong");
    if (!quiet) {
      combo = 0;
      onSfx("seat");
    }
  }

  function placeOnBoard(piece, row, col) {
    boardEl.appendChild(piece.el);
    piece.el.style.position = "absolute";
    const pad = tabPad();
    piece.el.style.left = col * slotSize - pad + "px";
    piece.el.style.top = row * slotSize - pad + "px";
    piece.el.style.transform = "none";
  }

  function progress() {
    const locked = pieces.filter((p) => p.state === "locked").length;
    const seated = pieces.filter((p) => p.state === "seated").length;
    const tray = pieces.filter((p) => p.state === "tray" || p.state === "dragging").length;
    return { locked, seated, tray, total: pieces.length, remain: pieces.length - locked };
  }

  function checkComplete() {
    if (completed) return;
    if (pieces.every((p) => p.state === "locked")) {
      completed = true;
      onSfx("win");
      onComplete();
    }
  }

  function hint() {
    const candidates = pieces.filter((p) => p.state !== "locked");
    if (!candidates.length) return false;
    const piece = candidates[Math.floor(Math.random() * candidates.length)];
    pushMove({
      id: piece.id,
      from: piece.state,
      fromRow: piece.slotRow,
      fromCol: piece.slotCol,
      to: "lock",
      toRow: piece.row,
      toCol: piece.col,
    });
    lockPiece(piece, true);
    piece.el.classList.remove("from-hint");
    void piece.el.offsetWidth;
    piece.el.classList.add("from-hint");
    onSfx("hint");
    renderTray();
    onChange(progress());
    checkComplete();
    return true;
  }

  function undo() {
    const last = history.pop();
    if (!last) return false;
    const piece = pieces.find((p) => p.id === last.id);
    if (!piece) return false;
    piece.el.classList.remove("locked", "seated", "just-in", "just-wrong");
    if (last.from === "seated" && last.fromRow != null) seatPiece(piece, last.fromRow, last.fromCol, true);
    else if (last.from === "locked") lockPiece(piece, true);
    else {
      piece.state = "tray";
      piece.slotRow = undefined;
      piece.slotCol = undefined;
      renderTray();
    }
    onSfx("undo");
    onChange(progress());
    return true;
  }

  function peek(ms = 1400) {
    ghostEl.classList.add("peeking");
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => ghostEl.classList.remove("peeking"), ms);
  }

  function destroy() {
    if (drag) {
      drag.piece.el.classList.remove("dragging");
      drag = null;
    }
    pieces.forEach((p) => p.el.remove());
    pieces = [];
    jigsawEdges = null;
    shape = "square";
    clearTimeout(peekTimer);
    clearTimeout(create._intro);
    if (boardEl) {
      boardEl.querySelectorAll(".spark").forEach((s) => s.remove());
      boardEl.classList.remove("jigsaw", "combo-hit");
    }
    if (ghostEl) {
      ghostEl.classList.remove("reveal", "peeking");
      ghostEl.style.backgroundImage = "";
    }
  }

  return { create, hint, undo, peek, destroy, progress };
})();
