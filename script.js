let boards = [];
let validWords = [];
let remainingWords = [];
let hiddenLockId = null;
let currentPath = [];
let selectedLetters = [];
let completedBoards = [];
let currentBoard = null;

// Progress
let lives = 3;
let scrolls = 0;

// guards
let resolvingLoss = false;
let isSelecting = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadBoards();
  setupBoard(false);
  setupDragAndDrop();

  const pop = document.getElementById('popup');
  pop?.addEventListener('click', (e) => {
    if (e.target.id === 'popup' && pop.dataset.dismiss !== 'locked') hidePopup();
  });

  window.addEventListener('resize', sizeLocksRow);
  updateProgressUI();

  ['mouseup','pointerup','touchend'].forEach(ev =>
    document.addEventListener(ev, endSelect)
  );

  // Init wheel + path fallbacks
  initPrizeWheel();
  installImageFallbacks();
});

/* ---------- Sprite path fallback helpers ---------- */
function installImageFallbacks(){
  const tryResolve = (img) => {
    const src = img.getAttribute('src') || '';
    if (!src) return;
    const file = src.split('/').pop();
    if (!file) return;

    if (src.includes('sprites/')) {
      img.onerror = null;
      img.src = file;
    } else {
      img.onerror = null;
      img.src = 'sprites/' + file;
    }
  };

  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => tryResolve(img));
    if (img.complete && img.naturalWidth === 0) tryResolve(img);
  });
}

function createSpriteImg(file, alt = ''){
  const img = new Image();
  img.alt = alt;
  img.src = 'sprites/' + file;
  img.onerror = () => { img.onerror = null; img.src = file; };
  return img;
}

async function loadBoards() {
  const res = await fetch("boards.json");
  boards = await res.json();
}

