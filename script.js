let boards = [];
let validWords = [];
let remainingWords = [];
let hiddenLockId = null;
let currentPath = [];
let selectedLetters = [];
let completedBoards = [];
let currentBoard = null;

let lives = 3;
let scrolls = 0;

let resolvingLoss = false;
let isSelecting = false;

let prizeTileIndex = null;

const PRIZES = {
  wood:  { id:'wood',  label:'Wood Key',       color:'#D7B48A', icon:'sprites/key_wood.png',  weight:28 },
  stone: { id:'stone', label:'Stone Key',      color:'#C9CCD3', icon:'sprites/key_stone.png', weight:28 },
  gold:  { id:'gold',  label:'Gold Key',       color:'#FFD24A', icon:'sprites/key_gold.png',  weight:23 },
  pick:  { id:'pick',  label:'Lock Pick',      color:'#8C5A34', icon:'sprites/key_pick.png',  weight:12 },
  lose:  { id:'lose',  label:'Lose a Key',     color:'#F06A6A', icon:null,                     weight: 6 }, // 3×2% visually
  solve: { id:'solve', label:'Reveal Scroll',  color:'#7ED4A6', icon:'sprites/scroll.png',     weight: 3 },
};

/* Visual order around the wheel (equal slices).
   We place “lose” three times so there are three distinct 2% slots. */
const WHEEL_ORDER = ['wood','lose','stone','solve','gold','lose','pick','lose'];

/* Derived helpers */
const WHEEL_VISUAL = WHEEL_ORDER.map(key => PRIZES[key]);          // slices (icon + color)
const TOTAL_WEIGHT = Object.values(PRIZES).reduce((a,p)=>a+p.weight,0);

/* Colors were already specified in CSS for the board, locks, etc. Wheel uses the colors above. */

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
});

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

  markPrizeTile();
  buildDynamicLocks(currentBoard.words);
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
    lock.innerHTML = `<img src="sprites/lock_${type}.png" alt="">`;
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
  const scroll = document.createElement("img");
  scroll.src = "sprites/scroll.png";
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

      const usedPrize = currentPath.some(el => Number(el.dataset.index) === Number(prizeTileIndex));
      markUsedTiles(currentPath);
      if (usedPrize) { prizeTileIndex = null; setTimeout(openPrizeWheel, 0); }
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