/* ========== BOARD + LOCKS ========== */
function setupBoard(restartSame=false) {
  resolvingLoss = false;

  if (!restartSame) {
    document.querySelectorAll('#keys .key').forEach(k => {
      k.dataset.carried = "true";
      k.classList.add('carried');
    });
  }

  if (!(restartSame && currentBoard)) {
    let pool = boards.filter((_, i) => !completedBoards.includes(i));
    if (pool.length === 0) { completedBoards = []; pool = boards.slice(); }
    currentBoard = pool[Math.floor(Math.random() * pool.length)];
    const actualIndex = boards.indexOf(currentBoard);
    completedBoards.push(actualIndex);
  }

  document.getElementById("theme").textContent = currentBoard.theme;

  remainingWords = currentBoard.words.map(w => w.toUpperCase());
  validWords = remainingWords.slice();

  const gridEl = document.getElementById("letter-grid");
  gridEl.innerHTML = "";
  const cols = currentBoard.cols || Math.sqrt(currentBoard.grid.length) || 5;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 74px)`;

  for (let i = 0; i < currentBoard.grid.length; i++) {
    const div = document.createElement("div");
    div.className = "letter";
    div.textContent = currentBoard.grid[i];
    div.dataset.index = i;
    div.dataset.active = "true";
    div.addEventListener("mousedown", startSelect);
    div.addEventListener("pointerdown", startSelect);
    div.addEventListener("mouseenter", continueSelect);
    div.addEventListener("pointerenter", continueSelect);
    gridEl.appendChild(div);
  }

  buildDynamicLocks(currentBoard.words);

  // place the vault badge on a random active tile
  placeVaultIcon();
}

function buildDynamicLocks(words) {
  const wrap = document.getElementById('locks');
  wrap.innerHTML = "";

  let wood = 0, stone = 0, gold = 0;
  for (const w of words) {
    const L = w.trim().length;
    if (!L) continue;
    if (L === 3) wood++; else if (L === 4) stone++; else gold++;
  }

  const lockTypes = [
    ...Array(wood).fill('wood'),
    ...Array(stone).fill('stone'),
    ...Array(gold).fill('gold'),
  ];

  shuffle(lockTypes);
  hiddenLockId = Math.floor(Math.random() * lockTypes.length);

  lockTypes.forEach((type, i) => {
    const lock = document.createElement('div');
    lock.className = 'lock';
    lock.dataset.type = type;
    lock.dataset.id = String(i);

    const img = createSpriteImg(`lock_${type}.png`, `${type} lock`);
    lock.appendChild(img);

    lock.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    lock.addEventListener("drop", e => onLockDrop(e, lock));
    wrap.appendChild(lock);
  });

  sizeLocksRow();
}

function sizeLocksRow() {
  const wrap = document.getElementById('locks');
  if (!wrap) return;

  const count = wrap.children.length;
  const styles = getComputedStyle(wrap);
  const gap = parseInt(styles.gap || 18, 10) || 18;

  const BASE = 86, MIN = 48;
  const targetWidth = 7 * BASE + (7 - 1) * gap;

  let size = BASE;
  if (count > 7) {
    size = Math.floor((targetWidth - (count - 1) * gap) / count);
    size = Math.max(MIN, Math.min(BASE, size));
  }

  wrap.style.setProperty('--lock-size', `${size}px`);
  document.documentElement.style.setProperty('--lock-size', `${size}px`);
}

/* ========== LOCK INTERACTIONS ========== */
async function onLockDrop(e, lock) {
  e.preventDefault();
  const draggingKey = document.querySelector(".dragging");
  const keyType = draggingKey?.dataset.type;
  const lockType = lock.dataset.type;

  lock.classList.add("jiggle");
  setTimeout(() => lock.classList.remove("jiggle"), 500);

  if (!draggingKey) return;

  if (keyType === 'pick') {
    await handleLockPickDrop(lock, draggingKey);
    maybeCheckLose();
    return;
  }

  if (keyType !== lockType) return;

  if (draggingKey.dataset.carried === "true") {
    const ok = await runDurabilityCheck(keyType);
    if (!ok) { draggingKey.remove(); maybeCheckLose(); return; }
  }

  draggingKey.remove();

  const isScrollHere = Number(lock.dataset.id) === Number(hiddenLockId);
  if (isScrollHere) {
    revealScroll(lock);
  } else {
    lock.classList.add("failed");
    showMessage("Nothing behind this lock...");
    maybeCheckLose();
  }
}

/* Lock pick flow */
async function handleLockPickDrop(lock, keyEl){
  const wantMulti = await confirmChoice(
    "Use the lock pick on multiple locks?",
    "Yes, take the risk",
    "No, just this lock"
  );

  if (!wantMulti) {
    keyEl.remove();
    openLockSimple(lock, /*announce*/true);
    return;
  }

  const ok50 = await runGamble(0.5);
  if (!ok50) {
    keyEl.remove();
    showMessage("Lock picking unsuccessful");
    return;
  }

  const tryThree = await confirmChoice(
    "Key is good for 2 uses. Try for 3 uses?",
    "Yes (25% risk)",
    "No, take 2"
  );

  if (!tryThree) {
    keyEl.remove();
    openLockSimple(lock, /*announce*/true);
    openRandomWrong(1, [Number(lock.dataset.id)]);
    return;
  }

  const ok25 = await runGamble(0.25);
  if (!ok25) {
    keyEl.remove();
    showMessage("Lock picking unsuccessful");
    return;
  }

  keyEl.remove();
  openLockSimple(lock, /*announce*/true);
  openRandomWrong(2, [Number(lock.dataset.id)]);
}

function openLockSimple(lock, announce){
  const isScrollHere = Number(lock.dataset.id) === Number(hiddenLockId);
  if (isScrollHere) {
    revealScroll(lock);
  } else {
    lock.classList.add("failed");
    if (announce) showMessage("Nothing behind this lock...");
    maybeCheckLose();
  }
}

function openRandomWrong(n, excludeIds = []) {
  const wrap = document.getElementById('locks');
  const candidates = Array.from(wrap.querySelectorAll('.lock'))
    .filter(l =>
      !l.classList.contains('failed') &&
      Number(l.dataset.id) !== hiddenLockId &&
      !excludeIds.includes(Number(l.dataset.id))
    );
  shuffle(candidates);
  candidates.slice(0, n).forEach(l => l.classList.add('failed'));
  maybeCheckLose();
}

function revealScroll(lock){
  scrolls += 1;
  updateProgressUI();

  showMessage("You've found the scroll!");
  const scroll = createSpriteImg('scroll.png', 'scroll');
  scroll.style.position = "absolute";
  scroll.style.top = "0";
  scroll.style.left = "0";
  scroll.style.width = "100%";
  lock.appendChild(scroll);
  setTimeout(() => resetGame(), 1500);
}

/* ========== LETTER DRAG-SELECT ========== */
function startSelect(e) {
  if (e.target.dataset.active !== "true") return;
  e.preventDefault();
  recallForgeKeysToInventory();

  isSelecting = true;
  document.body.classList.add('no-select');

  currentPath = [e.target];
  e.target.style.background = "#e8d8b7";
  selectedLetters = [e.target.textContent];
}

function continueSelect(e) {
  if (
    isSelecting &&
    currentPath.length > 0 &&
    !currentPath.includes(e.target) &&
    e.target.dataset.active === "true"
  ) {
    currentPath.push(e.target);
    e.target.style.background = "#e8d8b7";
    selectedLetters.push(e.target.textContent);
  }
}

function endSelect() {
  if (!isSelecting) return;
  isSelecting = false;

  const word = selectedLetters.join("");

  if (selectedLetters.length >= 3 && validWords.includes(word)) {
    const idx = remainingWords.indexOf(word);
    if (idx !== -1) {
      remainingWords.splice(idx, 1);
      giveKey(word.length);
      markUsedTiles(currentPath);
    } else {
      invalidWordFeedback(currentPath);
    }
  } else if (selectedLetters.length >= 3) {
    invalidWordFeedback(currentPath);
  }

  currentPath.forEach(el => el.style.background = "");
  selectedLetters = [];
  currentPath = [];
  document.body.classList.remove('no-select');

  maybeCheckLose();
}

let vaultIndex = -1; // will be set each board

function markUsedTiles(tiles) {
  tiles.forEach(el => {
    el.dataset.active = "false";
    el.classList.add("used");
  });

  if (vaultIndex !== -1 && tiles.some(el => Number(el.dataset.index) === Number(vaultIndex))) {
    const grid = document.getElementById('letter-grid');
    const badge = grid && grid.querySelector('.vault-badge');
    if (badge) badge.remove();
    vaultIndex = -1;
    setTimeout(() => openPrizeWheel(), 300);
  }
}

function invalidWordFeedback(tiles) {
  tiles.forEach(el => {
    el.classList.add("invalid");
    setTimeout(() => el.classList.remove("invalid"), 400);
  });
}

/* ========== KEYS, INVENTORY, SMITHING ========== */
function giveKey(len) {
  const type = len === 3 ? 'wood' : len === 4 ? 'stone' : 'gold';
  spawnKey(type);
}

function spawnKey(type){
  const inv = document.getElementById("inventory");
  const keyGrid = document.getElementById("keys");

  const emptySlot = Array.from(keyGrid.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
  if (!emptySlot) {
    inv.classList.add('full');
    setTimeout(() => inv.classList.remove('full'), 320);
    return;
  }

  const img = createSpriteImg(`key_${type}.png`, `${type} key`);
  img.className = "key";
  img.dataset.type = type;
  img.draggable = true;

  let dragGhost = null;

  img.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", img.dataset.type || "key");
    e.dataTransfer.effectAllowed = "move";

    dragGhost = img.cloneNode(true);
    dragGhost.style.width = "36px";
    dragGhost.style.height = "36px";
    dragGhost.style.maxWidth = "36px";
    dragGhost.style.maxHeight = "36px";
    dragGhost.style.position = "absolute";
    dragGhost.style.top = "-1000px";
    dragGhost.style.left = "-1000px";
    dragGhost.style.pointerEvents = "none";
    dragGhost.style.border = "0";
    document.body.appendChild(dragGhost);

    try { e.dataTransfer.setDragImage(dragGhost, 18, 18); } catch (_) {}

    img.classList.add("dragging");
    document.getElementById('smith')?.classList.add('drag-over');
  });

  img.addEventListener("dragend", () => {
    img.classList.remove("dragging");
    document.getElementById('smith')?.classList.remove('drag-over');
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
  });

  emptySlot.appendChild(img);
}

function resetGame() {
  const grid = document.getElementById("letter-grid");
  grid.style.opacity = 0;
  setTimeout(() => {
    grid.style.opacity = 1;
    setupBoard(false);
  }, 400);
}

function setupDragAndDrop() {
  const trash = document.getElementById("trash");
  const keyArea = document.getElementById("keys");
  const { a:slotA, b:slotB } = getCombinerSlots();
  const smith = document.getElementById('smith');
  const forgeBtn = document.getElementById('forge-btn');

  [slotA, slotB, trash, keyArea, smith].forEach(area => {
    area.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  });

  [slotA, slotB].forEach((slot) => {
    slot.addEventListener('dragenter', () => slot.classList.add('hover'));
    slot.addEventListener('dragleave', () => slot.classList.remove('hover'));
    slot.addEventListener("drop", e => {
      e.preventDefault();
      slot.classList.remove('hover');
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      if (slot.querySelector('.key')) return;

      slot.appendChild(dragging);
      slot.classList.add('has-key');
      updateForgeButton();
      maybeCheckLose();
    });
  });

  trash.addEventListener("drop", e => {
    e.preventDefault();
    document.querySelectorAll(".dragging").forEach(k => k.remove());
    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
    updateForgeButton();
    maybeCheckLose();
  });

  keyArea.addEventListener("drop", e => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging) return;

    const empty = Array.from(keyArea.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
    if (empty) empty.appendChild(dragging); else keyArea.appendChild(dragging);

    [slotA, slotB].forEach(s => s.classList.toggle('has-key', !!s.querySelector('.key')));
    updateForgeButton();
    maybeCheckLose();
  });

  forgeBtn.addEventListener('click', async () => {
    const { a:sa, b:sb } = getCombinerSlots();
    const k1 = sa.querySelector('.key');
    const k2 = sb.querySelector('.key');
    if (!k1 || !k2 || k1.dataset.type !== k2.dataset.type) return;

    const result = nextTier(k1.dataset.type);
    const label = result === 'pick' ? 'Lock Pick' : (result[0].toUpperCase() + result.slice(1) + ' key');
    const ok = await confirmChoice(`Forge these two keys into a ${label}?`, "Forge", "Cancel");
    if (!ok) return;

    doCombine();
  });
}

function recallForgeKeysToInventory(){
  const { a, b } = getCombinerSlots();
  const keyArea = document.getElementById("keys");

  [a,b].forEach(slot => {
    const k = slot.querySelector('.key');
    if (!k) return;
    const empty = Array.from(keyArea.querySelectorAll('.inv-slot')).find(s => !s.querySelector('.key'));
    if (empty) empty.appendChild(k); else keyArea.appendChild(k);
    slot.classList.remove('has-key');
  });

  updateForgeButton();
}

function getCombinerSlots(){
  const root = document.getElementById('smith');
  return { a: root.querySelector('.drop-slot[data-slot="a"]'), b: root.querySelector('.drop-slot[data-slot="b"]') };
}

function updateForgeButton(){
  const forgeBtn = document.getElementById('forge-btn');
  const { a, b } = getCombinerSlots();
  const k1 = a.querySelector('.key');
  const k2 = b.querySelector('.key');
  forgeBtn.disabled = !(k1 && k2 && k1.dataset.type === k2.dataset.type);
}

function nextTier(type){
  if (type === 'wood') return 'stone';
  if (type === 'stone') return 'gold';
  if (type === 'gold') return 'pick';
  return null;
}

function doCombine(){
  const { a:slotA, b:slotB } = getCombinerSlots();
  const k1 = slotA.querySelector('.key');
  const k2 = slotB.querySelector('.key');
  if (!k1 || !k2) { updateForgeButton(); return; }
  if (k1.dataset.type !== k2.dataset.type) {
    const smith = document.getElementById('smith');
    smith.classList.add('shake');
    setTimeout(() => smith.classList.remove('shake'), 320);
    updateForgeButton();
    return;
  }

  const result = nextTier(k1.dataset.type);
  if (!result) { updateForgeButton(); return; }

  k1.remove(); k2.remove();
  slotA.classList.remove('has-key');
  slotB.classList.remove('has-key');

  const smith = document.getElementById('smith');
  smith.classList.add('strike');
  setTimeout(() => smith.classList.remove('strike'), 600);

  if (result === 'pick') {
    spawnKey('pick');
    showMessage(`You've successfully crafted a Lock Pick!`);
  } else {
    spawnKey(result);
    const label = result.charAt(0).toUpperCase() + result.slice(1);
    showMessage(`You've successfully crafted a ${label} key!`);
  }

  updateForgeButton();
  maybeCheckLose();
}

/* ========== DURABILITY & GAMBLE ========== */
function runDurabilityCheck(keyType){
  return new Promise(resolve => {
    if (keyType === 'pick') { resolve(true); return; }
    const survival = keyType === 'wood' ? 0.25 : keyType === 'stone' ? 0.5 : 0.75;
    showGambleBar(survival, resolve);
  });
}
function runGamble(successChance){ return new Promise(resolve => { showGambleBar(successChance, resolve); }); }
function showGambleBar(successChance, resolve){
  const breakOdds = 1 - successChance;
  const dur = document.getElementById('durability-popup');
  const cursor = document.getElementById('dur-cursor');
  const caption = document.getElementById('dur-caption');
  const red = document.querySelector('.dur-red');
  const green = document.querySelector('.dur-green');

  const totalWidth = 320;
  if (red) red.style.width = `${Math.round(breakOdds * totalWidth)}px`;
  if (green) green.style.width = `${Math.round(successChance * totalWidth)}px`;

  if (cursor) cursor.style.left = `0px`;
  if (caption) caption.textContent = "Checking durability…";
  if (dur) dur.classList.remove('hidden');

  let dir = 1, pos = 0;
  const speed = 6;
  const interval = setInterval(() => {
    pos += dir * speed;
    if (pos < 0) { pos = 0; dir = 1; }
    if (pos > totalWidth) { pos = totalWidth; dir = -1; }
    if (cursor) cursor.style.left = `${pos}px`;
  }, 16);

  const succeed = Math.random() < successChance;

  setTimeout(() => {
    clearInterval(interval);
    const min = succeed ? Math.round((1 - successChance) * totalWidth) + 6 : 6;
    const max = succeed ? totalWidth - 6 : Math.round((1 - successChance) * totalWidth) - 6;
    const stop = Math.max(6, Math.min(totalWidth-6, Math.floor(min + Math.random()*(max-min))));
    if (cursor) cursor.style.left = `${stop}px`;

    if (caption) caption.textContent = succeed ? "It holds!" : "It shatters!";
    setTimeout(() => { if (dur) dur.classList.add('hidden'); resolve(succeed); }, 650);
  }, 1200);
}