function markUsedTiles(tiles) {
  tiles.forEach(el => {
    el.dataset.active = "false";
    el.classList.add("used");
  });
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

  const img = document.createElement("img");
  img.src = `sprites/key_${type}.png`;
  img.className = "key";
  img.dataset.type = type;
  img.draggable = true;

  img.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", img.dataset.type || "key");
    e.dataTransfer.effectAllowed = "move";
    img.classList.add("dragging");
    document.getElementById('smith')?.classList.add('drag-over');
  });
  img.addEventListener("dragend", () => {
    img.classList.remove("dragging");
    document.getElementById('smith')?.classList.remove('drag-over');
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

  [slotA, slotB].forEach slot => {
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
  const dur = document.getElementById('durability');
  const cursor = document.getElementById('dur-cursor');
  const caption = document.getElementById('dur-caption');
  const red = dur.querySelector('.dur-red');
  const green = dur.querySelector('.dur-green');

  const totalWidth = 320;
  red.style.width = `${Math.round(breakOdds * totalWidth)}px`;
  green.style.width = `${Math.round(successChance * totalWidth)}px`;

  cursor.style.left = `0px`;
  caption.textContent = "Checking durability…";
  dur.classList.remove('hidden');

  let dir = 1, pos = 0;
  const speed = 6;
  const interval = setInterval(() => {
    pos += dir * speed;
    if (pos < 0) { pos = 0; dir = 1; }
    if (pos > totalWidth) { pos = totalWidth; dir = -1; }
    cursor.style.left = `${pos}px`;
  }, 16);

  const succeed = Math.random() < successChance;

  setTimeout(() => {
    clearInterval(interval);
    const min = succeed ? Math.round((1 - successChance) * totalWidth) + 6 : 6;
    const max = succeed ? totalWidth - 6 : Math.round((1 - successChance) * totalWidth) - 6;
    const stop = Math.max(6, Math.min(totalWidth-6, Math.floor(min + Math.random()*(max-min))));
    cursor.style.left = `${stop}px`;

    caption.textContent = succeed ? "It holds!" : "It shatters!";
    setTimeout(() => { dur.classList.add('hidden'); resolve(succeed); }, 650);
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
function shuffle(arr){ for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

/* ==================== PRIZE WHEEL ==================== */
function markPrizeTile(){
  const tiles = Array.from(document.querySelectorAll('#letter-grid .letter'));
  if (tiles.length === 0) return;
  tiles.forEach(t => t.classList.remove('prize'));
  prizeTileIndex = Math.floor(Math.random()*tiles.length);
  tiles[prizeTileIndex].classList.add('prize');
}

function buildWheelVisual(){
  const dial  = document.getElementById('wheel-dial');
  const spin  = document.getElementById('wheel-spin');
  if (!dial || !spin) return;

  /* Equal slices; gradient and icons both use the same WHEEL_VISUAL order */
  const N = WHEEL_VISUAL.length;
  const pct = 100 / N;
  const stops = WHEEL_VISUAL.map((seg, i) => {
    const start = i * pct;
    const end   = (i + 1) * pct;
    return `${seg.color} ${start}% ${end}%`;
  }).join(', ');
  dial.style.background = `conic-gradient(from -90deg, ${stops})`;

  /* Clear previous icons */
  dial.querySelectorAll('.wheel-icon').forEach(n => n.remove());

  /* Place icons at slice centers.
     CSS rotate(0deg) points RIGHT, so convert top-based angle to css with -90° */
  const base = 360 / N;
  const radius = 92;
  for (let i=0;i<N;i++){
    const seg = WHEEL_VISUAL[i];
    const centerFromTop = i * base + base/2;
    const cssAngle = centerFromTop - 90;

    const el = document.createElement('div');
    el.className = seg.id === 'lose' ? 'wheel-icon badge' : 'wheel-icon';
    if (seg.id === 'lose'){
      el.textContent = '−1';
    } else if (seg.icon){
      const img = document.createElement('img');
      img.src = seg.icon;
      img.alt = seg.label;
      el.appendChild(img);
    }
    el.style.transform = `translate(-50%,-50%) rotate(${cssAngle}deg) translate(${radius}px) rotate(${-cssAngle}deg)`;
    dial.appendChild(el);
  }

  dial.style.transform = 'rotate(0deg)';
  spin.disabled = false;
}

function openPrizeWheel(){
  const wheel = document.getElementById('wheel');
  const spin  = document.getElementById('wheel-spin');
  if (!wheel || !spin) return;

  buildWheelVisual();
  wheel.classList.remove('hidden');

  spin.onclick = async () => {
    spin.disabled = true;
    await spinWheel();
  };
}

function spinWheel(){
  return new Promise(resolve => {
    const dial  = document.getElementById('wheel-dial');
    const wheel = document.getElementById('wheel');
    if (!dial || !wheel) { resolve(); return; }

    /* Weighted pick (independent of visual order). */
    let r = Math.random() * TOTAL_WEIGHT;
    let outcomeId = 'wood';
    for (const p of Object.values(PRIZES)){
      if ((r -= p.weight) <= 0){ outcomeId = p.id; break; }
    }

    /* Choose which visual slice to land on (handles the 3 separate lose slots). */
    const indices = WHEEL_VISUAL
      .map((seg, i) => seg.id === outcomeId ? i : -1)
      .filter(i => i !== -1);
    const chosenIndex = indices[Math.floor(Math.random()*indices.length)];

    /* Spin so the chosen slice center ends up at the TOP (pointer points down). */
    const N = WHEEL_VISUAL.length;
    const base = 360 / N;
    const centerFromTop = chosenIndex * base + base/2;
    const spins = 4 + Math.floor(Math.random()*3);
    const target = spins*360 - centerFromTop;

    void dial.offsetWidth; // reflow
    dial.style.transform = `rotate(${target}deg)`;

    setTimeout(async () => {
      wheel.classList.add('hidden');
      await applyWheelOutcome(outcomeId);
      maybeCheckLose();
      resolve();
    }, 3400);
  });
}

async function applyWheelOutcome(outcome){
  if (['wood','stone','gold','pick'].includes(outcome)){
    spawnKey(outcome);
    showMessage(`You won a ${outcome === 'pick' ? 'Lock Pick' : outcome[0].toUpperCase()+outcome.slice(1)+' key'}!`);
    return;
  }
  if (outcome === 'solve'){ revealScrollByPower(); return; }
  if (outcome === 'lose'){ await loseRandomInventoryKey(); return; }
}

function revealScrollByPower(){
  const lock = document.querySelector(`.lock[data-id="${hiddenLockId}"]`);
  if (!lock) return;
  lock.classList.add('jiggle');
  const scroll = document.createElement("img");
  scroll.src = "sprites/scroll.png";
  scroll.style.position = "absolute";
  scroll.style.top = "0";
  scroll.style.left = "0";
  scroll.style.width = "100%";
  lock.appendChild(scroll);
  showMessage("The scroll has been revealed!");
  setTimeout(() => resetGame(), 1200);
}

function loseRandomInventoryKey(){
  return new Promise(resolve => {
    const keys = Array.from(document.querySelectorAll('#keys .key'));
    if (keys.length === 0){ showMessage("No keys to lose!"); resolve(); return; }
    keys.forEach(k => { k.classList.remove('inv-dim'); k.classList.add('inv-lit'); });

    let pool = keys.slice();
    const step = () => {
      if (pool.length <= 1){
        const doomed = pool[0];
        if (doomed){
          doomed.classList.remove('inv-lit');
          doomed.classList.add('inv-doomed');
          setTimeout(() => {
            doomed.remove();
            keys.forEach(k => k.classList.remove('inv-lit','inv-dim','inv-doomed'));
            resolve();
          }, 260);
        } else { resolve(); }
        return;
      }
      const i = Math.floor(Math.random()*pool.length);
      const x = pool.splice(i,1)[0];
      x.classList.remove('inv-lit');
      x.classList.add('inv-dim');
      setTimeout(step, 140);
    };
    setTimeout(step, 180);
  });
}