/* ========== PROGRESSION & FAIL STATE ========== */
function updateProgressUI(){
  const heartEls = Array.from(document.querySelectorAll('#hearts .heart'));
  heartEls.forEach((el, i) => el.classList.toggle('lost', i >= lives));
  document.getElementById('scroll-count').textContent = String(scrolls);
}

function maybeCheckLose(){
  if (resolvingLoss) return;
  if (isAnyRemainingWordPossible()) return;
  if (canOpenHiddenLock()) return;

  resolvingLoss = true;
  lives = Math.max(0, lives - 1);
  updateProgressUI();

  if (lives === 0) {
    showMessage("Game Over", { sticky:true });
    setTimeout(() => {
      document.getElementById('keys').innerHTML = `
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>
        <div class="inv-slot"></div>`;
      lives = 3; scrolls = 0; updateProgressUI(); setupBoard(false); setupDragAndDrop(); resolvingLoss = false;
    }, 1200);
  } else {
    showContinue(
      "Oh no! You've lost a heart.\nNo valid words, or keys remaining.\nThe scroll is now behind a new lock-\ntry and find it before you use all 3 hearts!",
      "Continue"
    ).then(() => { setupBoard(true); resolvingLoss = false; });
  }
}

function isAnyRemainingWordPossible(){
  if (remainingWords.length === 0) return false;
  const counts = {};
  document.querySelectorAll('#letter-grid .letter').forEach(t => {
    if (t.dataset.active === "true") {
      const ch = (t.textContent || "").toUpperCase();
      counts[ch] = (counts[ch] || 0) + 1;
    }
  });
  const canMake = (word) => {
    const need = {};
    for (const ch of word.toUpperCase()) need[ch] = (need[ch] || 0) + 1;
    for (const k in need) if (!counts[k] || counts[k] < need[k]) return false;
    return true;
  };
  return remainingWords.some(canMake);
}

function canOpenHiddenLock(){
  const keys = document.querySelectorAll('#keys .key, #smith .key');
  const counts = { wood:0, stone:0, gold:0, pick:0 };
  keys.forEach(k => { const t = k.dataset.type; if (counts[t] !== undefined) counts[t]++; });

  if (counts.pick > 0) return true;

  const typeNeeded = getHiddenLockType();
  if (!typeNeeded) return false;

  if (typeNeeded === 'wood') return counts.wood > 0 || pickPossible(counts) > 0;
  if (typeNeeded === 'stone'){
    const stonesFromWood = Math.floor(counts.wood / 2);
    return counts.stone > 0 || stonesFromWood > 0 || pickPossible(counts) > 0;
  }
  if (typeNeeded === 'gold'){
    const stonesFromWood = Math.floor(counts.wood / 2);
    const totalStones = counts.stone + stonesFromWood;
    const goldFromStones = Math.floor(totalStones / 2);
    return counts.gold > 0 || goldFromStones > 0 || pickPossible(counts) > 0;
  }
  return false;
}
function pickPossible(counts){
  const stonesFromWood = Math.floor(counts.wood / 2);
  const totalStones = counts.stone + stonesFromWood;
  const goldFromStones = Math.floor(totalStones / 2);
  const totalGold = counts.gold + goldFromStones;
  return Math.floor(totalGold / 2);
}
function getHiddenLockType(){
  const el = document.querySelector(`.lock[data-id="${hiddenLockId}"]`);
  return el?.dataset.type || null;
}

/* ========== POPUPS & UTILS ========== */
function clearPopupTimer(){ if (window._popupTimer){ clearTimeout(window._popupTimer); window._popupTimer = null; } }
function showMessage(msg, opts = {}) {
  const popup = document.getElementById('popup'); if (!popup) return;
  if (popup.dataset.dismiss === 'locked') return;
  const txt = document.getElementById('popup-text');
  const actions = document.getElementById('popup-actions');
  clearPopupTimer(); txt.textContent = msg; actions.innerHTML = ""; popup.dataset.dismiss = ""; popup.classList.remove('hidden');
  const duration = (opts && typeof opts.duration === 'number') ? opts.duration : (opts.sticky ? 2200 : 1600);
  window._popupTimer = setTimeout(() => hidePopup(), duration);
}
function showContinue(message, buttonLabel="Continue"){
  return new Promise(resolve => {
    const popup = document.getElementById('popup');
    const txt = document.getElementById('popup-text');
    const actions = document.getElementById('popup-actions');
    if (!popup || !txt || !actions) { resolve(); return; }
    clearPopupTimer(); txt.textContent = message; actions.innerHTML = "";
    const btn = document.createElement('button'); btn.className = 'btn primary'; btn.textContent = buttonLabel;
    btn.addEventListener('click', () => { popup.classList.add('hidden'); popup.dataset.dismiss = ""; resolve(); });
    actions.appendChild(btn);
    popup.dataset.dismiss = "locked"; popup.classList.remove('hidden');
  });
}
function hidePopup(){ const p = document.getElementById('popup'); if (p?.dataset.dismiss === 'locked') return; clearPopupTimer(); p?.classList.add('hidden'); }
function confirmChoice(message, yesLabel="Yes", noLabel="No"){
  return new Promise(resolve => {
    const popup = document.getElementById('popup');
    const txt = document.getElementById('popup-text');
    const actions = document.getElementById('popup-actions');
    if (!popup || !txt || !actions) { resolve(false); return; }
    clearPopupTimer(); txt.textContent = message; actions.innerHTML = "";
    const yes = document.createElement('button'); yes.className = 'btn primary'; yes.textContent = yesLabel;
    const no  = document.createElement('button'); no.className  = 'btn'; no.textContent = noLabel;
    yes.addEventListener('click', () => { popup.classList.add('hidden'); popup.dataset.dismiss=""; resolve(true); });
    no .addEventListener('click', () => { popup.classList.add('hidden'); popup.dataset.dismiss=""; resolve(false); });
    popup.dataset.dismiss = "locked"; actions.appendChild(yes); actions.appendChild(no); popup.classList.remove('hidden');
  });
}
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ================== VAULT + WHEEL ================== */
function placeVaultIcon(){
  const grid = document.getElementById('letter-grid');
  if (!grid) return;
  grid.querySelectorAll('.vault-badge').forEach(el => el.remove());

  const tiles = Array.from(grid.querySelectorAll('.letter')).filter(el => el.dataset.active === "true");
  if (tiles.length === 0) { vaultIndex = -1; return; }

  const pick = tiles[Math.floor(Math.random()*tiles.length)];
  vaultIndex = Number(pick.dataset.index);

  const img = createSpriteImg('vault.png', 'Vault');
  img.className = 'vault-badge';
  pick.appendChild(img);
}

// ----- Prize Wheel implementation -----
let spinsLeft = 0;              // exact spins available while overlay is open
window._wheelAutoReroll = false; // global flag used across scopes

function initPrizeWheel(){
  const overlay = document.getElementById('wheel-overlay');
  if (!overlay) return;

  const canvas = document.getElementById('wheel-canvas');
  const ctx = canvas.getContext('2d');
  const R = canvas.width/2;
  const C = {x:R, y:R};
  const POINTER_ANGLE = -Math.PI/2;

  const spinBtn = document.getElementById('spinBtn');
  const closeBtn = document.getElementById('wheelCloseBtn');
  const safeDoor = document.getElementById('safeDoor');

  const SPRITES={
    "Gold Key":"key_gold.png",
    "Stone Key":"key_stone.png",
    "Wooden Key":"key_wood.png",
    "Combine 2 Keys":"lock_wood.png",
    "Lose a Key":"lose_key.png",
    "Reveal Hint":"unlock.png",
    "Scroll Peek":"scroll.png",
    "Reroll":"safe.png"
  };

  const PRIZES=[
    {label:"Gold Key",weight:1},
    {label:"Stone Key",weight:5},
    {label:"Combine 2 Keys",weight:3},
    {label:"Reveal Hint",weight:3},
    {label:"Lose a Key",weight:2},
    {label:"Wooden Key",weight:4},
    {label:"Scroll Peek",weight:2},
    {label:"Reroll",weight:3},
    {label:"Lose a Key",weight:2},
    {label:"Stone Key",weight:5},
    {label:"Lose a Key",weight:2}
  ];

  let angle = 0, spinning=false;

  function drawPointer(){
    const tipR=R*0.82, baseR=R*0.92, w=R*0.06, ax=POINTER_ANGLE;
    const nx=Math.cos(ax), ny=Math.sin(ax), tx=-ny, ty=nx;
    const tip={x:C.x+nx*tipR,y:C.y+ny*tipR};
    const bl={x:C.x+nx*baseR+tx*w,y:C.y+ny*baseR+ty*w};
    const br={x:C.x+nx*baseR-tx*w,y:C.y+ny*baseR-ty*w};
    ctx.fillStyle="#bfc6d0";
    ctx.beginPath(); ctx.moveTo(tip.x,tip.y); ctx.lineTo(bl.x,bl.y); ctx.lineTo(br.x,br.y); ctx.closePath();
    ctx.shadowColor="rgba(0,0,0,.4)"; ctx.shadowBlur=6; ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle="#7e8794"; const capR=w*0.9, capC={x:C.x+nx*(baseR+capR*0.2),y:C.y+ny*(baseR+capR*0.2)};
    ctx.beginPath(); ctx.arc(capC.x,capC.y,capR,0,Math.PI*2); ctx.fill();
  }

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const bg=ctx.createRadialGradient(C.x,C.y,R*0.2,C.x,C.y,R);
    bg.addColorStop(0,"#2b3246"); bg.addColorStop(1,"#0f1320");
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(C.x,C.y,R,0,Math.PI*2); ctx.fill();

    ctx.lineWidth=R*0.06; ctx.strokeStyle="#3a4256"; ctx.beginPath(); ctx.arc(C.x,C.y,R*0.82,0,Math.PI*2); ctx.stroke();
    const rOuter=R*0.78;
    for(let i=0;i<100;i++){
      const a=angle+i*(2*Math.PI/100), isMajor=i%10===0, isMid=!isMajor&&i%5===0;
      const len=isMajor?R*0.07:isMid?R*0.045:R*0.03;
      const ix=C.x+Math.cos(a)*(rOuter-len), iy=C.y+Math.sin(a)*(rOuter-len);
      const ox=C.x+Math.cos(a)*rOuter, oy=C.y+Math.sin(a)*rOuter;
      ctx.strokeStyle=`rgba(231,236,245,${isMajor?1:isMid?0.75:0.55})`; ctx.lineWidth=isMajor?2.2:isMid?1.8:1.2;
      ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ox,oy); ctx.stroke();
    }

    const hub=ctx.createRadialGradient(C.x-10,C.y-10,10,C.x,C.y,R*0.45);
    hub.addColorStop(0,"#cdd5df"); hub.addColorStop(1,"#6c778c");
    ctx.fillStyle=hub; ctx.beginPath(); ctx.arc(C.x,C.y,R*0.36,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#31394d"; ctx.beginPath(); ctx.arc(C.x,C.y,R*0.035,0,Math.PI*2); ctx.fill();

    drawPointer();
  }

  const totalWeight = PRIZES.reduce((s,p)=>s+p.weight,0);
  function pickWeightedIndex(){
    const r = Math.random(); let s = 0;
    for(let i=0;i<PRIZES.length;i++){ s += PRIZES[i].weight/totalWeight; if(r<=s) return i; }
    return PRIZES.length-1;
  }

  function spinToIndex(index){
    const n=PRIZES.length, step=2*Math.PI/n, targetAngleBase=POINTER_ANGLE-index*step-step/2;
    const turns=6+Math.floor(Math.random()*2), current=angle; let target=targetAngleBase;
    while(target>current-2*Math.PI*turns) target-=2*Math.PI;

    const start=performance.now(), dur=3800;
    const ease=t=>1-Math.pow(1-t,3);
    spinning=true;
    spinBtn.disabled=true;
    safeDoor.classList.remove("open","show");
    canvas.classList.remove('hidden');

    (function loop(now){
      const t = Math.max(0, Math.min(1, (now-start)/dur));
      angle = current + (target-current) * ease(t);
      draw();
      if (t<1){ requestAnimationFrame(loop); }
      else { angle=targetAngleBase; draw(); spinning=false; spinBtn.disabled=false; revealPrize(PRIZES[index]); }
    })(performance.now());
  }

  function prizeMessage(label){
    switch(label){
      case 'Gold Key': return 'You won a Gold Key!';
      case 'Stone Key': return 'You won a Stone Key!';
      case 'Wooden Key': return 'You won a Wooden Key!';
      case 'Combine 2 Keys': return 'Two keys combined!';
      case 'Lose a Key': return 'You lost a random key.';
      case 'Reveal Hint': return 'One wrong lock revealed.';
      case 'Scroll Peek': return 'You peeked at the scroll lock!';
      case 'Reroll': return 'Rerolling…';
      case '+1 Spin': return '+1 Spin! Spin again.';
      default: return label;
    }
  }

  function revealPrize(p){
    // swap prize image with fallback-aware sprite
    const newImg = createSpriteImg(SPRITES[p.label], p.label);
    newImg.id = 'prizeImg';
    const prev = document.getElementById('prizeImg');
    if (prev) prev.replaceWith(newImg);

    // hide the wheel while the door is open
    canvas.classList.add("hidden");
    safeDoor.classList.add("show");
    requestAnimationFrame(()=>safeDoor.classList.add("open"));

    // award prize
    applyPrize(p.label);

    // update button states
    updateButtons();

    // notify + close logic
    const msg = prizeMessage(p.label);
    const CLOSE_DELAY = 1100;

    if (window._wheelAutoReroll) {
      // automatically reroll after a short beat
      setTimeout(() => {
        window._wheelAutoReroll = false;
        safeDoor.classList.remove('open','show');
        canvas.classList.remove('hidden');
        const i = pickWeightedIndex();
        spinToIndex(i);
      }, 950);
      return;
    }

    if (spinsLeft > 0) {
      // got +1 Spin — keep wheel open and let them spin again
      showMessage(msg);
      updateButtons();
    } else {
      // no extra spins — close after a short delay
      setTimeout(() => {
        closeOverlay();
        showMessage(msg);
      }, CLOSE_DELAY);
    }
  }

  function openOverlay(){
    spinsLeft = 1;            // exactly one spin for a new vault trigger
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden','false');
    canvas.classList.remove('hidden');
    safeDoor.classList.remove('open','show');
    draw();
    updateButtons();
  }
  function closeOverlay(){
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden','true');
    spinsLeft = 0;
    window._wheelAutoReroll = false;
  }

  function updateButtons(){
    if (safeDoor.classList.contains('open')) {
      if (spinsLeft > 0) {
        // only true when prize was +1 Spin
        spinBtn.textContent = 'Spin again';
        spinBtn.disabled = false;
        closeBtn.style.display = 'none';
      } else {
        spinBtn.textContent = 'Spin';
        spinBtn.disabled = true;
        closeBtn.style.display = 'inline-flex';
      }
    } else {
      spinBtn.textContent = 'Spin';
      spinBtn.disabled = spinsLeft <= 0;
      closeBtn.style.display = 'none';
    }
  }

  spinBtn.addEventListener('click', ()=>{
    if (spinning) return;

    if (safeDoor.classList.contains('open')) {
      if (spinsLeft > 0) {
        safeDoor.classList.remove('open','show');
        canvas.classList.remove('hidden');
        updateButtons();
      }
      return;
    }

    if (spinsLeft <= 0) return;
    spinsLeft -= 1;             // consume a spin (they start with 1)
    const i = pickWeightedIndex();
    spinToIndex(i);
    updateButtons();
  });

  closeBtn.addEventListener('click', closeOverlay);

  // open function used by game
  window.openPrizeWheel = function(){ openOverlay(); };

  draw();
}

function openPrizeWheel(){ if (typeof window.openPrizeWheel === 'function') window.openPrizeWheel(); }

// apply prize to game state
function applyPrize(label){
  switch(label){
    case 'Gold Key': spawnKey('gold'); break;
    case 'Stone Key': spawnKey('stone'); break;
    case 'Wooden Key': spawnKey('wood'); break;
    case 'Reroll': window._wheelAutoReroll = true; break; // auto-spin again
    case '+1 Spin': spinsLeft += 1; break;                // only +1 Spin grants another spin
    case 'Reveal Hint': openRandomWrong(1); break;
    case 'Scroll Peek': peekScroll(); break;
    case 'Combine 2 Keys': combineTwoKeys(); break;
    case 'Lose a Key': loseRandomKey(); break;
    default: break;
  }
}

function loseRandomKey(){
  const keyGrid = document.getElementById('keys');
  const keys = Array.from(keyGrid.querySelectorAll('.key'));
  if (keys.length === 0) return;
  const k = keys[Math.floor(Math.random()*keys.length)];
  k.classList.add('inv-doomed');
  setTimeout(()=>k.remove(), 240);
}

function combineTwoKeys(){
  const keyGrid = document.getElementById('keys');
  const byType = { wood: [], stone: [], gold: [] };
  keyGrid.querySelectorAll('.key').forEach(k => { if (byType[k.dataset.type]) byType[k.dataset.type].push(k); });

  if (byType.wood.length >= 2){ byType.wood[0].remove(); byType.wood[1].remove(); spawnKey('stone'); return; }
  if (byType.stone.length >= 2){ byType.stone[0].remove(); byType.stone[1].remove(); spawnKey('gold'); return; }
  // fallback if no pair: give a wooden key
  spawnKey('wood');
}

function peekScroll(){
  const wrap = document.getElementById('locks');
  if (!wrap) return;
  const target = Array.from(wrap.querySelectorAll('.lock')).find(l => Number(l.dataset.id) === Number(hiddenLockId));
  if (target){
    target.classList.add('peek');
    setTimeout(()=> target.classList.remove('peek'), 1600);
  }
}
